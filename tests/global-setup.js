import { execSync } from 'child_process';

export default async function globalSetup() {
  console.log('--> Running global setup: inserting test user...');
  try {
    execSync('python scratch/insert_test_user.py', { stdio: 'inherit' });
    console.log('--> Global setup completed successfully!');
  } catch (error) {
    console.error('--> Global setup failed:', error);
    throw error;
  }
}
