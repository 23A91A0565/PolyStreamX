import { Readable, PassThrough } from 'stream';
import { queryStream } from '../database';
import { StreamExporterOptions } from '../types';
import { selectColumns } from '../utils';

export async function createJsonStream(options: StreamExporterOptions): Promise<Readable> {
  const passThrough = new PassThrough();
  const { columns } = options;
  const rowLimit = Math.max(
    0,
    Math.floor(Number(options.rowLimit ?? process.env.EXPORT_ROW_LIMIT ?? 0))
  );
  const limitClause = rowLimit > 0 ? ` LIMIT ${rowLimit}` : '';

  // Start JSON array
  passThrough.write('[\n');

  let firstRow = true;
  let rowCount = 0;

  (async () => {
    try {
      const iterator = await queryStream(
        `SELECT ${columns.map(c => c.source).join(', ')} FROM records${limitClause}`
      );

      for await (const batch of iterator as any) {
        for (const row of batch) {
          const selectedRow = selectColumns(row, columns);
          
          // Add comma before each row except the first
          if (!firstRow) {
            passThrough.write(',\n');
          }
          
          passThrough.write(JSON.stringify(selectedRow));
          firstRow = false;
          rowCount++;

          // Yield to event loop periodically
          if (rowCount % 10000 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }
      }

      passThrough.write('\n]');
      passThrough.end();
    } catch (error) {
      passThrough.destroy(error as Error);
    }
  })();

  return passThrough;
}
