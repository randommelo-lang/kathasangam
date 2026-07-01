import { execSync } from 'child_process';
import http from 'http';

function checkServerReady() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/', (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.end();
  });
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function globalSetup() {
  console.log('--> Running global setup: inserting test user...');
  try {
    execSync('python tests/helpers/insert_test_user.py', { stdio: 'inherit' });
    console.log('--> Global setup: waiting for backend server to be ready on http://127.0.0.1:3000 ...');
    
    let isReady = false;
    for (let attempt = 1; attempt <= 20; attempt++) {
      isReady = await checkServerReady();
      if (isReady) {
        console.log(`--> Backend server is ready! (Attempt ${attempt})`);
        break;
      }
      await delay(1000);
    }
    
    if (!isReady) {
      console.warn('--> Warning: Backend server not responding on http://127.0.0.1:3000. Proceeding anyway...');
    }
    
    console.log('--> Global setup completed successfully!');
  } catch (error) {
    console.error('--> Global setup failed:', error);
    throw error;
  }
}
