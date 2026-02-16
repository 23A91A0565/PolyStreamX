import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ExportJobRequest, ExportFormat, BenchmarkResponse, BenchmarkResult } from '../types';
import { jobStore } from '../store';
import { createExportStream, getContentType, getFileExtension } from '../exporters';
import { createGzipTransform, getMemoryUsageMB } from '../utils';
import { getTableRowCount } from '../database';

const router = Router();

// Validate format
function isValidFormat(format: any): format is ExportFormat {
  return ['csv', 'json', 'xml', 'parquet'].includes(format);
}

// Helper function to run a benchmark
async function benchmarkFormat(
  format: 'csv' | 'json' | 'xml' | 'parquet',
  columnMapping: Array<{ source: string; target: string }>
): Promise<BenchmarkResult> {
  const benchmarkRowLimit = Math.max(
    0,
    Math.floor(Number(process.env.BENCHMARK_ROW_LIMIT || 0))
  );
  const tempDir = path.join(os.tmpdir(), `bench_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const filePath = path.join(tempDir, `export.${getFileExtension(format)}`);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const startTime = Date.now();
  const initialMemory = await getMemoryUsageMB();
  let peakMemory = initialMemory;

  try {
    // Create export stream
    const stream = await createExportStream(format, {
      columns: columnMapping,
      compression: undefined,
      rowLimit: benchmarkRowLimit > 0 ? benchmarkRowLimit : undefined,
    });

    // Write to file
    const fileStream = fs.createWriteStream(filePath);

    return new Promise((resolve, reject) => {
      stream.pipe(fileStream);

      fileStream.on('finish', () => {
        // Calculate metrics
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000; // Convert to seconds
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;

        // Get peak memory (approximate)
        peakMemory = Math.max(peakMemory, process.memoryUsage().heapUsed / 1024 / 1024);

        const result: BenchmarkResult = {
          format,
          durationSeconds: Math.round(duration * 100) / 100,
          fileSizeBytes: fileSize,
          peakMemoryMB: Math.round(peakMemory * 100) / 100,
        };

        // Clean up
        fs.rm(tempDir, { recursive: true, force: true }, () => {});

        resolve(result);
      });

      fileStream.on('error', reject);
      stream.on('error', reject);
    });
  } catch (error) {
    // Clean up on error
    fs.rm(tempDir, { recursive: true, force: true }, () => {});
    throw error;
  }
}

// Force garbage collection if available
function forceGC(): void {
  if (global.gc) {
    global.gc();
  }
}

// POST /exports - Create export job
router.post('/', (req: Request, res: Response) => {
  try {
    const { format, columns, compression } = req.body as ExportJobRequest;

    // Validate request
    if (!format || !isValidFormat(format)) {
      return res.status(400).json({
        error: 'Invalid or missing format. Must be one of: csv, json, xml, parquet',
      });
    }

    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({
        error: 'Columns must be a non-empty array',
      });
    }

    // Validate column mappings
    for (const col of columns) {
      if (!col.source || !col.target) {
        return res.status(400).json({
          error: 'Each column must have source and target properties',
        });
      }
    }

    if (compression && compression !== 'gzip') {
      return res.status(400).json({
        error: 'Invalid compression. Must be gzip or omitted',
      });
    }

    // Create job
    const job = jobStore.createJob({ format, columns, compression });

    res.status(201).json({
      exportId: job.id,
      status: job.status,
    });
  } catch (error) {
    console.error('Error creating export job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /exports/:exportId/download - Download export
router.get('/:exportId/download', async (req: Request, res: Response) => {
  try {
    const { exportId } = req.params;

    // Get job
    const job = jobStore.getJob(exportId);
    if (!job) {
      return res.status(404).json({ error: 'Export job not found' });
    }

    // Update status
    jobStore.updateJobStatus(exportId, 'in_progress');

    // Set response headers
    const contentType = getContentType(job.format);
    const fileExtension = getFileExtension(job.format);
    const filename = `export_${exportId}.${fileExtension}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    if (job.compression === 'gzip') {
      res.setHeader('Content-Encoding', 'gzip');
    }

    // Create export stream
    const dataStream = await createExportStream(job.format, {
      columns: job.columns,
      compression: job.compression,
    });

    // Apply compression if needed
    let outputStream: any = dataStream;
    if (job.compression === 'gzip') {
      const gzipTransform = createGzipTransform('gzip');
      if (gzipTransform) {
        outputStream = dataStream.pipe(gzipTransform);
      }
    }

    // Stream to response
    outputStream.pipe(res);

    // Handle completion
    outputStream.on('end', () => {
      jobStore.updateJobStatus(exportId, 'completed');
    });

    // Handle errors
    outputStream.on('error', (error: Error) => {
      console.error(`Error streaming export ${exportId}:`, error);
      jobStore.updateJobStatus(exportId, 'failed', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Streaming error' });
      } else {
        res.end();
      }
    });

    dataStream.on('error', (error: Error) => {
      console.error(`Error creating export stream ${exportId}:`, error);
      jobStore.updateJobStatus(exportId, 'failed', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Export generation error' });
      } else {
        res.end();
      }
    });

  } catch (error) {
    console.error('Error downloading export:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.end();
    }
  }
});

// GET /exports/benchmark - Run performance benchmarks
router.get('/benchmark', async (req: Request, res: Response) => {
  try {
    console.log('Starting benchmark...');

    // Get dataset size
    const datasetRowCount = await getTableRowCount('records');

    if (datasetRowCount === 0) {
      return res.status(500).json({
        error: 'Database is empty. Seeding may have failed.',
      });
    }

    // Define column mapping for all records
    const columnMapping = [
      { source: 'id', target: 'id' },
      { source: 'created_at', target: 'created_at' },
      { source: 'name', target: 'name' },
      { source: 'value', target: 'value' },
      { source: 'metadata', target: 'metadata' },
    ];

    // Run benchmarks for each format
    const results: BenchmarkResult[] = [];
    const formats: Array<'csv' | 'json' | 'xml' | 'parquet'> = ['csv', 'json', 'xml', 'parquet'];

    for (const format of formats) {
      console.log(`Benchmarking ${format}...`);
      
      // Force GC before each test
      forceGC();
      
      // Add delay between tests to let system settle
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        const result = await benchmarkFormat(format, columnMapping);
        results.push(result);
        console.log(`${format}: ${result.durationSeconds}s, ${result.fileSizeBytes} bytes, ${result.peakMemoryMB}MB`);
      } catch (error) {
        console.error(`Error benchmarking ${format}:`, error);
        // Continue with other formats
      }
    }

    if (results.length === 0) {
      return res.status(500).json({
        error: 'All benchmarks failed',
      });
    }

    const response: BenchmarkResponse = {
      datasetRowCount,
      results,
    };

    res.json(response);
  } catch (error) {
    console.error('Error running benchmarks:', error);
    res.status(500).json({ error: 'Benchmark failed' });
  }
});

export default router;
