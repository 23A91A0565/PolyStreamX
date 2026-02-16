import { Readable, PassThrough } from 'stream';
import { queryStream } from '../database';
import { StreamExporterOptions } from '../types';
import { selectColumns, sanitizeXmlValue, sanitizeXmlTag } from '../utils';

export async function createXmlStream(options: StreamExporterOptions): Promise<Readable> {
  const passThrough = new PassThrough();
  const { columns } = options;
  const rowLimit = Math.max(
    0,
    Math.floor(Number(options.rowLimit ?? process.env.EXPORT_ROW_LIMIT ?? 0))
  );
  const limitClause = rowLimit > 0 ? ` LIMIT ${rowLimit}` : '';

  // Write XML declaration
  passThrough.write('<?xml version="1.0" encoding="UTF-8"?>\n');
  passThrough.write('<records>\n');

  let rowCount = 0;

  (async () => {
    try {
      const iterator = await queryStream(
        `SELECT ${columns.map(c => c.source).join(', ')} FROM records${limitClause}`
      );

      for await (const batch of iterator as any) {
        for (const row of batch) {
          const selectedRow = selectColumns(row, columns);
          
          // Write opening record tag
          passThrough.write('  <record>\n');
          
          // Write each field
          for (const [key, value] of Object.entries(selectedRow)) {
            const tagName = sanitizeXmlTag(key);
            const tagValue = sanitizeXmlValue(formatXmlValue(value));
            
            if (typeof value === 'object' && value !== null) {
              // Handle nested objects as nested XML
              passThrough.write(`    <${tagName}>\n`);
              writeXmlObject(passThrough, value, 6);
              passThrough.write(`    </${tagName}>\n`);
            } else {
              passThrough.write(`    <${tagName}>${tagValue}</${tagName}>\n`);
            }
          }
          
          // Write closing record tag
          passThrough.write('  </record>\n');
          rowCount++;

          // Yield to event loop periodically
          if (rowCount % 10000 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }
      }

      passThrough.write('</records>');
      passThrough.end();
    } catch (error) {
      passThrough.destroy(error as Error);
    }
  })();

  return passThrough;
}

function formatXmlValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

function writeXmlObject(stream: PassThrough, obj: any, indent: number): void {
  const indentStr = ' '.repeat(indent);
  
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const tag = sanitizeXmlTag(`item_${index}`);
      if (typeof item === 'object' && item !== null) {
        stream.write(`${indentStr}<${tag}>\n`);
        writeXmlObject(stream, item, indent + 2);
        stream.write(`${indentStr}</${tag}>\n`);
      } else {
        const value = sanitizeXmlValue(formatXmlValue(item));
        stream.write(`${indentStr}<${tag}>${value}</${tag}>\n`);
      }
    });
  } else if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const tag = sanitizeXmlTag(key);
      if (typeof value === 'object' && value !== null) {
        stream.write(`${indentStr}<${tag}>\n`);
        writeXmlObject(stream, value, indent + 2);
        stream.write(`${indentStr}</${tag}>\n`);
      } else {
        const formatted = sanitizeXmlValue(formatXmlValue(value));
        stream.write(`${indentStr}<${tag}>${formatted}</${tag}>\n`);
      }
    }
  }
}
