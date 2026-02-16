import axios, { AxiosError } from 'axios';

const BASE_URL = process.env.API_URL || 'http://localhost:8080';
const client = axios.create({ baseURL: BASE_URL, timeout: 30000 });

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`✓ ${name} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof AxiosError ? error.message : String(error);
    results.push({ name, passed: false, duration, error: message });
    console.log(`✗ ${name} - ${message}`);
  }
}

async function runTests() {
  console.log('\n📊 PolyStream Data Export Engine - Test Suite\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  // Test 1: Health Check
  await test('Health Check', async () => {
    const response = await client.get('/health');
    if (response.status !== 200) throw new Error('Expected status 200');
    if (!response.data.status || response.data.status !== 'healthy') {
      throw new Error('Expected healthy status');
    }
  });

  // Test 2: Create CSV Export Job
  let csvExportId = '';
  await test('Create CSV Export Job', async () => {
    const response = await client.post('/exports', {
      format: 'csv',
      columns: [
        { source: 'id', target: 'ID' },
        { source: 'name', target: 'Name' },
        { source: 'value', target: 'Value' },
      ],
    });
    
    if (response.status !== 201) throw new Error(`Expected status 201, got ${response.status}`);
    if (!response.data.exportId) throw new Error('Missing exportId');
    if (!response.data.status) throw new Error('Missing status');
    
    csvExportId = response.data.exportId;
  });

  // Test 3: Download CSV Export
  if (csvExportId) {
    await test('Download CSV Export', async () => {
      const response = await client.get(`/exports/${csvExportId}/download`, {
        responseType: 'stream',
      });
      
      if (response.status !== 200) throw new Error(`Expected status 200`);
      if (response.headers['content-type'] !== 'text/csv') {
        throw new Error('Expected content-type: text/csv');
      }
      if (!response.headers['content-disposition']) {
        throw new Error('Missing content-disposition header');
      }
      
      // Verify stream is readable
      await new Promise((resolve, reject) => {
        let lineCount = 0;
        response.data.on('data', (chunk: Buffer) => {
          lineCount += chunk.toString().split('\n').length - 1;
        });
        response.data.on('end', () => resolve(null));
        response.data.on('error', reject);
      });
    });
  }

  // Test 4: Create JSON Export Job
  let jsonExportId = '';
  await test('Create JSON Export Job', async () => {
    const response = await client.post('/exports', {
      format: 'json',
      columns: [
        { source: 'id', target: 'id' },
        { source: 'name', target: 'name' },
        { source: 'metadata', target: 'metadata' },
      ],
    });
    
    if (response.status !== 201) throw new Error(`Expected status 201`);
    jsonExportId = response.data.exportId;
  });

  // Test 5: Download JSON Export
  if (jsonExportId) {
    await test('Download JSON Export', async () => {
      const response = await client.get(`/exports/${jsonExportId}/download`, {
        responseType: 'stream',
      });
      
      if (response.status !== 200) throw new Error(`Expected status 200`);
      if (response.headers['content-type'] !== 'application/json') {
        throw new Error('Expected content-type: application/json');
      }
    });
  }

  // Test 6: Create XML Export Job
  let xmlExportId = '';
  await test('Create XML Export Job', async () => {
    const response = await client.post('/exports', {
      format: 'xml',
      columns: [
        { source: 'id', target: 'id' },
        { source: 'name', target: 'name' },
      ],
    });
    
    if (response.status !== 201) throw new Error(`Expected status 201`);
    xmlExportId = response.data.exportId;
  });

  // Test 7: Download XML Export
  if (xmlExportId) {
    await test('Download XML Export', async () => {
      const response = await client.get(`/exports/${xmlExportId}/download`, {
        responseType: 'stream',
      });
      
      if (response.status !== 200) throw new Error(`Expected status 200`);
      if (response.headers['content-type'] !== 'application/xml') {
        throw new Error('Expected content-type: application/xml');
      }
    });
  }

  // Test 8: Create Parquet Export Job
  let parquetExportId = '';
  await test('Create Parquet Export Job', async () => {
    const response = await client.post('/exports', {
      format: 'parquet',
      columns: [
        { source: 'id', target: 'id' },
        { source: 'name', target: 'name' },
        { source: 'value', target: 'value' },
      ],
    });
    
    if (response.status !== 201) throw new Error(`Expected status 201`);
    parquetExportId = response.data.exportId;
  });

  // Test 9: Download Parquet Export
  if (parquetExportId) {
    await test('Download Parquet Export', async () => {
      const response = await client.get(`/exports/${parquetExportId}/download`, {
        responseType: 'stream',
      });
      
      if (response.status !== 200) throw new Error(`Expected status 200`);
      const contentType = response.headers['content-type'];
      if (contentType !== 'application/octet-stream' && contentType !== 'application/vnd.apache.parquet') {
        throw new Error(`Expected parquet content-type, got ${contentType}`);
      }
    });
  }

  // Test 10: Test gzip Compression
  let gzipExportId = '';
  await test('Create CSV Export with Gzip Compression', async () => {
    const response = await client.post('/exports', {
      format: 'csv',
      columns: [
        { source: 'id', target: 'ID' },
        { source: 'name', target: 'Name' },
      ],
      compression: 'gzip',
    });
    
    if (response.status !== 201) throw new Error(`Expected status 201`);
    gzipExportId = response.data.exportId;
  });

  if (gzipExportId) {
    await test('Download Gzipped Export', async () => {
      const response = await client.get(`/exports/${gzipExportId}/download`, {
        responseType: 'stream',
        decompress: false,
      });
      
      if (response.status !== 200) throw new Error(`Expected status 200`);
      if (response.headers['content-encoding'] !== 'gzip') {
        throw new Error('Expected content-encoding: gzip');
      }
    });
  }

  // Test 11: Invalid Export Format
  await test('Reject Invalid Export Format', async () => {
    try {
      await client.post('/exports', {
        format: 'invalid',
        columns: [{ source: 'id', target: 'id' }],
      });
      throw new Error('Should have rejected invalid format');
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 400) {
        return; // Expected
      }
      throw error;
    }
  });

  // Test 12: Missing Required Columns
  await test('Reject Missing Columns', async () => {
    try {
      await client.post('/exports', {
        format: 'csv',
        columns: [],
      });
      throw new Error('Should have rejected empty columns');
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 400) {
        return; // Expected
      }
      throw error;
    }
  });

  // Test 13: Non-existent Export ID
  await test('Handle Non-existent Export ID', async () => {
    try {
      await client.get('/exports/00000000-0000-0000-0000-000000000000/download');
      throw new Error('Should have returned 404');
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return; // Expected
      }
      throw error;
    }
  });

  // Test 14: Benchmark Endpoint (optional, may take time)
  await test('Benchmark Endpoint (Check Schema)', async () => {
    const response = await client.get('/exports/benchmark', {
      timeout: 60000, // 1 minute timeout
    });
    
    if (response.status !== 200) throw new Error(`Expected status 200`);
    if (!response.data.datasetRowCount) throw new Error('Missing datasetRowCount');
    if (!Array.isArray(response.data.results)) throw new Error('Missing results array');
    
    // Verify all formats are present
    const formats = response.data.results.map((r: any) => r.format);
    const expectedFormats = ['csv', 'json', 'xml', 'parquet'];
    for (const fmt of expectedFormats) {
      if (!formats.includes(fmt)) throw new Error(`Missing format: ${fmt}`);
    }
  });

  // Print summary
  console.log('\n' + '='.repeat(50));
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = Math.round((passed / total) * 100);
  
  console.log(`\nTest Results: ${passed}/${total} passed (${percentage}%)`);
  
  if (passed < total) {
    console.log('\nFailed Tests:');
    results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  process.exit(passed === total ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});
