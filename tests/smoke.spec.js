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
    await expect(page.locator('.stats-row')).not.toBeVisible();
    await expect(page.locator('#storyGrid')).toBeVisible();
    
    // Ensure story cards are present
    const cards = page.locator('.story-card');
    await expect(cards.first()).toBeVisible();
  });

  test('Reader view components and theme toggling', async ({ page }) => {
    setupConsoleLogging(page);
    await page.goto('/');

    // Click the cover of the first story to open it in Details view
    const firstStoryCover = page.locator('.story-card .cover-button').first();
    await expect(firstStoryCover).toBeVisible();
    await firstStoryCover.click();

    // Verify view has navigated to story details page
    await expect(page).toHaveURL(/#story/);

    // Click Start/Resume Reading on Details page to open in Reader
    const readBtn = page.locator('button:has-text("Start Reading"), button:has-text("Resume Reading")');
    await expect(readBtn).toBeVisible();
    await readBtn.click();

    // Verify view has navigated to reader
    await expect(page).toHaveURL(/#reader/);
    
    // Verify reader toolbar elements
    await expect(page.locator('.reader-frame')).toBeVisible();
    await expect(page.locator('.reader-content')).toBeVisible();
    
    // Verify reader settings drawer and toggle theme
    const settingsBtn = page.locator('.button-row button', { hasText: 'Settings' });
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    // Verify reader settings drawer is active
    const settingsDrawer = page.locator('.reader-settings-drawer');
    await expect(settingsDrawer).toBeVisible();

    // Toggle theme from settings drawer
    const darkThemeBtn = page.locator('.theme-toggles button', { hasText: 'Dark' });
    const lightThemeBtn = page.locator('.theme-toggles button', { hasText: 'Light' });
    await expect(darkThemeBtn).toBeVisible();
    await expect(lightThemeBtn).toBeVisible();

    // Toggle theme and verify class active changes
    const initialIsActive = await darkThemeBtn.evaluate(el => el.classList.contains('active'));
    if (initialIsActive) {
      await lightThemeBtn.click();
      await expect(lightThemeBtn).toHaveClass(/active/);
    } else {
      await darkThemeBtn.click();
      await expect(darkThemeBtn).toHaveClass(/active/);
    }
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
    // Click first story cover to open it in Details view
    await page.locator('.story-card .cover-button').first().click();
    await expect(page).toHaveURL(/#story/);

    // Click Start/Resume Reading on Details page to open in Reader
    const readBtn = page.locator('button:has-text("Start Reading"), button:has-text("Resume Reading")');
    await expect(readBtn).toBeVisible();
    await readBtn.click();
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
    
    // Click delete button to open custom confirmation modal
    await deleteBtn.click();

    // Click confirm (Delete) in the custom modal overlay
    const confirmModalBtn = page.locator('.custom-modal-overlay button.btn-danger');
    await expect(confirmModalBtn).toBeVisible();
    await confirmModalBtn.click();

    // Verify comment is removed
    await expect(commentListItem).not.toBeVisible();
  });

  test('PDF word/text extraction in chapter editor', async ({ page }) => {
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
    await expect(page.locator('text=Studio Overview')).toBeVisible();

    // 3. Create a new Web Novel story to ensure test isolation
    const newStoryBtn = page.locator('button:has-text("New Story")');
    await expect(newStoryBtn).toBeVisible();
    await newStoryBtn.click();
    await page.fill('form[data-form="storyForm"] input[name="title"]', 'Test Story PDF ' + Date.now());
    await page.selectOption('form[data-form="storyForm"] select[name="type"]', 'Web Novel');
    await page.fill('form[data-form="storyForm"] input[name="genre"]', 'Test Genre');
    await page.click('form[data-form="storyForm"] button[type="submit"]');
    await expect(page.locator('#storyModal')).toHaveAttribute('hidden', { timeout: 15000 });

    // 4. Click Continue Writing to open Chapter Editor
    const continueWritingBtn = page.locator('button:has-text("Continue Writing")').first();
    await expect(continueWritingBtn).toBeVisible();
    await continueWritingBtn.click();

    // 5. Verify Editor is loaded
    await expect(page.locator('h2:has-text("Chapter Editor")')).toBeVisible();

    // 6. Mock pdfjsLib
    await page.evaluate(() => {
      window.pdfjsLib = {
        GlobalWorkerOptions: { workerSrc: '' },
        getDocument: ({ data }) => {
          return {
            promise: Promise.resolve({
              numPages: 1,
              getPage: (pageNumber) => {
                return Promise.resolve({
                  getTextContent: () => {
                    return Promise.resolve({
                      items: [
                        { str: 'Paragraph 1 content extracted from PDF.' },
                        { str: '\n\n' },
                        { str: 'Paragraph 2 content extracted from PDF.' }
                      ]
                    });
                  }
                });
              }
            })
          };
        }
      };
    });

    // 7. Trigger the upload by providing a mock PDF file to the file input
    const fileInput = page.locator('input.text-doc-file-input');
    await fileInput.setInputFiles({
      name: 'test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.5 mock pdf content')
    });

    // 8. Verify the extraction status message is displayed
    const statusMsg = page.locator('.editor-upload-section span.mini-meta');
    await expect(statusMsg).toHaveText(/Extracted text from test.pdf|Processing test.pdf/);

    // 9. Verify the paragraph items in the contenteditable area
    const paragraphs = page.locator('.editor-textarea p');
    await expect(paragraphs.first()).toContainText('Paragraph 1 content extracted from PDF.');
  });

  test('Discover view search filters and Author Studio analytics metrics', async ({ page }) => {
    setupConsoleLogging(page);
    await page.goto('/');

    // 1. Discover search filters drawer
    const filterToggle = page.locator('button:has-text("Filters ▾")');
    await expect(filterToggle).toBeVisible();
    await filterToggle.click();

    // Verify filter drawer is visible
    await expect(page.locator('.filter-drawer')).toBeVisible();
    
    // Select status completed
    await page.selectOption('.filter-drawer select[name="filterStatus"]', 'completed');
    
    // Select language English
    await page.selectOption('.filter-drawer select[name="filterLanguage"]', 'english');

    // Select sort by Reads
    await page.selectOption('.filter-drawer select[name="filterSort"]', 'reads');

    // Toggle filter drawer closed
    await page.click('button:has-text("Filters ▴")');
    await expect(page.locator('.filter-drawer')).not.toBeVisible();

    // 2. Studio analytics metrics
    // Log in first to access Studio
    const signInBtn = page.locator('#signInBtn');
    await signInBtn.click();
    await page.fill('#authModal input[type="email"]', 'testplaywright@example.com');
    await page.fill('#authModal input[type="password"]', 'Password123!');
    await page.click('#authModal button[type="submit"]');

    // Go to studio
    await page.goto('/#studio');
    await expect(page.locator('text=Studio Overview')).toBeVisible();

    // Verify deep metrics are visible
    await expect(page.locator('text=Views (Reads)')).toBeVisible();
    await expect(page.locator('text=Engagement Rate')).toBeVisible();
    await expect(page.locator('text=Word Count')).toBeVisible();
    await expect(page.locator('text=Total Chapters')).toBeVisible();

    // Verify SVG chart is visible
    await expect(page.locator('.svg-chart')).toBeVisible();

    // Verify SVG chart points accessibility
    const chartPoints = page.locator('.svg-chart circle');
    await expect(chartPoints.first()).toBeVisible();
    await expect(chartPoints.first()).toHaveAttribute('tabindex', '0');
    await expect(chartPoints.first()).toHaveAttribute('role', 'button');
    await expect(chartPoints.first()).toHaveAttribute('aria-label', /.*/);

    // Verify data table summary is not visible
    await expect(page.locator('.studio-chart-table-container')).not.toBeVisible();
    await expect(page.locator('.studio-chart-table')).not.toBeVisible();

    // Click Likes to toggle metric
    await page.click('text=Likes');
    
    // Click Word Count to toggle metric
    await page.click('text=Word Count');
  });

  test('Comic page layout drag-and-drop editor', async ({ page }) => {
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
    await expect(page.locator('text=Studio Overview')).toBeVisible();

    // 3. Create a story of type Chitrānk
    const newStoryBtn = page.locator('button:has-text("New Story")');
    await expect(newStoryBtn).toBeVisible();
    await newStoryBtn.click();
    await page.fill('form[data-form="storyForm"] input[name="title"]', 'Test Comic Layout');
    await page.selectOption('form[data-form="storyForm"] select[name="type"]', 'Chitrānk');
    await page.fill('form[data-form="storyForm"] input[name="genre"]', 'Manga, Sci-Fi');
    await page.click('form[data-form="storyForm"] button[type="submit"]');
    await expect(page.locator('#storyModal')).toHaveAttribute('hidden', { timeout: 15000 });

    // 4. Click Continue Writing to open Chapter Editor
    const continueWritingBtn = page.locator('button:has-text("Continue Writing")');
    await expect(continueWritingBtn).toBeVisible();
    await continueWritingBtn.click();

    // 5. Verify Comic Layout Editor is loaded
    await expect(page.locator('h2:has-text("Chapter Editor")')).toBeVisible();
    await expect(page.locator('text=Comic Layout Editor')).toBeVisible();

    // 6. Mock pdfjsLib for image/canvas extraction
    await page.evaluate(() => {
      window.pdfjsLib = {
        GlobalWorkerOptions: { workerSrc: '' },
        getDocument: ({ data }) => {
          return {
            promise: Promise.resolve({
              numPages: 2,
              getPage: (pageNumber) => {
                return Promise.resolve({
                  getViewport: ({ scale }) => {
                    return { width: 100, height: 150 };
                  },
                  render: ({ canvasContext, viewport }) => {
                    if (canvasContext) {
                      canvasContext.fillStyle = '#ff0000';
                      canvasContext.fillRect(0, 0, viewport.width, viewport.height);
                    }
                    return {
                      promise: Promise.resolve()
                    };
                  }
                });
              }
            })
          };
        }
      };
    });

    // 7. Upload mock PDF to comic-pdf-file-input
    const pdfInput = page.locator('input.comic-pdf-file-input');
    await pdfInput.setInputFiles({
      name: 'comic.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.5 mock pdf')
    });

    // 8. Verify the progress/status message updates and wait for extraction to complete
    const statusMsg = page.locator('.comic-editor-upload-actions span.mini-meta');
    await expect(statusMsg).toHaveText(/Extracted 2 page/, { timeout: 45000 });

    // 9. Verify page cards are rendered in grid
    const pageCards = page.locator('.comic-editor-page');
    await expect(pageCards).toHaveCount(3); // 1 default page + 2 extracted pages

    // 10. Change label of first page card
    const firstLabelInput = page.locator('.comic-editor-page-label').first();
    await firstLabelInput.fill('Updated Cover');
    
    // Save draft
    await page.click('button:has-text("Save Draft")');
    await expect(page.locator('text=Chapter saved.')).toBeVisible();

    // Re-verify chapter editor title list
    await continueWritingBtn.click();
    await expect(page.locator('.comic-editor-page-label').first()).toHaveValue('Updated Cover');

    // Go back to studio/dashboard
    await page.click('button:has-text("Cancel")');
  });

  test('Mobile header and search ergonomics toggles', async ({ page }) => {
    setupConsoleLogging(page);

    // 1. Set viewport to a mobile layout (600x800)
    await page.setViewportSize({ width: 600, height: 800 });

    // 2. Go to home page
    await page.goto('/');

    // 3. Verify page title
    await expect(page).toHaveTitle(/KathaSangam/);

    // 4. Verify toggle buttons are visible and navigation/search are not visible
    const mobileMenuBtn = page.locator('#mobileMenuBtn');
    const mobileSearchBtn = page.locator('#mobileSearchBtn');
    const navLinks = page.locator('.nav-links');
    const searchBar = page.locator('.searchbar');

    await expect(mobileMenuBtn).toBeVisible();
    await expect(mobileSearchBtn).toBeVisible();
    await expect(navLinks).not.toBeVisible();
    await expect(searchBar).not.toBeVisible();

    // 5. Click mobile menu toggle button, verify navLinks becomes visible (active)
    await mobileMenuBtn.click();
    await expect(navLinks).toBeVisible();
    await expect(searchBar).not.toBeVisible();
    await expect(mobileMenuBtn).toHaveAttribute('aria-expanded', 'true');

    // 6. Click mobile search toggle button, verify searchBar becomes visible (active) and navLinks is hidden
    await mobileSearchBtn.click();
    await expect(searchBar).toBeVisible();
    await expect(navLinks).not.toBeVisible();
    await expect(mobileSearchBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(mobileMenuBtn).toHaveAttribute('aria-expanded', 'false');

    // 7. Click outside the hero bar to dismiss both
    await page.click('body', { position: { x: 300, y: 400 } });
    await expect(navLinks).not.toBeVisible();
    await expect(searchBar).not.toBeVisible();
    await expect(mobileMenuBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(mobileSearchBtn).toHaveAttribute('aria-expanded', 'false');
  });

  test('Oversized image upload is rejected by backend', async ({ page }) => {
    setupConsoleLogging(page);

    await page.goto('/');

    // Perform the upload using page.evaluate to trigger a fetch request directly from the browser context
    const response = await page.evaluate(async () => {
      // Create a large 11MB dummy data buffer
      const bufferSize = 11 * 1024 * 1024;
      const u8 = new Uint8Array(bufferSize);
      
      // PNG magic bytes
      u8[0] = 0x89;
      u8[1] = 0x50;
      u8[2] = 0x4E;
      u8[3] = 0x47;
      u8[4] = 0x0D;
      u8[5] = 0x0A;
      u8[6] = 0x1A;
      u8[7] = 0x0A;

      const blob = new Blob([u8], { type: 'image/png' });
      const formData = new FormData();
      formData.append('file', blob, 'oversized.png');

      try {
        const res = await fetch('/api/upload/image', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer mock-access-token'
          },
          body: formData
        });
        return {
          status: res.status,
          text: await res.text()
        };
      } catch (err) {
        return {
          status: -1,
          text: err.message
        };
      }
    });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Upload size limit exceeded. Max 10MB allowed.');
  });
});

