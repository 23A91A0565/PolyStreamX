import { Readable, PassThrough } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { queryStream } from '../database';
import { StreamExporterOptions, ColumnMapping } from '../types';
import { selectColumns } from '../utils';

// Using a simple Parquet writer approach
// Note: For production, consider using Apache Arrow or pyarrow
// This implementation writes a simple columnar format

export async function createParquetStream(options: StreamExporterOptions): Promise<Readable> {
  const passThrough = new PassThrough();
  const { columns } = options;
  const rowLimit = Math.max(
    0,
    Math.floor(Number(options.rowLimit ?? process.env.EXPORT_ROW_LIMIT ?? 0))
  );
  const limitClause = rowLimit > 0 ? ` LIMIT ${rowLimit}` : '';

  const tempDir = path.join(os.tmpdir(), `parquet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const tempFile = path.join(tempDir, 'data.parquet');

  (async () => {
    let iterator: any = null;
    
    try {
      // For true Parquet support, we need to use a library like parquetjs
      // This implementation writes a simplified format that includes schema and data
      
      // Initialize writer with schema information
      const schema = getParquetSchema(columns);
      
      // Collect batches and write to file
      const batches: any[][] = [];
      let rowCount = 0;

      iterator = await queryStream(
        `SELECT ${columns.map(c => c.source).join(', ')} FROM records${limitClause}`,
        [],
        50000 // Larger batch size for Parquet
      );

      for await (const batch of iterator as any) {
        const processedBatch = (batch as any[]).map((row: any) => {
          const selectedRow = selectColumns(row, columns);
          return columns.map(col => selectedRow[col.target]);
        });
        
        batches.push(...processedBatch);
        rowCount += batch.length;

        // Write batches incrementally to avoid memory overflow
        if (batches.length >= 100000) {
          // In production, write row groups to file here
          await writeBatch(tempFile, batches, schema);
          batches.length = 0;
        }

        if (rowCount % 100000 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      // Write remaining batches
      if (batches.length > 0) {
        await writeBatch(tempFile, batches, schema);
      }

      // Stream the file to client
      const fileStream = fs.createReadStream(tempFile);
      fileStream.pipe(passThrough);
      
      fileStream.on('end', () => {
        // Clean up temp file
        fs.rm(tempDir, { recursive: true, force: true }, () => {});
      });

      fileStream.on('error', (error) => {
        passThrough.destroy(error);
        fs.rm(tempDir, { recursive: true, force: true }, () => {});
      });

    } catch (error) {
      passThrough.destroy(error as Error);
      fs.rm(tempDir, { recursive: true, force: true }, () => {});
    }
  })();

  return passThrough;
}

function getParquetSchema(columns: ColumnMapping[]): Record<string, string> {
  const schema: Record<string, string> = {};
  for (const col of columns) {
    schema[col.target] = 'STRING'; // Simplified: treat all as string for now
  }
  return schema;
}

async function writeBatch(filePath: string, batch: any[][], schema: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath, { flags: 'a' });
    
    stream.on('finish', resolve);
    stream.on('error', reject);

    // Write batch data in a simplified format
    for (const row of batch) {
      const rowData = JSON.stringify(row) + '\n';
      stream.write(rowData);
    }

    stream.end();
  });
}
