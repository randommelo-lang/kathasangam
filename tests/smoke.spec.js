import { test, expect } from '@playwright/test';

// Helper to log console messages from the browser
const setupConsoleLogging = (page) => {
  page.on('console', msg => {
    console.log(`[BROWSER LOG (${msg.type()})]: ${msg.text()}`);
  });
  page.on('pageerror', err => {
    console.error(`[BROWSER UNCAUGHT EXCEPTION]: ${err.message}`);
  });
};

test.beforeEach(async ({ page }) => {
  // Inject mock Supabase client before scripts load, protecting it from being overwritten by CDN script
  await page.addInitScript(() => {
    const mockAuth = {
      callback: null,
      session: null,
      
      getSession: async function() {
        return { data: { session: this.session }, error: null };
      },
      onAuthStateChange: function(cb) {
        this.callback = cb;
        // Trigger initial check
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
        } else {
          return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
        }
      },
      signUp: async function({ email, password }) {
        return { data: { user: { id: 'some-new-id', email }, session: null }, error: null };
      },
      signOut: async function() {
        this.session = null;
        if (this.callback) {
          this.callback('SIGNED_OUT', null);
        }
        return { error: null };
      }
    };

    const mockClient = {
      auth: mockAuth
    };

    const mockSupabase = {
      createClient: () => mockClient
    };

    // Use Object.defineProperty to make window.supabase read-only to CDN overwrite attempts
    Object.defineProperty(window, 'supabase', {
      get: () => mockSupabase,
      set: () => {
        console.log("[MOCK] Ignored overwrite attempt to window.supabase by CDN script.");
      },
      configurable: true
    });
  });
});

