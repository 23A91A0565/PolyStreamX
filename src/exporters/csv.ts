import { Readable, PassThrough } from 'stream';
import { queryStream } from '../database';
import { StreamExporterOptions, ColumnMapping } from '../types';
import { escapeCsvValue, flattenJsonValue, selectColumns } from '../utils';

export async function createCsvStream(options: StreamExporterOptions): Promise<Readable> {
  const passThrough = new PassThrough();
  const { columns, compression } = options;
  const rowLimit = Math.max(
    0,
    Math.floor(Number(options.rowLimit ?? process.env.EXPORT_ROW_LIMIT ?? 0))
  );
  const limitClause = rowLimit > 0 ? ` LIMIT ${rowLimit}` : '';

  // Write CSV header
  const headerRow = columns.map(col => col.target).join(',');
  passThrough.write(headerRow + '\n');

  // Stream data from database
  (async () => {
    let rowCount = 0;
    
    try {
      const iterator = await queryStream(
        `SELECT ${columns.map(c => c.source).join(', ')} FROM records${limitClause}`
      );

      for await (const batch of iterator as any) {
        for (const row of batch) {
          const selectedRow = selectColumns(row, columns);
          const csvRow = Object.values(selectedRow)
            .map(value => escapeCsvValue(flattenJsonValue(value)))
            .join(',');
          
          passThrough.write(csvRow + '\n');
          rowCount++;

          // Yield to event loop periodically to prevent blocking
          if (rowCount % 10000 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }
      }

      passThrough.end();
    } catch (error) {
      passThrough.destroy(error as Error);
    }
  })();

  return passThrough;
}
