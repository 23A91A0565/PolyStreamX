import express, { Request, Response } from 'express';
import exportsRouter from './routes/exports';
import { pool } from './database';

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());

// Logging middleware
app.use((req: Request, res: Response, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/exports', exportsRouter);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'PolyStream Data Export Engine',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      createExport: 'POST /exports',
      downloadExport: 'GET /exports/{exportId}/download',
      benchmark: 'GET /exports/benchmark',
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database connection on startup
async function startServer() {
  try {
    // Test database connection
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✓ Database connected:', result.rows[0].now);

    // Check if records table exists and has data
    const countResult = await client.query('SELECT COUNT(*) FROM records');
    const count = parseInt(countResult.rows[0].count, 10);
    console.log(`✓ Records table has ${count} rows`);
    client.release();

    // Start server
    app.listen(PORT, () => {
      console.log(`\n✓ PolyStream Data Export Engine listening on port ${PORT}`);
      console.log(`\nAPI Documentation:`);
      console.log(`  • Health Check: http://localhost:${PORT}/health`);
      console.log(`  • Create Export: POST http://localhost:${PORT}/exports`);
      console.log(`  • Download Export: GET http://localhost:${PORT}/exports/{exportId}/download`);
      console.log(`  • Benchmark: GET http://localhost:${PORT}/exports/benchmark\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

export default app;
