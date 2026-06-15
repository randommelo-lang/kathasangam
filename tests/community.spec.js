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
  // Set generous timeout for database/network latency in test environment
  test.setTimeout(90000);

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

    Object.defineProperty(window, 'supabase', {
      get: () => mockSupabase,
      set: () => {
        console.log("[MOCK] Ignored overwrite attempt to window.supabase by CDN script.");
      },
      configurable: true
    });
  });
});

test.describe('KathaSangam Community Features', () => {

  test('Bookmarking and Playlists', async ({ page }) => {
    setupConsoleLogging(page);
    
    // Unique playlist name to prevent strict mode violations across duplicate runs
    const playlistName = 'Playlist ' + Date.now();

    // 1. Load the home page
    await page.goto('/');

    // 2. Click sign in button
    const loginHeaderBtn = page.locator('#signInBtn');
    await loginHeaderBtn.click();
    
    // Fill credentials and submit
    await page.fill('#loginForm input[name="email"]', 'testplaywright@example.com');
    await page.fill('#loginForm input[name="password"]', 'Password123!');
    await page.click('#loginForm button[type="submit"]');
    
    // Wait for login and stats/stories to fetch
    await expect(page.locator('.account-trigger')).toBeVisible({ timeout: 15000 });

    // 3. Click the first story card to go to Story details
    const firstStoryCover = page.locator('.story-card .cover-button').first();
    await expect(firstStoryCover).toBeVisible({ timeout: 15000 });
    await firstStoryCover.click();
    await expect(page).toHaveURL(/#story/, { timeout: 15000 });

    // 4. Verify Bookmark and Add to Playlist buttons are visible
    const bookmarkBtn = page.locator('button[data-action="bookmarkStory"]');
    const playlistBtn = page.locator('button[data-action="openAddToReadingListModal"]');
    await expect(bookmarkBtn).toBeVisible({ timeout: 15000 });
    await expect(playlistBtn).toBeVisible({ timeout: 15000 });

    // Bookmark the story (make test idempotent by toggling back if already bookmarked)
    const initialText = (await bookmarkBtn.textContent()).trim();
    if (initialText === 'Bookmarked') {
      await bookmarkBtn.click();
      await expect(bookmarkBtn).toHaveText('Bookmark', { timeout: 15000 });
    }
    
    await bookmarkBtn.click();
    await expect(bookmarkBtn).toHaveText('Bookmarked', { timeout: 15000 });

    // Go to Library and verify Bookmark tab (Client-side routing to preserve session)
    await page.evaluate(() => { window.location.hash = 'library'; });
    const bookmarksTab = page.locator('.library-tab-btn', { hasText: 'Bookmarks' });
    await expect(bookmarksTab).toBeVisible({ timeout: 15000 });
    await bookmarksTab.click();

    // Verify bookmark is listed
    await expect(page.locator('.story-card').first()).toBeVisible({ timeout: 15000 });

    // Unbookmark from library/story details
    await page.locator('.story-card .cover-button').first().click();
    await expect(page).toHaveURL(/#story/, { timeout: 15000 });
    await bookmarkBtn.click();
    await expect(bookmarkBtn).toHaveText('Bookmark', { timeout: 15000 });

    // Go to library and check again
    await page.evaluate(() => { window.location.hash = 'library'; });
    await expect(bookmarksTab).toBeVisible({ timeout: 15000 });
    await bookmarksTab.click();
    await expect(page.locator('text=Bookmark stories from their details pages to save them here for quick access later.')).toBeVisible({ timeout: 15000 });

    // 5. Reading Playlists flow
    const playlistsTab = page.locator('.library-tab-btn', { hasText: 'Reading Lists' });
    await expect(playlistsTab).toBeVisible({ timeout: 15000 });
    await playlistsTab.click();

    // Create a new reading list
    const createBtn = page.locator('button:has-text("Create List")').first();
    await expect(createBtn).toBeVisible({ timeout: 15000 });
    await createBtn.click();

    await page.fill('input[placeholder="Name"]', playlistName);
    await page.fill('textarea[placeholder="Description (optional)"]', 'Superb novels');
    await page.click('.library-main-content form button[type="submit"]');

    // Verify playlist card appears
    const playlistCard = page.locator('.reading-list-card', { hasText: playlistName });
    await expect(playlistCard).toBeVisible({ timeout: 30000 });

    // Add a story to the playlist
    await page.evaluate(() => { window.location.hash = 'discover'; });
    const firstCover = page.locator('.story-card .cover-button').first();
    await expect(firstCover).toBeVisible({ timeout: 15000 });
    await firstCover.click();
    await expect(page).toHaveURL(/#story/, { timeout: 15000 });
    
    await playlistBtn.click();
    // Modal should show up
    await expect(page.locator('#storyModal')).not.toHaveAttribute('hidden', { timeout: 15000 });
    
    // Check the box next to Epic Collection / playlistName
    const playlistCheckbox = page.locator('#storyModal input[type="checkbox"]').first();
    await expect(playlistCheckbox).toBeVisible({ timeout: 15000 });
    await playlistCheckbox.click();
    await expect(playlistCheckbox).toBeChecked({ timeout: 15000 });
    
    // Close modal
    await page.click('#storyModalClose');

    // Verify it is inside the playlist
    await page.evaluate(() => { window.location.hash = 'library'; });
    await expect(playlistsTab).toBeVisible({ timeout: 15000 });
    await playlistsTab.click();
    await expect(playlistCard).toBeVisible({ timeout: 15000 });
    await playlistCard.click();

    // Should view detailed playlist page with the story inside it (target heading element)
    await expect(page.locator('.library-main-content h2', { hasText: playlistName })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.story-card').first()).toBeVisible({ timeout: 15000 });

    // Go back to playlists and delete it
    const backBtn = page.locator('button:has-text("Back to Reading Lists")');
    await expect(backBtn).toBeVisible({ timeout: 15000 });
    await backBtn.click();
    const deleteBtn = playlistCard.locator('button:has-text("Delete")');
    await expect(deleteBtn).toBeVisible({ timeout: 15000 });
    await deleteBtn.click();

    // Click confirm in the custom modal
    const confirmDeleteBtn = page.locator('.custom-modal-box button.btn-danger');
    await expect(confirmDeleteBtn).toBeVisible({ timeout: 15000 });
    await confirmDeleteBtn.click();

    await expect(playlistCard).not.toBeVisible({ timeout: 15000 });
  });

  test('Direct Messaging Flow', async ({ page }) => {
    setupConsoleLogging(page);
    
    // 1. Log in
    await page.goto('/');
    await page.locator('#signInBtn').click();
    await page.fill('#loginForm input[name="email"]', 'testplaywright@example.com');
    await page.fill('#loginForm input[name="password"]', 'Password123!');
    await page.click('#loginForm button[type="submit"]');
    await expect(page.locator('.account-trigger')).toBeVisible({ timeout: 15000 });

    // 2. Go to Messages page via client routing
    await page.evaluate(() => { window.location.hash = 'messages'; });
    await expect(page.locator('.messages-sidebar h3:has-text("Direct Messages")')).toBeVisible({ timeout: 15000 });

    // 3. Initiate a message from an author profile (client routing to Discover to select another user's profile)
    await page.evaluate(() => { window.location.hash = 'discover'; });
    await expect(page.locator('.story-card').first()).toBeVisible({ timeout: 15000 });
    
    // Select the first story card's author that is not ourselves
    const authorLinks = page.locator('.story-card .story-author-link');
    const count = await authorLinks.count();
    let targetLink = null;
    for (let i = 0; i < count; i++) {
      const link = authorLinks.nth(i);
      const text = await link.textContent();
      if (text.trim() !== 'You' && text.trim() !== 'testplaywright') {
        targetLink = link;
        break;
      }
    }
    
    if (!targetLink) {
      targetLink = authorLinks.first();
    }
    
    await expect(targetLink).toBeVisible({ timeout: 15000 });
    const authorName = await targetLink.textContent();
    await targetLink.click();
    await expect(page).toHaveURL(/#profile/, { timeout: 15000 });

    // Verify message button is visible on another user's profile specifically using card selector
    const msgBtn = page.locator('.profile-header-card button:has-text("Message")');
    await expect(msgBtn).toBeVisible({ timeout: 15000 });
    await msgBtn.click();

    // It should redirect to DMs with this user selected
    await expect(page).toHaveURL(/#messages/, { timeout: 15000 });
    await expect(page.locator('.messages-chat-title', { hasText: authorName.trim() })).toBeVisible({ timeout: 15000 });

    // 4. Send a message
    await page.fill('input.messages-chat-input', 'Hello there! Love your story!');
    await page.click('form.messages-chat-input-bar button[type="submit"]');

    // Message bubble should appear in history
    const lastBubble = page.locator('.messages-history .messages-bubble-wrapper.sent').last();
    await expect(lastBubble).toBeVisible({ timeout: 15000 });
    await expect(lastBubble.locator('.messages-chat-bubble')).toHaveText('Hello there! Love your story!', { timeout: 15000 });
  });

  test('Responsive Messaging Layout on Mobile', async ({ page }) => {
    setupConsoleLogging(page);
    
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });

    // 1. Log in
    await page.goto('/');
    await page.locator('#signInBtn').click();
    await page.fill('#loginForm input[name="email"]', 'testplaywright@example.com');
    await page.fill('#loginForm input[name="password"]', 'Password123!');
    await page.click('#loginForm button[type="submit"]');
    await expect(page.locator('.account-trigger')).toBeVisible({ timeout: 15000 });

    // 2. Go to Messages page via client routing
    await page.evaluate(() => { window.location.hash = 'messages'; });
    await expect(page.locator('.messages-sidebar h3:has-text("Direct Messages")')).toBeVisible({ timeout: 15000 });

    // Since we just loaded messages and no activeConversationUserId is set (layout does not have chat-active),
    // on mobile, the sidebar (.messages-sidebar) should be visible, and the chat pane (.messages-chat-pane) should be hidden.
    const sidebar = page.locator('.messages-sidebar');
    const chatPane = page.locator('.messages-chat-pane');
    await expect(sidebar).toBeVisible();
    await expect(chatPane).toBeHidden();

    // 3. Select a conversation (or start one)
    // Let's use the profile message route to open a conversation
    await page.evaluate(() => { window.location.hash = 'discover'; });
    await expect(page.locator('.story-card').first()).toBeVisible({ timeout: 15000 });
    
    const authorLinks = page.locator('.story-card .story-author-link');
    const count = await authorLinks.count();
    let targetLink = null;
    for (let i = 0; i < count; i++) {
      const link = authorLinks.nth(i);
      const text = await link.textContent();
      if (text.trim() !== 'You' && text.trim() !== 'testplaywright') {
        targetLink = link;
        break;
      }
    }
    if (!targetLink) {
      targetLink = authorLinks.first();
    }
    await expect(targetLink).toBeVisible({ timeout: 15000 });
    await targetLink.click();
    await expect(page).toHaveURL(/#profile/, { timeout: 15000 });

    const msgBtn = page.locator('.profile-header-card button:has-text("Message")');
    await expect(msgBtn).toBeVisible({ timeout: 15000 });
    await msgBtn.click();

    // Now in messages, with an active conversation (chat-active class added to layout)
    await expect(page).toHaveURL(/#messages/, { timeout: 15000 });

    // Under max-width 640px, since chat is active:
    // sidebar (.messages-sidebar) should be hidden
    // chat pane (.messages-chat-pane) should be visible
    // back button (.messages-back-btn) should be visible
    await expect(sidebar).toBeHidden();
    await expect(chatPane).toBeVisible();
    
    const backBtn = page.locator('.messages-chat-header .messages-back-btn');
    await expect(backBtn).toBeVisible();

    // 4. Click the Back button
    await backBtn.click();

    // After clicking back, activeConversationUserId is cleared:
    // Layout should lose chat-active class.
    // sidebar (.messages-sidebar) should become visible again
    // chat pane (.messages-chat-pane) should become hidden again
    await expect(sidebar).toBeVisible();
    await expect(chatPane).toBeHidden();
  });

  test('User Social Follow System Flow', async ({ page }) => {
    setupConsoleLogging(page);
    
    // 1. Log in
    await page.goto('/');
    await page.locator('#signInBtn').click();
    await page.fill('#loginForm input[name="email"]', 'testplaywright@example.com');
    await page.fill('#loginForm input[name="password"]', 'Password123!');
    await page.click('#loginForm button[type="submit"]');
    await expect(page.locator('.account-trigger')).toBeVisible({ timeout: 15000 });

    // 2. Select another user's profile
    await page.evaluate(() => { window.location.hash = 'discover'; });
    await expect(page.locator('.story-card').first()).toBeVisible({ timeout: 15000 });
    
    const authorLinks = page.locator('.story-card .story-author-link');
    const count = await authorLinks.count();
    let targetLink = null;
    for (let i = 0; i < count; i++) {
      const link = authorLinks.nth(i);
      const text = await link.textContent();
      if (text.trim() !== 'You' && text.trim() !== 'testplaywright') {
        targetLink = link;
        break;
      }
    }
    if (!targetLink) {
      targetLink = authorLinks.first();
    }
    
    await expect(targetLink).toBeVisible({ timeout: 15000 });
    await targetLink.click();
    await expect(page).toHaveURL(/#profile/, { timeout: 15000 });

    // 3. Verify Follow button and Social Stats inside header card
    const followBtn = page.locator('.profile-header-card button:has-text("Follow"), .profile-header-card button:has-text("Following")');
    await expect(followBtn).toBeVisible({ timeout: 15000 });
    
    const statsText = page.locator('.profile-header-social-stats');
    await expect(statsText).toBeVisible({ timeout: 15000 });
    
    // Check initial state
    const initialFollowText = await followBtn.textContent();
    const initialStats = await statsText.textContent();
    console.log(`Initial Follow state: ${initialFollowText}, stats: ${initialStats}`);

    // Click Follow to toggle
    await followBtn.click();
    
    // Assert stats and button label toggled (using Playwright auto-retry to wait)
    const expectedFollowText = initialFollowText === 'Follow' ? 'Following' : 'Follow';
    await expect(followBtn).toHaveText(expectedFollowText, { timeout: 15000 });
    
    const afterFollowText = await followBtn.textContent();
    const afterStats = await statsText.textContent();
    console.log(`After toggle Follow state: ${afterFollowText}, stats: ${afterStats}`);
    
    expect(initialFollowText).not.toBe(afterFollowText);
    
    // Toggle back to clean up
    await followBtn.click();
    await expect(followBtn).toHaveText(initialFollowText, { timeout: 15000 });
    
    const cleanFollowText = await followBtn.textContent();
    expect(cleanFollowText).toBe(initialFollowText);
  });
});
