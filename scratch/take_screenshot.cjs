const { chromium } = require('playwright');
const path = require('path');

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Set viewport size matching a common desktop
  await page.setViewportSize({ width: 1280, height: 800 });

  // 1. Go to app and log in
  await page.goto('http://localhost:3000/');
  await page.click('#signInBtn');
  await page.fill('#loginForm input[name="email"]', 'testplaywright@example.com');
  await page.fill('#loginForm input[name="password"]', 'Password123!');
  await page.click('#loginForm button[type="submit"]');
  await page.waitForSelector('.account-trigger');

  // 2. Go to the discover page and find the first story card
  await page.goto('http://localhost:3000/#discover');
  await page.waitForSelector('.story-card');
  
  // Click first story card cover
  await page.locator('.story-card .cover-button').first().click();
  await page.waitForURL(/#story/);
  
  // Click Start/Resume Reading
  const readBtn = page.locator('button:has-text("Start Reading"), button:has-text("Resume Reading")');
  await readBtn.click();
  await page.waitForURL(/#reader/);
  
  // Wait for images to load
  await page.waitForTimeout(2000);
  
  // Take screenshot of the viewport
  const screenshotPath = path.join('C:\\Users\\USER PC\\.gemini\\antigravity\\brain\\f810d2c7-ac71-4b44-ae42-fe49ba2c6160', 'reader_screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);
  
  await browser.close();
}

run().catch(console.error);
