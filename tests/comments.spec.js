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
    const mockClient = {
      auth: mockAuth
    };
    const mockSupabase = {
      createClient: () => mockClient
    };
    Object.defineProperty(window, 'supabase', {
      get: () => mockSupabase,
      set: () => {
        console.log("[MOCK] Ignored overwrite attempt to window.supabase by CDN script.");
      },
      configurable: true
    });
  });
});

test('Threaded Comments and Character Limit verification', async ({ page }) => {
  setupConsoleLogging(page);

  // 1. Login
  await page.goto('/#discover');
  await page.click('#signInBtn');
  await page.fill('#loginForm input[name="email"]', 'testplaywright@example.com');
  await page.fill('#loginForm input[name="password"]', 'Password123!');
  await page.click('#loginForm button[type="submit"]');

  // Verify login success
  await expect(page.locator('.account-trigger')).toBeVisible();

  // 2. Navigate to SAMYATI story details
  await page.click('.story-card:has-text("SAMYATI")');
  await page.waitForTimeout(1000);

  // 3. Click "Start Reading" to open the reader
  await page.click('button:has-text("Start Reading")');
  await page.waitForTimeout(2000);

  // 4. Verify comment textarea has maxlength="5000"
  const commentTextarea = page.locator('form[data-form="commentForm"] textarea[name="comment"]');
  await expect(commentTextarea).toBeVisible();
  await expect(commentTextarea).toHaveAttribute('maxlength', '5000');

  // 5. Post a main comment
  const mainCommentText = 'This is a test comment ' + Date.now();
  await commentTextarea.fill(mainCommentText);
  await page.click('form[data-form="commentForm"] button[type="submit"]');
  
  // Verify comment is displayed
  const commentItem = page.locator(`.comment-thread-wrapper:has-text("${mainCommentText}")`);
  await expect(commentItem).toBeVisible({ timeout: 10000 });

  // 6. Reply to the posted comment
  await commentItem.locator('button:has-text("Reply")').click();

  // Verify inline reply form is visible
  const replyForm = commentItem.locator('form[data-form="replyForm"]');
  await expect(replyForm).toBeVisible();
  
  // Verify reply textarea has maxlength="5000"
  const replyTextarea = replyForm.locator('textarea[name="replyText"]');
  await expect(replyTextarea).toHaveAttribute('maxlength', '5000');

  // Fill and submit reply
  const replyText = 'This is a threaded reply ' + Date.now();
  await replyTextarea.fill(replyText);
  await replyForm.locator('button:has-text("Post Reply")').click();

  // Verify reply is displayed inside the threaded list under the parent comment
  const replyItem = commentItem.locator(`.comment-reply-item:has-text("${replyText}")`);
  await expect(replyItem).toBeVisible({ timeout: 10000 });
});
