import { v4 as uuidv4 } from 'uuid';
import { ExportJob, ExportJobRequest } from './types';

class ExportJobStore {
  private jobs: Map<string, ExportJob> = new Map();

  createJob(request: ExportJobRequest): ExportJob {
    const job: ExportJob = {
      id: uuidv4(),
      format: request.format,
      columns: request.columns,
      compression: request.compression,
      status: 'pending',
      createdAt: new Date(),
    };

    this.jobs.set(job.id, job);
    return job;
  }

  getJob(id: string): ExportJob | undefined {
    return this.jobs.get(id);
  }

  updateJobStatus(
    id: string,
    status: 'pending' | 'in_progress' | 'completed' | 'failed',
    error?: string
  ): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = status;
      if (status === 'completed' || status === 'failed') {
        job.completedAt = new Date();
      }
      if (error) {
        job.error = error;
      }
    }
  }

  deleteJob(id: string): void {
    this.jobs.delete(id);
  }

  getAllJobs(): ExportJob[] {
    return Array.from(this.jobs.values());
  }
}

export const jobStore = new ExportJobStore();
