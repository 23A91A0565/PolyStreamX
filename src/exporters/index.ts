import { Readable } from 'stream';
import { ExportFormat, StreamExporterOptions } from '../types';
import { createCsvStream } from './csv';
import { createJsonStream } from './json';
import { createXmlStream } from './xml';
import { createParquetStream } from './parquet';

export async function createExportStream(
  format: ExportFormat,
  options: StreamExporterOptions
): Promise<Readable> {
  switch (format) {
    case 'csv':
      return createCsvStream(options);
    case 'json':
      return createJsonStream(options);
    case 'xml':
      return createXmlStream(options);
    case 'parquet':
      return createParquetStream(options);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

export function getContentType(format: ExportFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'json':
      return 'application/json';
    case 'xml':
      return 'application/xml';
    case 'parquet':
      return 'application/octet-stream';
    default:
      return 'application/octet-stream';
  }
}

export function getFileExtension(format: ExportFormat): string {
  switch (format) {
    case 'csv':
      return 'csv';
    case 'json':
      return 'json';
    case 'xml':
      return 'xml';
    case 'parquet':
      return 'parquet';
    default:
      return 'bin';
  }
}
