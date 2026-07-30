import { test, expect } from '@playwright/test';

const setupConsoleLogging = (page) => {
  page.on('console', msg => {
    console.log(`[BROWSER LOG (${msg.type()})]: ${msg.text()}`);
  });
  page.on('pageerror', err => {
    console.error(`[BROWSER UNCAUGHT EXCEPTION]: ${err.message}`);
  });
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const mockAuth = {
      callback: null,
      session: null,
      
      getSession: async function() {
        return { data: { session: this.session }, error: null };
      },
      onAuthStateChange: function(cb) {
        this.callback = cb;
        cb(this.session ? 'SIGNED_IN' : 'SIGNED_OUT', this.session);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: async function({ email, password }) {
        if (email === 'testplaywright@example.com' && password === 'Password123!') {
          this.session = {
            user: {
              id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
              email: 'testplaywright@example.com'
            },
            access_token: 'mock-access-token'
          };
          if (this.callback) {
            this.callback('SIGNED_IN', this.session);
          }
          return { data: { user: this.session.user, session: this.session }, error: null };
        }
        return { data: { user: null, session: null }, error: { message: 'Invalid credentials' } };
      },
      signUp: async function({ email }) {
        return { data: { user: { id: 'some-id', email } }, error: null };
      },
      signOut: async function() {
        this.session = null;
        if (this.callback) this.callback('SIGNED_OUT', null);
        return { error: null };
      },
      mfa: {
        factors: [],
        listFactors: async function() { return { data: { all: [], active: [] } }; }
      }
    };
    window.supabase = {
      createClient: () => ({ auth: mockAuth })
    };
  });
});

test('NSFW Content and Age Verification flow', async ({ page }) => {
  setupConsoleLogging(page);

  // Navigate to login
  await page.goto('http://localhost:5173/#discover');
  await page.click('button:has-text("Log In")');
  await page.fill('input[type="email"]', 'testplaywright@example.com');
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button:has-text("Sign In")');

  // Verify successful sign-in
  await expect(page.locator('a:has-text("Author Studio")')).toBeVisible();

  // Go to Profile Settings
  await page.click('a:has-text("Profile")');
  await page.click('button:has-text("Settings")');

  // Verify DOB is visible
  await expect(page.locator('input[name="date_of_birth"]')).toBeVisible();

  // 1. Set age under 18 (e.g. year 2015)
  await page.fill('input[name="date_of_birth"]', '2015-01-01');
  await page.click('button:has-text("Update Preferences")');
  await page.waitForTimeout(1500);

  // Verify NSFW Content settings select says "Hidden (under 18)"
  await expect(page.locator('text=Hidden (under 18)')).toBeVisible();
  await expect(page.locator('select[name="nsfw_preference"]')).not.toBeVisible();

  // 2. Set age 18+ (e.g. year 1995)
  await page.fill('input[name="date_of_birth"]', '1995-01-01');
  await page.click('button:has-text("Update Preferences")');
  await page.waitForTimeout(1500);

  // Verify NSFW Content select dropdown now appears
  await expect(page.locator('select[name="nsfw_preference"]')).toBeVisible();
  
  // Update to Blur preference
  await page.selectOption('select[name="nsfw_preference"]', 'blur');
  await page.click('button:has-text("Update Preferences")');
  await page.waitForTimeout(1500);

  // Go to Author Studio and Create NSFW Story
  await page.click('a:has-text("Author Studio")');
  await page.click('button:has-text("New Story")');
  await page.fill('input[name="title"]', 'NSFW Test Story Title');
  await page.fill('input[name="genre"]', 'Romance');
  await page.selectOption('select[name="isNsfw"]', 'true');
  await page.fill('textarea[name="description"]', 'This is a mature test story.');
  await page.click('form[data-form="storyForm"] button[type="submit"]');
  await page.waitForTimeout(1500);

  // Go to Discover feed to view it
  await page.click('a:has-text("Discover")');
  await page.waitForTimeout(1000);

  // Verify our story is rendered
  const storyCard = page.locator('.story-card:has-text("NSFW Test Story Title")');
  await expect(storyCard).toBeVisible();

  // Verify NSFW badge and Blur overlay are visible on the cover
  await expect(storyCard.locator('.nsfw-tag-badge')).toContainText('18+ NSFW');
  await expect(storyCard.locator('.nsfw-blur-overlay')).toContainText('NSFW Blurred');

  // Change preference to "Show NSFW"
  await page.click('a:has-text("Profile")');
  await page.click('button:has-text("Settings")');
  await page.selectOption('select[name="nsfw_preference"]', 'show');
  await page.click('button:has-text("Update Preferences")');
  await page.waitForTimeout(1500);

  // Verify cover is no longer blurred
  await page.click('a:has-text("Discover")');
  await page.waitForTimeout(1000);
  const storyCardShow = page.locator('.story-card:has-text("NSFW Test Story Title")');
  await expect(storyCardShow.locator('.nsfw-blur-overlay')).not.toBeVisible();
});
