import { execSync } from 'child_process';

/**
 * Global setup for E2E tests
 * Verifies Docker containers are running before starting tests
 */
export default async function globalSetup() {
  console.log('[E2E Setup] Checking Docker containers...');
  
  try {
    // Check if frontend is responding
    execSync('curl -sf http://localhost:5173/health || curl -sf http://localhost:5173', { 
      timeout: 5000,
      stdio: 'pipe'
    });
    console.log('[E2E Setup] Frontend (Docker) is running on port 5173');
  } catch {
    console.error('[E2E Setup] ERROR: Frontend not found on port 5173');
    console.error('[E2E Setup] Run: docker-compose up -d');
    process.exit(1);
  }
  
  try {
    // Check if API is responding
    execSync('curl -sf http://localhost:8080/health', { 
      timeout: 5000,
      stdio: 'pipe'
    });
    console.log('[E2E Setup] API (Docker) is running on port 8080');
  } catch {
    console.error('[E2E Setup] ERROR: API not found on port 8080');
    process.exit(1);
  }
  
  console.log('[E2E Setup] All Docker containers ready!');
}
