import { execSync } from 'child_process';

export default async function globalTeardown() {
  console.log('--> Running global teardown: cleaning up test playwright user...');
  try {
    execSync('python scratch/cleanup_testplaywright.py', { stdio: 'inherit' });
    console.log('--> Global teardown completed successfully!');
  } catch (error) {
    console.error('--> Global teardown failed:', error);
  }
}
