export type ExportFormat = 'csv' | 'json' | 'xml' | 'parquet';
export type CompressionType = 'gzip' | undefined;

export interface ColumnMapping {
  source: string;
  target: string;
}

export interface ExportJobRequest {
  format: ExportFormat;
  columns: ColumnMapping[];
  compression?: CompressionType;
}

export interface ExportJob {
  id: string;
  format: ExportFormat;
  columns: ColumnMapping[];
  compression?: CompressionType;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface BenchmarkResult {
  format: ExportFormat;
  durationSeconds: number;
  fileSizeBytes: number;
  peakMemoryMB: number;
}

export interface BenchmarkResponse {
  datasetRowCount: number;
  results: BenchmarkResult[];
}

export interface ExportResponse {
  exportId: string;
  status: string;
}

export interface StreamExporterOptions {
  columns: ColumnMapping[];
  compression?: CompressionType;
  rowLimit?: number;
}
