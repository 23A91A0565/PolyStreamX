import { Pool, PoolClient } from 'pg';

const databaseUrl = process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/exports_db';

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export async function getConnection(): Promise<PoolClient> {
  return pool.connect();
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export async function queryStream(
  query: string,
  params: any[] = [],
  batchSize: number = 10000
) {
  const client = await getConnection();
  
  try {
    // Start a transaction for cursor operations
    await client.query('BEGIN');
    
    // Use a cursor for efficient streaming
    const cursorName = `cursor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await client.query(`DECLARE ${cursorName} CURSOR FOR ${query}`, params);
    
    return {
      client,
      cursorName,
      batchSize,
      async *[Symbol.asyncIterator]() {
        try {
          while (true) {
            const result = await client.query(`FETCH ${batchSize} FROM ${cursorName}`);
            if (result.rows.length === 0) break;
            yield result.rows;
          }
        } finally {
          await client.query(`CLOSE ${cursorName}`);
          await client.query('COMMIT');
          client.release();
        }
      },
    };
  } catch (error) {
    client.release();
    throw error;
  }
}

export async function getTableRowCount(tableName: string): Promise<number> {
  const client = await getConnection();
  try {
    const result = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    return parseInt(result.rows[0].count, 10);
  } finally {
    client.release();
  }
}
