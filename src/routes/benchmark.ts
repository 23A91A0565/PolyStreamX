import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BenchmarkResponse, BenchmarkResult } from '../types';
import { createExportStream, getFileExtension } from '../exporters';
import { getTableRowCount } from '../database';
import { getMemoryUsageMB } from '../utils';

const router = Router();

// Helper function to run a benchmark
async function benchmarkFormat(
  format: 'csv' | 'json' | 'xml' | 'parquet',
  columnMapping: Array<{ source: string; target: string }>
): Promise<BenchmarkResult> {
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

// GET /exports/benchmark - Run performance benchmarks
router.get('/', async (req: Request, res: Response) => {
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