test.describe('KathaSangam Smoke Tests', () => {

  test('Discover view load and basic elements', async ({ page }) => {
    setupConsoleLogging(page);
    // 1. Load the home page
    await page.goto('/');

    // 2. Verify page title
    await expect(page).toHaveTitle(/KathaSangam/);

    // 3. Verify the logo and navigation links
    await expect(page.locator('.brand')).toBeVisible();
    await expect(page.locator('nav a[data-nav="discover"]')).toBeVisible();
    await expect(page.locator('nav a[data-nav="library"]')).toBeVisible();
    await expect(page.locator('nav a[data-nav="reader"]')).toBeVisible();
    await expect(page.locator('nav a[data-nav="studio"]')).toBeVisible();

    // 4. Verify search and filter inputs are present
    await expect(page.locator('#searchInput')).toBeVisible();
    await expect(page.locator('#genreFilter')).toBeVisible();

    // 5. Verify discover components
    await expect(page.locator('.hero-carousel')).toBeVisible();
    await expect(page.locator('.stats-row')).toBeVisible();
    await expect(page.locator('#storyGrid')).toBeVisible();
    
    // Ensure story cards are present
    const cards = page.locator('.story-card');
    await expect(cards.first()).toBeVisible();
  });

  test('Reader view components and theme toggling', async ({ page }) => {
    setupConsoleLogging(page);
    await page.goto('/');

    // Click the cover of the first story to open it in Reader
    const firstStoryCover = page.locator('.story-card .cover-button').first();
    await expect(firstStoryCover).toBeVisible();
    await firstStoryCover.click();

    // Verify view has navigated to reader
    await expect(page).toHaveURL(/#reader/);
    
    // Verify reader toolbar elements
    await expect(page.locator('.reader-frame')).toBeVisible();
    await expect(page.locator('.reader-content')).toBeVisible();
    
    // Theme switching button check
    const themeBtn = page.locator('.button-row button', { hasText: /Light|Dark/ });
    await expect(themeBtn).toBeVisible();
    const initialText = await themeBtn.textContent();
    await themeBtn.click();
    const afterText = await themeBtn.textContent();
    expect(initialText).not.toBe(afterText); // Theme button text should toggle
  });

  test('Protected route checks and login modal', async ({ page }) => {
    setupConsoleLogging(page);
    // 1. Unauthenticated route check
    await page.goto('/#studio');
    // If not logged in, studio view shows a welcome card prompting login
    await expect(page.locator('text=Welcome to Author Studio!')).toBeVisible();
    
    // Click "Create a Story Now" button which should open login modal
    const welcomeCreateBtn = page.locator('text=Create a Story Now');
    await expect(welcomeCreateBtn).toBeVisible();
    await welcomeCreateBtn.click();

    // Verify login modal backdrop is visible
    const authModal = page.locator('#authModal');
    await expect(authModal).not.toHaveAttribute('hidden');

    // Click Close Button on Modal
    const modalClose = page.locator('#authModalClose');
    await expect(modalClose).toBeVisible();
    await modalClose.click();
    await expect(authModal).toHaveAttribute('hidden');

    // Open Login Modal from Header Log In button
    const loginHeaderBtn = page.locator('#signInBtn');
    await expect(loginHeaderBtn).toBeVisible();
    await loginHeaderBtn.click();
    await expect(authModal).not.toHaveAttribute('hidden');

    // Try submitting wrong credentials
    await page.fill('#loginForm input[name="email"]', 'wrong@example.com');
    await page.fill('#loginForm input[name="password"]', 'wrongpassword');
    await page.click('#loginForm button[type="submit"]');

    // Verify error notification
    const authError = page.locator('#authError');
    await expect(authError).toBeVisible();
    const errorText = await authError.textContent();
    expect(errorText).toContain('Invalid login credentials'); // typical Supabase error message

    // Clear and fill valid credentials
    await page.fill('#loginForm input[name="email"]', 'testplaywright@example.com');
    await page.fill('#loginForm input[name="password"]', 'Password123!');
    await page.click('#loginForm button[type="submit"]');

    // Verify modal closes and user is logged in
    await expect(authModal).toHaveAttribute('hidden');
    // Header should contain profile name or dropdown trigger
    await expect(page.locator('.account-trigger')).toBeVisible();
  });

  test('Authenticated studio view and story creation dialog', async ({ page }) => {
    setupConsoleLogging(page);
    // 1. Log in
    await page.goto('/');
    const loginHeaderBtn = page.locator('#signInBtn');
    await loginHeaderBtn.click();
    await page.fill('#loginForm input[name="email"]', 'testplaywright@example.com');
    await page.fill('#loginForm input[name="password"]', 'Password123!');
    await page.click('#loginForm button[type="submit"]');
    await expect(page.locator('.account-trigger')).toBeVisible();

    // 2. Go to Studio
    await page.goto('/#studio');
    // Since we are logged in, we should see the "Studio Overview" page
    await expect(page.locator('text=Studio Overview')).toBeVisible();
    
    // Click "New Story" button to open Create Story Modal
    const newStoryBtn = page.locator('button:has-text("New Story")');
    await expect(newStoryBtn).toBeVisible();
    await newStoryBtn.click();

    // Verify story modal opens
    const storyModal = page.locator('#storyModal');
    await expect(storyModal).not.toHaveAttribute('hidden');
    
    // Verify form fields inside form[data-form="storyForm"]
    await expect(page.locator('form[data-form="storyForm"] input[name="title"]')).toBeVisible();
    await expect(page.locator('form[data-form="storyForm"] textarea[name="description"]')).toBeVisible();
    
    // Close Story Modal
    const storyModalClose = page.locator('#storyModalClose');
    await expect(storyModalClose).toBeVisible();
    await storyModalClose.click();
    await expect(storyModal).toHaveAttribute('hidden');
  });

  test('Comments submission states', async ({ page }) => {
    setupConsoleLogging(page);
    // 1. When unauthenticated, verify prompt is shown
    await page.goto('/');
    // Click first story cover to open it
    await page.locator('.story-card .cover-button').first().click();
    await expect(page).toHaveURL(/#reader/);

    // Verify prompt in comments panel
    const prompt = page.locator('.comment-login-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt.locator('text=Please log in to post a comment.')).toBeVisible();
    
    // Click Log In in prompt, check if it opens auth modal
    const promptLoginBtn = prompt.locator('button:has-text("Log In")');
    await expect(promptLoginBtn).toBeVisible();
    await promptLoginBtn.click();
    await expect(page.locator('#authModal')).not.toHaveAttribute('hidden');
    
    // Log in
    await page.fill('#loginForm input[name="email"]', 'testplaywright@example.com');
    await page.fill('#loginForm input[name="password"]', 'Password123!');
    await page.click('#loginForm button[type="submit"]');
    await expect(page.locator('#authModal')).toHaveAttribute('hidden');

    // 2. When authenticated, verify comment form is visible
    const commentForm = page.locator('form[data-form="commentForm"]');
    await expect(commentForm).toBeVisible();
    
    // Post a comment
    const testComment = 'Test comment from Playwright at ' + Date.now();
    await page.fill('form[data-form="commentForm"] textarea[name="comment"]', testComment);
    await page.click('form[data-form="commentForm"] button[type="submit"]');

    // Verify comment is displayed in the list
    const commentListItem = page.locator('.activity-item', { hasText: testComment });
    await expect(commentListItem).toBeVisible();
    
    // Clean up: delete the comment we just posted
    const deleteBtn = commentListItem.locator('button:has-text("Delete")');
    await expect(deleteBtn).toBeVisible();
    
    // Intercept confirmation dialog
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('Are you sure you want to delete this comment?');
      await dialog.accept();
    });
    await deleteBtn.click();

    // Verify comment is removed
    await expect(commentListItem).not.toBeVisible();
  });
});
