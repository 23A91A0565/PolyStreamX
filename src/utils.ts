import { Transform } from 'stream';
import * as zlib from 'zlib';
import { CompressionType } from './types';

export function createGzipTransform(compression?: CompressionType): Transform | null {
  if (compression === 'gzip') {
    return zlib.createGzip({ level: zlib.Z_DEFAULT_COMPRESSION });
  }
  return null;
}

export function flattenJsonValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function sanitizeXmlValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function sanitizeXmlTag(tag: string): string {
  // Remove invalid XML tag characters and ensure it starts with a letter
  let sanitized = tag.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (/^[0-9]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }
  return sanitized;
}

export function selectColumns(row: any, columns: Array<{ source: string; target: string }>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const { source, target } of columns) {
    result[target] = row[source];
  }
  return result;
}

export async function getMemoryUsageMB(): Promise<number> {
  const memUsage = process.memoryUsage();
  return Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100;
}
