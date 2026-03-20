import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://enlite_test:test_password@localhost:5433/enlite_test';

export async function setupTestDatabase() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log('🔧 Setting up test database...');

    // Limpar dados de testes anteriores
    await pool.query('TRUNCATE workers, worker_quiz_responses, worker_service_areas, worker_availability, worker_index CASCADE');

    console.log('✅ Test database ready');
  } catch (error) {
    console.error('❌ Failed to setup test database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

export async function teardownTestDatabase() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log('🧹 Cleaning up test database...');
    await pool.query('TRUNCATE workers, worker_quiz_responses, worker_service_areas, worker_availability, worker_index CASCADE');
    console.log('✅ Test database cleaned');
  } catch (error) {
    console.error('❌ Failed to cleanup test database:', error);
  } finally {
    await pool.end();
  }
}

// Setup global
beforeAll(async () => {
  await setupTestDatabase();
});

// Teardown global
afterAll(async () => {
  await teardownTestDatabase();
});
