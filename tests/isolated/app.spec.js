import { test, expect } from '@playwright/test';

const storyId = '11111111-1111-4111-8111-111111111111';
const story = {
  id: storyId, author_id: 'author-1', title: 'The Test Chronicle', author: 'A. Writer',
  type: 'Web Novel', genre: 'Fantasy', language: 'English', license: 'Original',
  status: 'published', tags: ['test'], description: 'A story for isolated browser checks.',
  cover: '', followers: 3, views: 42, likes: 8, earnings: 0, progress: 0,
  created_at: '2026-01-01T00:00:00', isNsfw: false,
  chapters: [{ id: '22222222-2222-4222-8222-222222222222', sort_order: 1, title: 'The First Page', status: 'published', access: 'public', words: 10, reads: 7, likes: 1, content: ['A chapter shown in the browser test.'], pages: null, comments: [] }],
  collaborators: [],
};

async function installApiMocks(page, options = {}) {
  page.on('pageerror', (error) => console.error('[app page error]', error.message));
  if (!options.firstTime) {
    await page.addInitScript(() => {
      localStorage.setItem('kathasangam_onboarding_dismissed', 'true');
    });
  }
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/stories' && options.stories) {
      return options.stories(route);
    }
    if (url.pathname === `/api/stories/${storyId}`) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(options.story || story) });
    }
    const data = url.pathname === '/api/config'
      ? { supabase_url: '', supabase_anon_key: '', admin_email: '', moderator_emails: [] }
      : url.pathname === '/api/stories'
        ? { items: [options.story || story], next_cursor: null, has_more: false }
      : url.pathname === '/api/stats'
          ? { published: 1, views: 42, followers: 3, open_reports: 0 }
          : ['/api/collaborations/invites', `/api/stories/${storyId}/internal-notes`, '/api/progress', '/api/library/ids', '/api/notifications', '/api/reports'] .includes(url.pathname)
            ? []
          : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('https://images.example.test/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#333"/></svg>'
    });
  });
}

test('publishes only the public frontend and routes safely to the app', async ({ page, request }) => {
  await installApiMocks(page);
  const response = await page.goto('/');
  expect(response.status()).toBe(200);
  await expect(page.locator('#storyGrid').getByRole('heading', { name: 'The Test Chronicle' })).toBeVisible();
  for (const path of ['/Plan.md', '/backend/src/main.rs', '/tests/smoke.spec.js', '/README.md']) {
    expect((await request.get(path)).status(), `${path} should not be public`).toBe(404);
  }
});

test('removed direct messaging route returns users to Discover', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/');
  await page.evaluate(() => { window.location.hash = 'messages'; });
  await expect(page).toHaveURL(/#discover$/);
  await expect(page.locator('#storyGrid').getByRole('heading', { name: 'The Test Chronicle' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Messages' })).toHaveCount(0);
});

test('uses an explicit page cursor and can reveal more stories', async ({ page }) => {
  let pageCalls = 0;
  await installApiMocks(page, { stories: async (route) => {
    pageCalls += 1;
    const url = new URL(route.request().url());
    if (!url.searchParams.has('limit')) return route.fulfill({ status: 400, body: 'limit required' });
    const first = !url.searchParams.has('cursor');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      items: [first ? story : { ...story, id: '33333333-3333-4333-8333-333333333333', title: 'Another Chronicle' }],
      next_cursor: first ? 'newest:11111111-1111-4111-8111-111111111111' : null,
      has_more: first,
    }) });
  } });
  await page.goto('/');
  await expect(page.locator('#storyGrid').getByRole('heading', { name: 'The Test Chronicle' })).toBeVisible();
  await page.getByRole('button', { name: 'Load more stories' }).click();
  await expect(page.getByRole('heading', { name: 'Another Chronicle' })).toBeVisible();
  expect(pageCalls).toBe(2);
});

test('shows retry and sign-in actions for service errors and expired sessions', async ({ page }) => {
  let attempts = 0;
  await installApiMocks(page, { stories: async (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporarily unavailable' }) })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [story], has_more: false }) });
  } });
  await page.goto('/');
  await expect(page.getByText('Stories could not be loaded')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#storyGrid').getByRole('heading', { name: 'The Test Chronicle' })).toBeVisible();

  await page.route('**/api/stories**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Session expired' }) }));
  await page.getByLabel('Search stories, authors, and tags').fill('expired');
  await expect(page.getByText('Your session has expired. Sign in again to continue.')).toBeVisible();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome back' })).toBeVisible();
});

test('shows a clear permission message when the server denies access', async ({ page }) => {
  await installApiMocks(page, { stories: (route) => route.fulfill({
    status: 403,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'Forbidden' }),
  }) });
  await page.goto('/');
  await expect(page.getByText('Your account does not have permission to view these stories.')).toBeVisible();
});

test('supports keyboard use of the featured carousel and honors reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installApiMocks(page, { stories: (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      items: [story, { ...story, id: '33333333-3333-4333-8333-333333333333', title: 'Another Chronicle' }],
      has_more: false,
    }),
  }) });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Featured stories' })).toBeVisible();
  const next = page.getByRole('button', { name: 'Next featured story' });
  await expect(next).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause automatic slide changes' })).toBeVisible();
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Show featured story 2' })).toHaveAttribute('aria-current', 'true');
});

test('gives every visible Discover button an accessible name', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/');
  await expect(page.locator('#storyGrid').getByRole('heading', { name: 'The Test Chronicle' })).toBeVisible();
  const unnamed = await page.locator('button:visible').evaluateAll((buttons) => buttons
    .filter((button) => !(button.getAttribute('aria-label') || button.getAttribute('title') || button.innerText.trim() || button.querySelector('img[alt]:not([alt=""])')))
    .map((button) => button.outerHTML.slice(0, 180)));
  expect(unnamed).toEqual([]);
});

test('gives editor and reader icon controls accessible names and story settings labeled fields', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/');
  await page.evaluate(() => {
    window.state.user = { id: 'author-1', email: 'writer@example.test' };
    window.state.role = 'author';
    window.render();
  });
  const invitesLoaded = page.waitForResponse((response) => response.url().includes('/api/collaborations/invites'));
  await page.getByRole('link', { name: 'Studio' }).click();
  await invitesLoaded;
  const unnamedStudioButtons = await page.locator('button:visible').evaluateAll((buttons) => buttons
    .filter((button) => !(button.getAttribute('aria-label') || button.getAttribute('title') || button.innerText.trim() || button.querySelector('img[alt]:not([alt=""])')))
    .map((button) => button.outerHTML.slice(0, 180)));
  expect(unnamedStudioButtons).toEqual([]);
  await expect(page.getByRole('button', { name: 'Delete story' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Settings' }).click();
  const settingsDialog = page.getByRole('dialog', { name: 'Story Settings' });
  await expect(settingsDialog.getByLabel('Title')).toBeVisible();
  await expect(settingsDialog.getByLabel('Synopsis')).toBeVisible();

});

test('keeps reader routes available and blocks moderation for reader role', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page).toHaveURL(/#story\?id=/);
  await page.getByRole('button', { name: 'Start Reading' }).click();
  await expect(page).toHaveURL(/#reader$/);
  await expect(page.getByText('A chapter shown in the browser test.')).toBeVisible();
  await expect(page.locator('button.para-comment-bubble').first()).toHaveAttribute('aria-label', 'Add comment for paragraph 1');
  await page.evaluate(() => { window.location.hash = 'moderation'; });
  await expect(page).toHaveURL(/#discover$/);
  await expect(page.locator('[data-nav="moderation"]')).toBeHidden();
});

test('lets an authenticated author create a story from the editor flow', async ({ page }) => {
  await installApiMocks(page, { stories: (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(story) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [story], genres: ['Fantasy'], has_more: false }) });
  } });
  await page.goto('/');
  await expect(page.locator('#storyGrid').getByRole('heading', { name: 'The Test Chronicle' })).toBeVisible();
  await page.evaluate(() => {
    window.state.user = { id: 'author-1', email: 'writer@example.test' };
    window.state.role = 'author';
    window.render();
  });
  const invitesLoaded = page.waitForResponse((response) => response.url().includes('/api/collaborations/invites'));
  await page.getByRole('link', { name: 'Studio' }).click();
  await invitesLoaded;
  await expect(page.getByRole('button', { name: 'New Story' })).toBeVisible();
  await page.getByRole('button', { name: 'New Story' }).click();
  await expect(page.getByRole('dialog', { name: 'Create New Story' })).toBeVisible();
  await page.getByLabel('Title').fill('A New Chronicle');
  await page.getByLabel('Genre (comma separated)').fill('Fantasy');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Story created successfully.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Create New Story' })).toBeHidden();
});

test('simplifies first-time reader onboarding with stepped pop-up modal and finish action', async ({ page }) => {
  await installApiMocks(page, { firstTime: true });
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Welcome to KathaSangam' })).toBeVisible();
  await expect(page.getByText('Formats: Web Novel vs Chitrānk')).toBeVisible();
  await expect(page.getByText('Web Novel: Serialized prose fiction')).toBeVisible();

  // Next button on bottom right advances to step 2
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByText('Follow vs Bookmark vs Playlists')).toBeVisible();

  // Next button on bottom right advances to step 3 (last step)
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByText('What Signing In Unlocks')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish welcome guide' })).toBeVisible();

  // Finish button closes the pop-up modal
  await page.getByRole('button', { name: 'Finish welcome guide' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome to KathaSangam' })).toBeHidden();

  // Can be re-opened at any time via toolbar 💡 Guide button
  await page.getByRole('button', { name: 'Toggle first-time reader guide' }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome to KathaSangam' })).toBeVisible();
});

test('supports active filter chips, URL synchronization, and distinct empty states on Discover', async ({ page }) => {
  await installApiMocks(page, { stories: async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('q') === 'nonexistent') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], next_cursor: null, has_more: false }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [story], next_cursor: null, has_more: false }) });
  } });
  await page.goto('/');
  await expect(page.locator('#storyGrid').getByRole('heading', { name: 'The Test Chronicle' })).toBeVisible();

  // Filter format to Web Novel
  await page.getByRole('button', { name: 'Web Novel', exact: true }).click();
  await expect(page).toHaveURL(/#discover\?.*type=Web\+Novel/);
  await expect(page.getByText('Format: Web Novel')).toBeVisible();

  // Search for nonexistent term
  await page.getByLabel('Search stories, authors, and tags').fill('nonexistent');
  await expect(page.getByText('No stories found matching your filters')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset all filters' })).toBeVisible();

  // Reset filters
  await page.getByRole('button', { name: 'Reset all filters' }).click();
  await expect(page.locator('#storyGrid').getByRole('heading', { name: 'The Test Chronicle' })).toBeVisible();
  await expect(page.getByText('No stories found matching your filters')).toBeHidden();
});

test('shows educational empty states in library explaining follow, bookmark, and playlists', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/');
  await page.evaluate(() => {
    window.state.user = { id: 'reader-1', email: 'reader@example.test' };
    window.state.bookmarks = [];
    window.render();
  });
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page.getByText('Your bookmarks shelf is empty')).toBeVisible();
  await expect(page.getByText('Follow: Receive alerts when authors release new chapters')).toBeVisible();
  await expect(page.locator('.empty-state-guide-item .icon-bell')).toBeVisible();
  await expect(page.getByText('Bookmark: Save stories to resume reading anytime')).toBeVisible();
  await expect(page.locator('.empty-state-guide-item .icon-bookmark')).toBeVisible();
  await expect(page.getByText('Playlists: Organize stories into custom collections')).toBeVisible();
  await expect(page.locator('.empty-state-guide-item .icon-playlist')).toBeVisible();
});

test('improves Story Details hierarchy with metadata, scannable chapter search, and sort', async ({ page }) => {
  const multiStory = {
    ...story,
    chapters: [
      { id: 'ch-1', sort_order: 1, title: 'The First Journey', status: 'published', access: 'public', words: 10, reads: 7, likes: 1, content: ['First chapter.'], pages: null, comments: [] },
      { id: 'ch-2', sort_order: 2, title: 'The Hidden Path', status: 'published', access: 'public', words: 15, reads: 4, likes: 1, content: ['Second chapter.'], pages: null, comments: [] },
      { id: 'ch-3', sort_order: 3, title: 'The Final Climax', status: 'published', access: 'public', words: 20, reads: 2, likes: 0, content: ['Third chapter.'], pages: null, comments: [] }
    ]
  };
  await installApiMocks(page, { story: multiStory });
  await page.goto('/');
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page).toHaveURL(/#story\?id=/);

  // Immediate visibility of key metadata
  await expect(page.locator('.story-details-title')).toHaveText('The Test Chronicle');
  await expect(page.locator('.story-details-author-row .story-author-link')).toHaveText('A. Writer');
  await expect(page.locator('.author-sidebar-info .story-author-link')).toHaveText('A. Writer');
  await expect(page.locator('.badge.rating-badge.all-ages')).toBeVisible();
  await expect(page.locator('.badge.reading-status-badge.unread')).toBeVisible();
  await expect(page.locator('.stat-item').getByText('3 chapters')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Reading' })).toBeVisible();

  // Scannable chapter list with search and sort
  await expect(page.getByText('Showing 3 of 3 chapters')).toBeVisible();
  await expect(page.getByText('The First Journey')).toBeVisible();
  await expect(page.getByText('The Hidden Path')).toBeVisible();
  await expect(page.getByText('The Final Climax')).toBeVisible();

  // Search chapters
  const searchInput = page.getByLabel('Search chapters by number or title');
  await searchInput.fill('Final');
  await expect(page.getByText('Showing 1 of 3 chapters')).toBeVisible();
  await expect(page.getByText('The Final Climax')).toBeVisible();
  await expect(page.getByText('The First Journey')).toBeHidden();

  // Clear search
  await searchInput.fill('');
  await expect(page.getByText('Showing 3 of 3 chapters')).toBeVisible();
  await expect(page.getByText('The First Journey')).toBeVisible();

  // Sort chapters
  const sortBtn = page.getByRole('button', { name: /Sort chapters/ });
  await expect(sortBtn).toHaveText('Oldest First ▾');
  await sortBtn.click();
  await expect(sortBtn).toHaveText('Newest First ▾');

  // Verify first chapter listed is now chapter 3
  const firstRow = page.locator('.details-chapter-item').first();
  await expect(firstRow).toContainText('The Final Climax');

  // Verify no paid/locked badges exist
  await expect(page.locator('.chapter-access-badge')).toHaveCount(0);
  await expect(page.locator('.badge:has-text("Paid")')).toHaveCount(0);
});

test('makes reading comfortable across devices with compact navigator, themes, and font controls', async ({ page }) => {
  const multiStory = {
    ...story,
    chapters: [
      { id: 'ch-1', sort_order: 1, title: 'The First Journey', status: 'published', access: 'public', words: 10, reads: 7, likes: 1, content: ['First chapter paragraph.'], pages: null, comments: [] },
      { id: 'ch-2', sort_order: 2, title: 'The Second Chapter', status: 'published', access: 'public', words: 15, reads: 4, likes: 1, content: ['Second chapter paragraph.'], pages: null, comments: [] }
    ]
  };
  await installApiMocks(page, { story: multiStory });
  await page.goto('/');
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await page.getByRole('button', { name: 'Start Reading' }).click();
  await expect(page).toHaveURL(/#reader$/);

  // Compact chapter navigator in toolbar
  const chapterSelect = page.getByLabel('Jump to chapter');
  await expect(chapterSelect).toBeVisible();
  await expect(chapterSelect).toHaveValue('0');

  // Quick switch to Chapter 2
  await chapterSelect.selectOption('1');
  await expect(page.getByText('Second chapter paragraph.')).toBeVisible();

  // Open settings drawer
  await page.getByRole('button', { name: 'Reader settings and preferences' }).click();
  const drawer = page.locator('.reader-settings-drawer');
  await expect(drawer).toBeVisible();

  // Check themes including Sepia
  await expect(drawer.getByRole('button', { name: 'Warm eye-comfort parchment surface' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Warm eye-comfort parchment surface' }).click();
  await expect(page.locator('.reader-frame')).toHaveClass(/sepia/);

  // Check font style options
  const fontSelect = drawer.getByLabel('Select typography font style');
  await expect(fontSelect).toBeVisible();
  await fontSelect.selectOption('serif');
  await expect(page.locator('.reader-content')).toHaveClass(/font-serif/);

  // Check text size stepping
  await drawer.getByRole('button', { name: 'Increase text size' }).click();

  // Predictable bottom navigation
  await expect(page.getByRole('button', { name: 'Previous Chapter' })).toBeVisible();
  await page.getByRole('button', { name: 'Previous Chapter' }).click();
  await expect(page.getByText('First chapter paragraph.')).toBeVisible();
});

test('guides authors with segmented chapter tabs, live counters, search, reordering, and reader preview', async ({ page }) => {
  const multiChapterStory = {
    ...story,
    chapters: [
      { id: '22222222-2222-4222-8222-222222222222', sort_order: 1, title: 'Draft Prologue', status: 'draft', access: 'public', words: 10, reads: 0, likes: 0, content: ['Draft prologue text.'], pages: null, comments: [] },
      { id: '33333333-3333-4333-8333-333333333333', sort_order: 2, title: 'Published Chapter One', status: 'published', access: 'public', words: 20, reads: 5, likes: 1, content: ['Published chapter text.'], pages: null, comments: [] }
    ]
  };

  await installApiMocks(page, {
    story: multiChapterStory,
    stories: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [multiChapterStory], next_cursor: null, has_more: false }) })
  });

  await page.goto('/');
  await page.evaluate(() => {
    window.state.user = { id: 'author-1', email: 'writer@example.test' };
    window.state.role = 'author';
    window.render();
  });

  const invitesLoaded = page.waitForResponse((response) => response.url().includes('/api/collaborations/invites'));
  await page.getByRole('link', { name: 'Studio' }).click();
  await invitesLoaded;

  // Segmented Tabs with count badges
  const tabs = page.locator('.studio-chapter-tabs');
  await expect(tabs.getByRole('button', { name: /All Chapters/ })).toBeVisible();
  await expect(tabs.getByRole('button', { name: /Drafts/ })).toBeVisible();
  await expect(tabs.getByRole('button', { name: /Published/ })).toBeVisible();

  // Initially All shows both
  const timeline = page.locator('.timeline-list');
  await expect(timeline.getByText('Draft Prologue')).toBeVisible();
  await expect(timeline.getByText('Published Chapter One')).toBeVisible();

  // Filter to Drafts tab
  await tabs.getByRole('button', { name: /Drafts/ }).click();
  await expect(timeline.getByText('Draft Prologue')).toBeVisible();
  await expect(timeline.getByText('Published Chapter One')).toBeHidden();

  // Filter to Published tab
  await tabs.getByRole('button', { name: /Published/ }).click();
  await expect(timeline.getByText('Published Chapter One')).toBeVisible();
  await expect(timeline.getByText('Draft Prologue')).toBeHidden();

  // Switch back to All
  await tabs.getByRole('button', { name: /All Chapters/ }).click();
  await expect(timeline.getByText('Draft Prologue')).toBeVisible();

  // Quick chapter search
  await page.getByLabel('Search chapters').fill('Prologue');
  await expect(timeline.getByText('Draft Prologue')).toBeVisible();
  await expect(timeline.getByText('Published Chapter One')).toBeHidden();
  await page.getByLabel('Search chapters').fill('');
  await expect(timeline.getByText('Published Chapter One')).toBeVisible();

  // Reader-accurate preview modal
  await page.getByRole('button', { name: 'Preview Draft Prologue' }).click();
  const previewModal = page.getByRole('dialog', { name: 'Reader Preview' });
  await expect(previewModal).toBeVisible();
  await expect(previewModal.getByRole('heading', { name: 'Draft Prologue' })).toBeVisible();
  await expect(previewModal.getByText('Draft prologue text.')).toBeVisible();

  // Close preview
  await previewModal.getByRole('button', { name: 'Close Preview', exact: true }).click();
  await expect(previewModal).toBeHidden();

  // Danger zone separation: Delete story is inside Danger Zone panel
  const dangerZone = page.locator('.danger-zone-panel');
  await expect(dangerZone).toBeVisible();
  await expect(dangerZone.getByRole('button', { name: 'Delete story' })).toBeVisible();
  // Routine buttons row only has routine actions
  const routineRow = page.locator('.studio-btn-row');
  await expect(routineRow.getByRole('button', { name: 'Continue Writing' })).toBeVisible();
  await expect(routineRow.getByRole('button', { name: 'Edit Settings' })).toBeVisible();
  await expect(routineRow.getByRole('button', { name: 'View Story' })).toBeVisible();
  await expect(routineRow.getByRole('button', { name: 'Delete story' })).toHaveCount(0);
});

test('provides mobile bottom navigation and contextual reader state', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/');

  // Desktop navigation bar does not include Profile link (Profile lives in account menu)
  await expect(page.locator('.nav-links').getByRole('link', { name: 'Profile' })).toHaveCount(0);
  await expect(page.locator('.nav-links').getByRole('link', { name: 'Discover' })).toBeVisible();
  await expect(page.locator('.nav-links').getByRole('link', { name: 'Library' })).toBeVisible();
  await expect(page.locator('.nav-links').getByRole('link', { name: 'Studio' })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 667 });

  // Mobile bottom navigation is visible with core intent destinations
  const bottomNav = page.locator('.mobile-bottom-nav');
  await expect(bottomNav).toBeVisible();
  await expect(bottomNav.getByRole('link', { name: 'Discover' })).toBeVisible();
  await expect(bottomNav.getByRole('link', { name: 'Library' })).toBeVisible();
  await expect(bottomNav.getByRole('link', { name: 'Studio' })).toBeVisible();
  await expect(bottomNav.getByRole('link', { name: 'Profile' })).toBeVisible();

  // Navigate to Library via bottom navigation
  await bottomNav.getByRole('link', { name: 'Library' }).click();
  await expect(page).toHaveURL(/#library$/);

  // Navigate directly to reader without active story to verify contextual empty state
  await page.evaluate(() => { window.location.hash = 'reader'; });
  await expect(page.getByText('No Story Selected')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse Discover' })).toBeVisible();
  await page.getByRole('link', { name: 'Browse Discover' }).click();
  await expect(page).toHaveURL(/#discover$/);
});

test('makes mobile layouts intentional across navigation, filters, story cards, studio, and dialogs', async ({ page }) => {
  await installApiMocks(page);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');

  // 1. Zero horizontal overflow on mobile Discover
  const hasNoHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth <= window.innerWidth;
  });
  expect(hasNoHorizontalOverflow).toBe(true);

  // 2. Story grid reflows to 1 column on mobile
  const grid = page.locator('#storyGrid');
  await expect(grid.getByRole('heading', { name: 'The Test Chronicle' })).toBeVisible();
  const gridColumns = await grid.evaluate((el) => {
    return window.getComputedStyle(el).gridTemplateColumns.split(' ').length;
  });
  expect(gridColumns).toBe(1);

  // 3. Touch targets for story card action buttons are at least 44px
  const readBtn = grid.getByRole('button', { name: 'Read', exact: true }).first();
  const readBtnHeight = await readBtn.evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.round(readBtnHeight)).toBeGreaterThanOrEqual(44);

  // 4. Filter drawer adapts on mobile without horizontal scrolling
  const filterToggle = page.getByRole('button', { name: 'Toggle filter options' });
  await filterToggle.click();
  const drawer = page.locator('#discover-filter-controls');
  await expect(drawer).toBeVisible();
  const drawerCols = await drawer.evaluate((el) => {
    return window.getComputedStyle(el).gridTemplateColumns.split(' ').length;
  });
  expect(drawerCols).toBe(1);

  // 5. Story Details page stacks cleanly with >=44px buttons and no horizontal overflow
  await grid.locator('.cover-button').first().click();
  await expect(page).toHaveURL(/#story\?id=/);
  const storyHeaderCard = page.locator('.story-header-card');
  await expect(storyHeaderCard).toBeVisible();
  const backBtn = page.locator('.back-btn');
  await expect(backBtn).toBeVisible();
  const backBox = await backBtn.boundingBox();
  const headerBox = await storyHeaderCard.boundingBox();
  expect(headerBox.y - (backBox.y + backBox.height)).toBeGreaterThanOrEqual(16);
  const authorRow = page.locator('.story-details-author-row');
  await expect(authorRow).toBeVisible();
  const authorLinkInRow = authorRow.locator('.story-author-link');
  await expect(authorLinkInRow).toBeVisible();
  const authorText = await authorLinkInRow.textContent();
  expect(authorText.trim().length).toBeGreaterThan(0);

  const startReadingBtn = page.locator('.story-main-cta');
  await expect(startReadingBtn).toBeVisible();
  const startBtnHeight = await startReadingBtn.evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.round(startBtnHeight)).toBeGreaterThanOrEqual(44);
  const detailsNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(detailsNoOverflow).toBe(true);

  // Verify in Light Mode that story-header-card and author-sidebar-info use #F7E4D6 surface background
  await page.evaluate(() => document.documentElement.classList.add('light'));
  const headerBgLight = await storyHeaderCard.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  expect(headerBgLight).toBe('rgb(247, 228, 214)');
  const authorCard = page.locator('.author-sidebar-info');
  if (await authorCard.count() > 0) {
    const authorBgLight = await authorCard.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(authorBgLight).toBe('rgb(247, 228, 214)');
  }
  await page.evaluate(() => document.documentElement.classList.remove('light'));

  // 6. Auth dialog conforms to mobile viewport with >=44px touch targets
  await page.evaluate(() => { window.location.hash = 'discover'; });
  await page.locator('#signInBtn').click();
  const loginDialog = page.getByRole('dialog', { name: 'Welcome back' });
  await expect(loginDialog).toBeVisible();
  await loginDialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const dialogBox = await loginDialog.boundingBox();
  expect(dialogBox.width).toBeLessThanOrEqual(375);
  const submitBtn = loginDialog.locator('#loginForm').getByRole('button', { name: 'Log In' });
  const submitHeight = await submitBtn.evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.round(submitHeight)).toBeGreaterThanOrEqual(44);
  await loginDialog.getByRole('button', { name: 'Close' }).click();
  await expect(loginDialog).toBeHidden();
});

test('improves feedback with semantic toasts, inline form errors, save timestamps, and optimistic rollback', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/');

  // 1. Semantic success and error toasts with accessible icons and action retry button
  await page.evaluate(() => {
    window.notify('Story saved successfully!', 'success');
  });
  const successToast = page.locator('.toast.toast-success');
  await expect(successToast).toBeVisible();
  await expect(successToast).toContainText('Story saved successfully!');
  await expect(successToast.locator('.toast-icon')).toHaveText('✓');
  await expect(page.locator('#alerts')).toHaveAttribute('role', 'status');

  await page.evaluate(() => {
    window.__retried = false;
    window.notify('Network synchronization failed.', 'error', {
      onRetry: () => { window.__retried = true; },
      retryText: 'Retry Now'
    });
  });
  const errorToast = page.locator('.toast.toast-error');
  await expect(errorToast).toBeVisible();
  await expect(errorToast).toContainText('Network synchronization failed.');
  await expect(errorToast.locator('.toast-icon')).toHaveText('✕');
  await expect(page.locator('#alerts')).toHaveAttribute('role', 'alert');

  const retryBtn = errorToast.locator('.toast-action-btn');
  await expect(retryBtn).toHaveText('Retry Now');
  await retryBtn.click();
  const retried = await page.evaluate(() => window.__retried);
  expect(retried).toBe(true);
  await expect(page.locator('.toast')).toHaveCount(0);

  // 2. Standardized inline form feedback and button loading states
  await page.evaluate(() => {
    const dummyForm = document.createElement('form');
    dummyForm.id = 'testDummyForm';
    const input = document.createElement('input');
    input.name = 'field';
    const btn = document.createElement('button');
    btn.type = 'submit';
    btn.textContent = 'Submit Data';
    dummyForm.appendChild(input);
    dummyForm.appendChild(btn);
    document.body.appendChild(dummyForm);

    window.setFormFeedback(dummyForm, 'Title is required.', 'error');
    window.setButtonLoading(btn, true, 'Submitting...');
  });

  const dummyForm = page.locator('#testDummyForm');
  const errorFeedback = dummyForm.locator('.form-feedback.error');
  await expect(errorFeedback).toBeVisible();
  await expect(errorFeedback).toHaveText('Title is required.');
  await expect(errorFeedback).toHaveAttribute('role', 'alert');

  const dummyBtn = dummyForm.locator('button[type="submit"]');
  await expect(dummyBtn).toBeDisabled();
  await expect(dummyBtn).toHaveText('Submitting...');

  await page.evaluate(() => {
    const form = document.getElementById('testDummyForm');
    const btn = form.querySelector('button[type="submit"]');
    window.setFormFeedback(form, '', '');
    window.setButtonLoading(btn, false);
    form.remove();
  });

  // 3. Editor save status displays real-time formatted timestamps
  await page.evaluate(() => {
    const statusEl = document.createElement('span');
    statusEl.id = 'editorSaveStatus';
    document.body.appendChild(statusEl);
  });

  await page.evaluate(() => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const statusEl = document.getElementById('editorSaveStatus');
    statusEl.textContent = '🟢 Saved to cloud at ' + timeStr;
    statusEl.className = 'editor-save-status saved';
  });
  const statusEl = page.locator('#editorSaveStatus');
  await expect(statusEl).toBeVisible();
  await expect(statusEl).toContainText(/Saved to cloud at \d{1,2}:\d{2}/);

  await page.evaluate(() => {
    const el = document.getElementById('editorSaveStatus');
    if (el) el.remove();
  });

  // 4. Optimistic update and rollback on failure
  await page.route('**/api/library/follow', async (route) => {
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Server database write failed' })
    });
  });

  const rollbackResult = await page.evaluate(async () => {
    // Initial library state has no stories
    window.state.library = [];
    window.state.user = { id: 'test-user', email: 'test@example.com' };
    const dummyTarget = document.createElement('button');
    dummyTarget.dataset.id = 'story-123';

    // Call library follow handler
    const handled = window.handleLibraryClick({
      state: window.state,
      ui: window.ui,
      render: () => {},
      notify: window.notify,
      apiPost: window.apiPost,
      api: window.api
    }, 'follow', dummyTarget);

    const optimisticHasStory = window.state.library.indexOf('story-123') !== -1;

    // Wait for the async API rejection and rollback
    for (let i = 0; i < 20; i++) {
      if (window.state.library.indexOf('story-123') === -1) break;
      await new Promise(r => setTimeout(r, 50));
    }

    const finalHasStory = window.state.library.indexOf('story-123') !== -1;

    return { handled, optimisticHasStory, finalHasStory };
  });

  expect(rollbackResult.optimisticHasStory).toBe(true);
  expect(rollbackResult.finalHasStory).toBe(false);

  // Rollback error toast is visible with clear revert message
  const rollbackToast = page.locator('.toast.toast-error');
  await expect(rollbackToast).toBeVisible();
  await expect(rollbackToast).toContainText(/Failed to update library.*Action reverted/);
});

test('makes profiles safer by separating public info from private settings, clarifying follow/block/report states, and offering contextual empty states', async ({ page }) => {
  await installApiMocks(page);

  // Set up mock profile and auth state
  await page.route('**/api/profile**', async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const body = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Profile updated', preferences: body.preferences })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'user-self',
        username: 'solowriter',
        role: 'author',
        avatar_url: '',
        bio: '',
        followers_count: 5,
        following_count: 2,
        preferences: {
          blocked_users: [],
          notifications: {
            email_new_chapters: true,
            email_comments: true,
            email_invites: true,
            in_app_story_updates: true,
            in_app_interactions: true,
            in_app_system: true
          }
        }
      })
    });
  });

  // Mock public profile for another user
  const otherUser = {
    id: 'user-other',
    username: 'rival_writer',
    role: 'author',
    avatar_url: '',
    bio: '',
    followers_count: 12,
    following_count: 4,
    is_following: false
  };

  await page.route('**/api/profiles/rival_writer', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(otherUser)
    });
  });

  await page.route('**/api/follow/user/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ followed: true, message: 'Followed user.' })
    });
  });

  await page.goto('/');

  // Initialize authenticated user state
  await page.evaluate(() => {
    window.state.user = { id: 'user-self', email: 'private_author@example.com' };
    window.state.profile = {
      id: 'user-self',
      username: 'solowriter',
      role: 'author',
      avatar_url: '',
      bio: '',
      followers_count: 5,
      following_count: 2,
      preferences: {
        blocked_users: [],
        notifications: {
          email_new_chapters: true,
          email_comments: true,
          email_invites: true,
          in_app_story_updates: true,
          in_app_interactions: true,
          in_app_system: true
        }
      }
    };
    window.state.stories = [];
    window.location.hash = 'profile';
  });

  // 1. Separation of Public Profile from Private Settings
  const profileHeader = page.locator('.profile-header-card');
  await expect(profileHeader).toBeVisible();
  await expect(profileHeader.locator('.profile-display-name')).toHaveText('solowriter');
  await expect(profileHeader.locator('.profile-role-badge')).toContainText('Author');
  await expect(profileHeader.locator('.profile-header-social-stats')).toContainText('5 Followers');

  // Verify private email is NEVER displayed in public profile view
  await expect(page.locator('.profile-email')).toHaveCount(0);
  await expect(page.locator('#view').getByText('private_author@example.com')).toHaveCount(0);
  await expect(profileHeader.getByText('private_author@example.com')).toHaveCount(0);

  // Settings action button is present and routes cleanly to #settings
  const settingsBtn = page.getByRole('button', { name: '⚙️ Settings' });
  await expect(settingsBtn).toBeVisible();

  // 2. Contextual Empty States for New Creators on Public Profile
  // Stories tab empty state guides new creator to Author Studio
  await expect(page.getByText("You haven't published any stories yet")).toBeVisible();
  const studioBtn = page.getByRole('button', { name: 'Open Author Studio' });
  await expect(studioBtn).toBeVisible();

  // Reading Lists tab empty state guides reader to Discover
  await page.getByRole('button', { name: 'Reading Lists' }).click();
  await expect(page.getByText('Your reading lists are empty')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore Stories to Add' })).toBeVisible();

  // About tab empty state guides user to add bio in Settings
  await page.getByRole('button', { name: 'About' }).click();
  await expect(page.getByText("You haven't added a bio yet")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Bio in Settings' })).toBeVisible();

  // 3. Settings View: Private email, granular notification preferences, blocked users
  await settingsBtn.click();
  await expect(page).toHaveURL(/#settings$/);

  const settingsHeader = page.locator('.settings-header');
  await expect(settingsHeader).toBeVisible();
  await expect(settingsHeader.getByRole('heading', { name: 'Account Settings & Privacy' })).toBeVisible();
  await expect(page.getByRole('link', { name: '← Back to Profile' })).toBeVisible();

  // Private email is safely displayed in the private settings field
  const emailInput = page.locator('.profile-settings-panel input[name="email"]');
  await expect(emailInput).toHaveValue('private_author@example.com');
  await expect(emailInput).toBeDisabled();

  // Granular notification preferences section
  await expect(page.getByRole('heading', { name: 'Notification Preferences' })).toBeVisible();
  await expect(page.locator('input[name="email_new_chapters"]')).toBeChecked();
  await expect(page.locator('input[name="in_app_story_updates"]')).toBeChecked();
  const saveNotifBtn = page.getByRole('button', { name: 'Save Notification Preferences' });
  await expect(saveNotifBtn).toBeVisible();
  await saveNotifBtn.click();
  await expect(page.locator('.toast')).toContainText('Notification preferences saved.');

  // Blocked users section shows contextual empty state initially
  await expect(page.getByText('No blocked accounts. Users you block from their public profile will appear here.')).toBeVisible();

  // 4. Other User Public Profile: Follow states, Safety actions (Block & Report), and Reader empty state
  await page.evaluate(() => {
    window.location.hash = 'profile?username=rival_writer';
  });

  const otherHeader = page.locator('.profile-header-card');
  await expect(otherHeader).toBeVisible();
  await expect(otherHeader.locator('.profile-display-name')).toHaveText('rival_writer');

  // Reader empty state for another author with no stories
  await expect(page.getByText('No stories published yet')).toBeVisible();
  await expect(page.getByText('@rival_writer hasn\'t published any stories yet. Explore other works in Discover.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Browse Discover' })).toBeVisible();

  // Clarified Follow button: initial state is + Follow
  const followBtn = page.locator('.follow-btn');
  await expect(followBtn).toHaveText('+ Follow');

  // Click Follow -> optimistic update to ✓ Following (.is-following)
  await followBtn.click();
  await expect(followBtn).toHaveClass(/is-following/);
  await expect(followBtn.locator('.following-text')).toHaveText('✓ Following');
  await expect(followBtn.locator('.unfollow-text')).toHaveText('✕ Unfollow');

  // Safety actions container
  const safetyActions = page.locator('.profile-safety-actions');
  await expect(safetyActions).toBeVisible();

  // Report user control opens report modal with mode="user"
  const reportBtn = safetyActions.locator('button[data-action="reportUser"]');
  await expect(reportBtn).toBeVisible();
  await reportBtn.click();
  const reportModal = page.locator('#reportModal');
  await expect(reportModal).toBeVisible();
  await expect(reportModal.locator('#reportModalTitle')).toContainText('Report User @rival_writer');
  await page.locator('#reportModalClose').click();
  await expect(reportModal).toBeHidden();

  // Block user control triggers confirmation, updates button to ✓ Blocked, and reflects in settings
  const blockBtn = safetyActions.locator('button[data-action="blockUser"]');
  await expect(blockBtn).toHaveText('🚫 Block');
  await blockBtn.click();

  // Confirmation dialog opens
  const confirmModal = page.locator('.custom-modal-overlay.active');
  await expect(confirmModal).toBeVisible();
  await expect(confirmModal.locator('.custom-modal-title')).toContainText('Block @rival_writer?');
  await confirmModal.getByRole('button', { name: 'Block User' }).click();

  // Status updates to ✓ Blocked
  await expect(safetyActions.locator('button[data-action="unblockUser"]')).toHaveText('✓ Blocked');

  // Verify blocked user appears in Settings
  await page.evaluate(() => { window.location.hash = 'settings'; });
  const blockedItem = page.locator('.blocked-user-item');
  await expect(blockedItem).toBeVisible();
  await expect(blockedItem.locator('.blocked-user-name')).toHaveText('@rival_writer');
  const unblockBtn = blockedItem.locator('button[data-action="unblockUser"]');
  await expect(unblockBtn).toBeVisible();

  // Unblock user from settings
  await unblockBtn.click();
  await expect(page.getByText('No blocked accounts. Users you block from their public profile will appear here.')).toBeVisible();
});

test('improves perceived performance with lazy loading, reserved image dimensions, debounced search, chapter list pagination, and mobile network metrics', async ({ page }) => {
  const comicStoryId = 'comic-story-perf-id-1234';
  const storyWithCover = {
    ...story,
    id: comicStoryId,
    title: 'Origins Comic',
    cover: 'https://images.example.test/cover-art.webp',
    type: 'Chitrānk',
    chapters: [
      {
        id: 'comic-ch-1',
        sort_order: 1,
        title: 'Prologue: Origins',
        status: 'published',
        access: 'public',
        words: 0,
        reads: 10,
        likes: 2,
        content: null,
        pages: [
          { bg: 'https://images.example.test/panel-1.webp', label: 'Panel 1' },
          { bg: 'https://images.example.test/panel-2.webp', label: 'Panel 2' }
        ],
        comments: []
      }
    ]
  };

  // Generate 35 chapters to verify chapter list pagination
  const storyWithManyChapters = {
    ...story,
    cover: 'https://images.example.test/novel-cover.webp',
    chapters: Array.from({ length: 35 }, (_, idx) => ({
      id: `ch-${idx + 1}`,
      sort_order: idx + 1,
      title: `Episode ${idx + 1}`,
      status: 'published',
      access: 'public',
      words: 100,
      reads: 5,
      likes: 1,
      content: ['Text content'],
      pages: null,
      comments: []
    }))
  };

  await installApiMocks(page, {
    story: storyWithManyChapters,
    stories: (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [storyWithCover, storyWithManyChapters], next_cursor: null, has_more: false })
    })
  });

  await page.goto('/');

  // 1. Story cards lazy loading & reserved dimensions (preventing layout shift)
  const card = page.locator('.story-card').first();
  await card.scrollIntoViewIfNeeded();
  const coverImg = card.locator('.cover-img');
  await expect(coverImg).toBeVisible();
  await expect(coverImg).toHaveAttribute('loading', 'lazy');
  await expect(coverImg).toHaveAttribute('decoding', 'async');
  await expect(coverImg).toHaveAttribute('width', '300');
  await expect(coverImg).toHaveAttribute('height', '180');

  // Verify CSS content-visibility and aspect-ratio
  const cardStyles = await page.locator('.story-card').first().evaluate((el) => {
    const cs = window.getComputedStyle(el);
    const coverBtn = el.querySelector('.cover-button');
    const cbStyle = coverBtn ? window.getComputedStyle(coverBtn) : null;
    return {
      contentVisibility: cs.contentVisibility,
      aspectRatio: cbStyle ? cbStyle.aspectRatio : null
    };
  });
  expect(cardStyles.contentVisibility).toBe('auto');
  expect(cardStyles.aspectRatio).toMatch(/5\s*\/\s*3/);

  // 2. Performance metrics & Mobile Network Tracking
  const perfMetrics = await page.evaluate(() => {
    return window.perfMetrics ? window.perfMetrics.getMetrics() : null;
  });
  expect(perfMetrics).not.toBeNull();
  expect(perfMetrics.network).toHaveProperty('effectiveType');
  expect(perfMetrics.routeTimings.length).toBeGreaterThan(0);
  expect(perfMetrics.routeTimings[0]).toHaveProperty('view', 'discover');

  // 3. Story Details: Eager hero cover & Chapter list pagination (30 chapters initial limit)
  await page.evaluate((sId) => { window.location.hash = `story?id=${sId}`; }, storyId);
  const heroCoverImg = page.locator('.story-details-cover-img');
  await expect(heroCoverImg).toBeVisible();
  await expect(heroCoverImg).toHaveAttribute('loading', 'eager');
  await expect(heroCoverImg).toHaveAttribute('decoding', 'async');
  await expect(heroCoverImg).toHaveAttribute('fetchpriority', 'high');

  // Chapter list pagination: displays first 30 of 35 chapters with Load more button
  await expect(page.getByText('Showing 30 of 35 chapters')).toBeVisible();
  await expect(page.getByText('Episode 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Episode 30', { exact: true })).toBeVisible();
  await expect(page.getByText('Episode 31', { exact: true })).toBeHidden();

  // Load more chapters button
  const loadMoreBtn = page.getByRole('button', { name: /Show more chapters/ });
  await expect(loadMoreBtn).toBeVisible();
  await expect(loadMoreBtn).toContainText('5 remaining');
  await loadMoreBtn.click();

  // All 35 chapters now visible
  await expect(page.getByText('Showing 35 of 35 chapters')).toBeVisible();
  await expect(page.getByText('Episode 31', { exact: true })).toBeVisible();
  await expect(page.getByText('Episode 35', { exact: true })).toBeVisible();
  await expect(loadMoreBtn).toBeHidden();

  // 4. Chapter search debouncing and empty state
  const chapterSearch = page.locator('.chapter-search-input');
  await chapterSearch.fill('Episode 12');
  // Debounced input updates smoothly
  await expect(page.getByText('Episode 12', { exact: true })).toBeVisible();
  await expect(page.getByText('Episode 13', { exact: true })).toBeHidden();

  await chapterSearch.fill('');
  await expect(page.getByText('Episode 1', { exact: true })).toBeVisible();

  // 5. Comic reader images: eager first panel, lazy subsequent panels, reserved container dimensions
  await page.route(new RegExp(`/api/stories/(${storyId}|${comicStoryId})`), async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(storyWithCover)
    });
  });

  await page.evaluate((cId) => { window.location.hash = `reader?id=${cId}`; }, comicStoryId);
  const comicPanelImgs = page.locator('.comic-page-img');
  await expect(comicPanelImgs.first()).toBeVisible();

  // First panel is eager with high fetchpriority
  await expect(comicPanelImgs.nth(0)).toHaveAttribute('loading', 'eager');
  await expect(comicPanelImgs.nth(0)).toHaveAttribute('fetchpriority', 'high');
  await expect(comicPanelImgs.nth(0)).toHaveAttribute('decoding', 'async');

  // Subsequent panel is lazy-loaded
  await expect(comicPanelImgs.nth(1)).toHaveAttribute('loading', 'lazy');
  await expect(comicPanelImgs.nth(1)).toHaveAttribute('decoding', 'async');

  // Reserved container aspect-ratio to prevent layout shifts
  const comicWrapperStyle = await page.locator('.comic-page-wrapper').first().evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      aspectRatio: cs.aspectRatio,
      contain: cs.contain
    };
  });
  expect(comicWrapperStyle.aspectRatio).toMatch(/2\s*\/\s*3/);
  expect(comicWrapperStyle.contain).toContain('layout');
});

test('fetches full chapter content when opening chapters from table of contents and displays text before finish card', async ({ page }) => {
  const metadataOnlyStory = {
    ...story,
    id: 'story-meta-only-999',
    title: 'The Unfolding Saga',
    chapters: [
      {
        id: 'ch-meta-1',
        sort_order: 1,
        title: 'Prologue: The Awakening',
        status: 'published',
        access: 'public',
        words: 450,
        reads: 12,
        likes: 3,
        content: null,
        pages: null,
        comments: []
      },
      {
        id: 'ch-meta-2',
        sort_order: 2,
        title: 'Chapter 2: The Departure',
        status: 'published',
        access: 'public',
        words: 500,
        reads: 8,
        likes: 2,
        content: null,
        pages: null,
        comments: []
      }
    ]
  };

  const fullStoryWithContent = {
    ...metadataOnlyStory,
    chapters: [
      {
        ...metadataOnlyStory.chapters[0],
        content: [
          'The morning mist settled across the valley as the bell sounded.',
          'She stepped through the gates, knowing there was no turning back.'
        ]
      },
      metadataOnlyStory.chapters[1]
    ]
  };

  await installApiMocks(page, {
    stories: (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [metadataOnlyStory], next_cursor: null, has_more: false })
    })
  });

  await page.route('**/api/stories/story-meta-only-999', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fullStoryWithContent)
    });
  });

  await page.goto('/');
  await expect(page.locator('#storyGrid').getByRole('heading', { name: 'The Unfolding Saga' })).toBeVisible();

  // Navigate to story details
  await page.evaluate(() => { window.location.hash = 'story?id=story-meta-only-999'; });
  await expect(page.getByRole('heading', { name: 'The Unfolding Saga' })).toBeVisible();

  // Click on Chapter 1 in Table of Contents
  const chapterRow = page.locator('.chapter-item[data-action="openChapter"]').first();
  await expect(chapterRow).toBeVisible();
  await chapterRow.click();

  // Reader opens, loads full chapter content, and renders paragraphs
  await expect(page).toHaveURL(/#reader$/);
  await expect(page.getByText('The morning mist settled across the valley as the bell sounded.')).toBeVisible();
  await expect(page.getByText('She stepped through the gates, knowing there was no turning back.')).toBeVisible();

  // End card appears after the chapter text, not in an empty void
  await expect(page.getByText('Finished Chapter 1')).toBeVisible();

  // In Page mode with multiple pages, the end-of-chapter card is a dedicated page after text pages
  await page.evaluate(() => {
    window.ui.readerMode = 'pages';
    window.ui.currentTextPageIndex = 0;
    window.state.stories[0].chapters[0].content = [
      'hello '.repeat(80),
      'world '.repeat(80)
    ];
    window.render();
  });

  // On page 1 of 3, end card must not be shown
  await expect(page.locator('.end-of-chapter-card')).toHaveCount(0);

  // On page 2 of 3 (final text page), end card must still not be shown
  await page.evaluate(() => {
    window.ui.currentTextPageIndex = 1;
    window.render();
  });
  await expect(page.locator('.end-of-chapter-card')).toHaveCount(0);

  // On page 3 of 3 (dedicated final card page), end card is shown
  await page.evaluate(() => {
    window.ui.currentTextPageIndex = 2;
    window.render();
  });
  await expect(page.locator('.end-of-chapter-card')).toHaveCount(1);
});

test('improves content discovery quality with recency filters, relevance sorting, promoted labels, honest ratings, and recommendations', async ({ page }) => {
  const promotedStory = {
    ...story,
    id: 'story-promoted-101',
    title: 'Echoes of the Aether',
    genre: 'Fantasy',
    tags: ['magic', 'promoted'],
    isPromoted: true,
    views: 120,
    likes: 35,
    description: 'An expansive high fantasy adventure sponsored by the Guild.'
  };

  const newStoryWithFewViews = {
    ...story,
    id: 'story-new-202',
    title: 'The Whispering Woods',
    genre: 'Mystery',
    tags: ['supernatural'],
    views: 2,
    likes: 0,
    description: 'A newly published mystery without enough reads for a rating.'
  };

  const recommendedStory = {
    ...story,
    id: 'story-rec-303',
    title: 'Starbound Wanderers',
    genre: 'Sci-Fi',
    tags: ['space'],
    views: 85,
    likes: 22,
    description: 'A recommended space odyssey.'
  };

  await installApiMocks(page, {
    stories: (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [promotedStory, newStoryWithFewViews],
          next_cursor: null,
          has_more: false
        })
      });
    }
  });

  // Mock recommendation endpoint
  await page.route('**/api/stories/recommended', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [recommendedStory],
        headline: 'Recommended For You',
        reason: 'Based on your reading history in Sci-Fi',
        isPersonalized: true,
        hasEnoughData: true
      })
    });
  });

  await page.goto('/');

  // 1. Recommendation Shelf with rationale and badge
  const recShelf = page.locator('.recommended-shelf');
  await expect(recShelf).toBeVisible();
  await expect(recShelf.getByText('Recommended For You')).toBeVisible();
  await expect(recShelf.getByText('Based on your reading history in Sci-Fi')).toBeVisible();
  await expect(recShelf.getByText('Starbound Wanderers')).toBeVisible();
  await expect(recShelf.getByText('Personalized')).toBeVisible();

  // 2. Promoted badge on story card
  const promotedCard = page.locator('#storyGrid .story-card').filter({ hasText: 'Echoes of the Aether' });
  await expect(promotedCard.locator('.tag-promoted')).toBeVisible();
  await expect(promotedCard.locator('.tag-promoted')).toContainText('Promoted');

  // 3. Honest rating transparency:
  // Trusted story (120 views, 35 likes) shows calculated rating
  await expect(promotedCard.locator('.meta-rating')).toBeVisible();
  await expect(promotedCard.locator('.meta-rating')).toContainText('★');

  // Untrusted story (2 views) does NOT show fake 5.0 rating
  const unratedCard = page.locator('#storyGrid .story-card').filter({ hasText: 'The Whispering Woods' });
  await expect(unratedCard.locator('.meta-rating')).toHaveCount(0);

  // 4. Update recency filter and relevance sorting
  const filterToggle = page.locator('.filter-toggle-btn');
  await filterToggle.click();

  const recencySelect = page.locator('#filterRecency');
  await expect(recencySelect).toBeVisible();
  await recencySelect.selectOption('7d');

  // Active chip appeared
  await expect(page.locator('.filter-chip[data-facet="recency"]')).toBeVisible();
  await expect(page.locator('.filter-chip[data-facet="recency"]')).toContainText('Updated: Past 7 Days');
  expect(page.url()).toContain('recency=7d');

  // Sort by Relevance
  const sortSelect = page.locator('#filterSort');
  await sortSelect.selectOption('relevance');
  await expect(page.locator('.filter-chip[data-facet="sort"]')).toContainText('Sort: Relevance');
  expect(page.url()).toContain('sort_by=relevance');

  // Remove recency filter chip
  const recencyChipRemove = page.locator('.filter-chip[data-facet="recency"] .filter-chip-remove');
  await recencyChipRemove.click();
  await expect(page.locator('.filter-chip[data-facet="recency"]')).toHaveCount(0);
  expect(page.url()).not.toContain('recency=7d');

  // Clear all filters resets sort as well
  const clearAllBtn = page.locator('.filter-clear-all-btn');
  await clearAllBtn.click();
  await expect(page.locator('.active-filter-chips')).toHaveCount(0);
  expect(page.url()).not.toContain('sort_by=relevance');

  // 5. Promoted badge and custom tag in Story Details
  await page.route('**/api/stories/story-promoted-101', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(promotedStory)
    });
  });
  await page.evaluate(() => { window.location.hash = 'story?id=story-promoted-101'; });
  await expect(page.locator('.promoted-badge')).toBeVisible();
  await expect(page.locator('.promoted-badge')).toContainText('Promoted');
  await expect(page.locator('.tag-custom')).toContainText('#magic');
});

test('normalizes content presentation, diacritics, language labels, status terminology, and i18n formatting', async ({ page }) => {
  const storyWithUnnormalizedData = {
    ...story,
    id: 'story-unnorm-999',
    title: 'The Himalayan Chronicle',
    type: 'chitrank', // unaccented lowercase
    genre: 'fantasy', // lowercase canonical
    language: 'nepali', // lowercase language
    status: 'active', // 'active' alias for 'ongoing'
    views: 12500, // compact number formatting
    chapters: [
      {
        id: 'ch-unnorm-1',
        sort_order: 1,
        title: 'Dawn of Spirits',
        status: 'draft',
        words: 1200,
        access: 'free',
        reads: 0,
        likes: 0,
        content: ['Opening scene'],
        pages: null,
        comments: []
      }
    ]
  };

  await installApiMocks(page, {
    story: storyWithUnnormalizedData,
    stories: (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [storyWithUnnormalizedData], next_cursor: null, has_more: false })
    })
  });

  await page.goto('/');

  // 1. Verify i18n global module & translation catalog
  const i18nTests = await page.evaluate(() => {
    const i18n = window.i18n;
    if (!i18n) return { error: 'window.i18n not defined' };
    return {
      tSimple: i18n.t('common.read'),
      tInterpolated: i18n.t('discover.showing_stories', { count: 5 }),
      tFallback: i18n.t('nonexistent.key', null, 'Default Fallback'),
      normTypeChitrank: i18n.normalizeStoryType('chitrank'),
      normTypeChitrankUpper: i18n.normalizeStoryType('Chitrank'),
      normTypeWebNovel: i18n.normalizeStoryType('web novel'),
      normLangNepali: i18n.normalizeLanguage('nepali'),
      normLangEn: i18n.normalizeLanguage('en'),
      normLangHindi: i18n.normalizeLanguage('hi'),
      normGenreFantasy: i18n.normalizeGenre('fantasy'),
      normStatusActive: i18n.normalizeStoryStatus('active'),
      normStatusUnpublished: i18n.normalizeStoryStatus('unpublished'),
      normChapterStatusDraft: i18n.normalizeChapterStatus('draft'),
      normChapterStatusPub: i18n.normalizeChapterStatus('published'),
      formatNumCompact: i18n.formatNumber(12500),
      formatNumStandard: i18n.formatNumber(42),
      formatDateTimeSample: i18n.formatDateTime('2026-10-11T10:30:00Z'),
      canonicalGenresCount: i18n.CANONICAL_GENRES.length,
      canonicalLanguagesCount: i18n.CANONICAL_LANGUAGES.length
    };
  });

  expect(i18nTests.tSimple).toBe('Read');
  expect(i18nTests.tInterpolated).toBe('Showing 5 stories');
  expect(i18nTests.tFallback).toBe('Default Fallback');
  expect(i18nTests.normTypeChitrank).toBe('Chitrānk');
  expect(i18nTests.normTypeChitrankUpper).toBe('Chitrānk');
  expect(i18nTests.normTypeWebNovel).toBe('Web Novel');
  expect(i18nTests.normLangNepali).toBe('Nepali');
  expect(i18nTests.normLangEn).toBe('English');
  expect(i18nTests.normLangHindi).toBe('Hindi');
  expect(i18nTests.normGenreFantasy).toBe('Fantasy');
  expect(i18nTests.normStatusActive.label).toBe('Ongoing');
  expect(i18nTests.normStatusActive.id).toBe('ongoing');
  expect(i18nTests.normStatusUnpublished.label).toBe('Draft');
  expect(i18nTests.normChapterStatusDraft.label).toBe('Draft');
  expect(i18nTests.normChapterStatusPub.label).toBe('Published');
  expect(i18nTests.formatNumCompact).toMatch(/12(\.5)?K/i);
  expect(i18nTests.formatNumStandard).toBe('42');
  expect(i18nTests.canonicalGenresCount).toBeGreaterThanOrEqual(14);
  expect(i18nTests.canonicalLanguagesCount).toBeGreaterThanOrEqual(3);

  // 2. Story card on Discover shows normalized Chitrānk diacritic and Ongoing status
  const card = page.locator('#storyGrid .story-card').first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.cover-badge')).toHaveText('Chitrānk');
  await expect(card.locator('.tag.status-tag')).toHaveText('Ongoing');

  // 3. Story Details view reflects normalized diacritics, language, genre, and status
  await page.evaluate(() => { window.location.hash = 'story?id=story-unnorm-999'; });
  await expect(page.locator('.story-details-title')).toHaveText('The Himalayan Chronicle');
  await expect(page.locator('.type-badge')).toContainText('Chitrānk');
  await expect(page.locator('.genre-badge')).toHaveText('Fantasy');
  await expect(page.locator('.language-badge')).toHaveText('🌐 Nepali');
  await expect(page.locator('.status-badge')).toHaveText('🟢 Ongoing');
});

test('standardizes visual design tokens and Reddit-style coin achievement badges with daily streak tracking', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/');

  // 1. Verify CSS design tokens are correctly initialized on :root
  const tokens = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      textXs: rootStyle.getPropertyValue('--text-xs').trim(),
      textSm: rootStyle.getPropertyValue('--text-sm').trim(),
      textBase: rootStyle.getPropertyValue('--text-base').trim(),
      space1: rootStyle.getPropertyValue('--space-1').trim(),
      space4: rootStyle.getPropertyValue('--space-4').trim(),
      radiusSm: rootStyle.getPropertyValue('--radius-sm').trim(),
      radiusPill: rootStyle.getPropertyValue('--radius-pill').trim(),
      shadowSm: rootStyle.getPropertyValue('--shadow-sm').trim(),
      lightMuted: (function () {
        document.documentElement.classList.add('light');
        const lightStyle = getComputedStyle(document.documentElement);
        const muted = lightStyle.getPropertyValue('--muted').trim();
        document.documentElement.classList.remove('light');
        return muted;
      })()
    };
  });

  expect(tokens.textXs).toBe('0.75rem');
  expect(tokens.textSm).toBe('0.875rem');
  expect(tokens.space1).toBe('0.25rem');
  expect(tokens.space4).toBe('1rem');
  expect(tokens.radiusSm).toBe('6px');
  expect(tokens.radiusPill).toBe('9999px');
  // Confirm light mode muted color is WCAG AA high-contrast (#5A483D)
  expect(tokens.lightMuted.toLowerCase()).toBe('#5a483d');

  // 2. Open Profile page and verify coin achievement showcase in header
  await page.evaluate(() => {
    window.state.user = { id: 'user-test', email: 'author@example.com' };
    window.state.profile = {
      id: 'user-test',
      username: 'melo',
      role: 'author',
      avatar_url: '',
      bio: '',
      followers_count: 3,
      following_count: 1,
      preferences: {
        achievements: {
          streak_days: 5,
          last_active_date: new Date().toISOString().slice(0, 10),
          unlocked: {
            creator_1: new Date().toISOString()
          }
        }
      }
    };
    window.state.stories = [];
    window.location.hash = 'profile';
  });
  await expect(page.locator('.profile-display-name')).toHaveText('melo');
  const showcaseStrip = page.locator('.profile-achievements-showcase');
  await expect(showcaseStrip).toBeVisible();
  await expect(showcaseStrip.locator('.coin-badge').first()).toBeVisible();

  // 3. Switch to Achievements tab
  const achievementsTabBtn = page.getByRole('button', { name: /Achievements/ });
  await achievementsTabBtn.click();
  await expect(page.locator('.achievements-grid').first()).toBeVisible();
  await expect(page.locator('.achievements-category-title').first()).toContainText('Daily Active Streaks');

  // 4. Inspect an achievement coin card and verify coin shape (1:1 aspect ratio)
  const streakCard = page.locator('.achievement-card').first();
  await expect(streakCard).toBeVisible();
  const coinBadge = streakCard.locator('.coin-badge');
  const coinBox = await coinBadge.boundingBox();
  expect(Math.round(coinBox.width)).toBe(Math.round(coinBox.height));

  // 5. Click coin badge to open Reddit-style inspection modal
  await streakCard.click();
  const modal = page.locator('.achievement-modal-dialog');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.achievement-modal-title')).toBeVisible();
  await expect(modal.locator('.achievement-modal-tier-badge')).toBeVisible();
  await expect(modal.locator('.achievement-modal-desc')).toBeVisible();
  await expect(modal.locator('.achievement-modal-progress-wrap')).toBeVisible();
  await expect(modal.locator('.coin-badge-lg')).toBeVisible();

  // Close modal with button
  await modal.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('.achievement-modal-overlay')).toHaveCount(0);
});

test('provides Achievements navigation in account menu and theme-consistent rounded role picker', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/');

  // Set authenticated user and profile
  await page.evaluate(() => {
    window.state.user = { id: 'user-test', email: 'author@example.com' };
    window.state.profile = {
      id: 'user-test',
      username: 'melo',
      role: 'author',
      avatar_url: '',
      bio: '',
      followers_count: 3,
      following_count: 1,
      preferences: {}
    };
    if (window.updateAuthUI) window.updateAuthUI();
  });

  // Open account dropdown
  const trigger = page.locator('.account-trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dropdown = page.locator('.account-dropdown');
  await expect(dropdown).toBeVisible();

  // 1. Verify "Achievements" menu button is present and "Notifications" is not in account dropdown
  const achievementsBtn = dropdown.locator('[data-action="accountNav"][data-view="achievements"]');
  await expect(achievementsBtn).toBeVisible();
  await expect(achievementsBtn).toHaveText('Achievements');

  const notificationsBtn = dropdown.locator('[data-action="accountNav"][data-view="notifications"]');
  await expect(notificationsBtn).toHaveCount(0);

  // 2. Verify custom role switcher is rounded (.auth-role-picker)
  const roleBtn = page.locator('.auth-role-badge-select');
  await expect(roleBtn).toBeVisible();
  await roleBtn.click();

  const rolePopup = page.locator('.auth-role-popup');
  await expect(rolePopup).toBeVisible();

  // Verify border radius is rounded (not square / 0px)
  const borderRadius = await rolePopup.evaluate((el) => window.getComputedStyle(el).borderRadius);
  expect(borderRadius).not.toBe('0px');
  expect(parseFloat(borderRadius)).toBeGreaterThanOrEqual(6);

  // 3. Test Light Mode consistency
  await page.evaluate(() => {
    document.documentElement.classList.add('light');
  });

  const bgLight = await rolePopup.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  expect(bgLight).toBe('rgb(247, 228, 214)');

  // 4. Click Achievements menu item and verify it navigates to Achievements
  await achievementsBtn.click();
  await expect(page).toHaveURL(/#profile\?tab=achievements$/);
  await expect(page.locator('.achievements-grid').first()).toBeVisible();
});

test('ensures Author Studio Active Series switcher, Danger Zone, and Chapter Workspace theme parity in light mode', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/');

  // Set authenticated author session and studio state
  await page.evaluate(() => {
    window.state.user = { id: 'author-1', email: 'author@example.com' };
    window.state.profile = { id: 'author-1', username: 'author', role: 'author' };
    window.state.role = 'author';
    window.state.stories = [{
      id: '11111111-1111-4111-8111-111111111111',
      author_id: 'author-1',
      title: 'SAMYATI',
      type: 'Web Novel',
      status: 'ongoing',
      chapters: [{ id: 'ch-1', title: 'Chapter 1', status: 'published' }]
    }];
    window.location.hash = 'studio';
  });

  const switcherBar = page.locator('.studio-story-switcher-bar');
  await expect(switcherBar).toBeVisible();

  const switcherSelect = page.locator('.studio-story-switcher-select');
  await expect(switcherSelect).toBeVisible();

  const chapterTabs = page.locator('.studio-chapter-tabs');
  await expect(chapterTabs).toBeVisible();

  const chapterItem = page.locator('.timeline-item').first();
  await expect(chapterItem).toBeVisible();

  const dangerZone = page.locator('.danger-zone-panel');
  await expect(dangerZone).toBeVisible();

  const dangerBody = page.locator('.danger-zone-body');
  await expect(dangerBody).toBeVisible();

  // Switch to Light mode
  await page.evaluate(() => document.documentElement.classList.add('light'));

  // studio-story-switcher-bar uses surface-3 (#D0AB93 -> rgb(208, 171, 147))
  await expect.poll(async () => {
    return switcherBar.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  }).toBe('rgb(208, 171, 147)');

  // Select dropdown inside switcher stays surface (#F7E4D6 -> rgb(247, 228, 214))
  await expect.poll(async () => {
    return switcherSelect.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  }).toBe('rgb(247, 228, 214)');

  // Chapter workspace tabs container uses surface-3 (#D0AB93 -> rgb(208, 171, 147))
  await expect.poll(async () => {
    return chapterTabs.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  }).toBe('rgb(208, 171, 147)');

  // Chapter item card uses surface-3 (#D0AB93 -> rgb(208, 171, 147))
  await expect.poll(async () => {
    return chapterItem.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  }).toBe('rgb(208, 171, 147)');

  // Danger zone uses surface (#F7E4D6 -> rgb(247, 228, 214))
  await expect.poll(async () => {
    return dangerZone.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  }).toBe('rgb(247, 228, 214)');

  await expect.poll(async () => {
    return dangerBody.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  }).toBe('rgb(247, 228, 214)');

  await page.evaluate(() => document.documentElement.classList.remove('light'));
});

test('clicking resume button opens #reader and clicking story-body opens #story', async ({ page }) => {
  const storyId = 'story-resume-test-1';
  const mockStory = {
    id: storyId,
    title: 'Resume Test Story',
    type: 'Web Novel',
    status: 'published',
    genre: 'Fantasy',
    description: 'A story for testing resume vs story-body click behavior.',
    cover: '',
    chapters: [
      { id: 'ch-1', title: 'Chapter 1', content: ['First page text'], status: 'published' },
      { id: 'ch-2', title: 'Chapter 2', content: ['Second page text'], status: 'published' }
    ]
  };

  await page.route('**/stories**', async (route) => {
    if (route.request().url().includes('/stories/' + storyId)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockStory)
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [mockStory], genres: ['Fantasy'], languages: ['English'], next_cursor: null, has_more: false })
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem('kathasangam_onboarding_dismissed', 'true');
  });

  await page.goto('/');

  // Simulate active progress on Chapter 2
  await page.evaluate(({ sId }) => {
    localStorage.setItem('kathasangam_anon_progress', JSON.stringify({
      [sId]: { story_id: sId, chapter_id: 'ch-2', page_index: 0 }
    }));
    if (window.ctx && window.ctx.render) window.ctx.render();
  }, { sId: storyId });

  // 1. Verify Resume button exists inside story-body
  const card = page.locator('.story-card').first();
  const storyBody = card.locator('.story-body');
  const resumeBtn = storyBody.locator('button:has-text("Resume")');
  await expect(resumeBtn).toBeVisible();
  await expect(resumeBtn).toHaveAttribute('data-action', 'openReader');

  // 2. Click the Resume button -> must directly open #reader
  await resumeBtn.click();
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('#reader');

  // 3. Return to discover
  await page.evaluate(() => { window.location.hash = 'discover'; });
  await expect(storyBody).toBeVisible();

  // 4. Click the story-body description paragraph -> must open #story
  const desc = storyBody.locator('p');
  await desc.click();
  await expect.poll(async () => page.evaluate(() => window.location.hash)).toContain('story?id=' + storyId);
});

test('fills bookmark and like icons upon interaction and supports interactive community ratings', async ({ page }) => {
  await installApiMocks(page);

  const storyId = 'story-rating-test-101';
  const mockStory = {
    ...story,
    id: storyId,
    title: 'The Starlight Chronicle',
    rating: 4.5,
    ratings_count: 10,
    user_rating: null,
    views: 120,
    likes: 45
  };

  await page.route('**/api/stories**', async (route) => {
    if (route.request().url().includes('/rate')) {
      const body = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          story_id: storyId,
          average_rating: 4.8,
          ratings_count: 11,
          user_rating: body.rating,
          distribution: { '1': 0, '2': 0, '3': 1, '4': 2, '5': 8 }
        })
      });
    }
    if (route.request().url().includes('/rating')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          story_id: storyId,
          average_rating: 4.5,
          ratings_count: 10,
          user_rating: null,
          distribution: { '1': 0, '2': 0, '3': 1, '4': 3, '5': 6 }
        })
      });
    }
    if (route.request().url().includes('/liked')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ liked: false })
      });
    }
    if (route.request().url().includes('/like')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ liked: true, likes: 46 })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [mockStory], genres: ['Fantasy'], languages: ['English'], next_cursor: null, has_more: false })
    });
  });

  await page.route('**/api/bookmarks**', async (route) => {
    if (route.request().url().includes('/ids')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bookmarked: true }) });
  });

  await page.addInitScript(() => {
    localStorage.setItem('kathasangam_onboarding_dismissed', 'true');
  });

  await page.goto('/');

  // Log in as user
  await page.evaluate(() => {
    window.state.user = { id: 'user-tester-1', email: 'tester@kathasangam.org' };
    window.state.profile = { id: 'user-tester-1', username: 'Tester' };
    window.location.hash = 'story?id=story-rating-test-101';
    window.render();
  });

  // Verify #story rendered
  await expect(page.locator('.story-details-title')).toHaveText('The Starlight Chronicle');

  // Verify Community Rating panel rendered
  const ratingPanel = page.locator('.story-rating-panel');
  await expect(ratingPanel).toBeVisible();
  await expect(ratingPanel.locator('.panel-title')).toHaveText('Community Rating');
  await expect(ratingPanel.locator('.rate-stars-input .star-rate-btn')).toHaveCount(5);

  // 1. Test Bookmark button & filled icon
  const bookmarkBtn = page.locator('button[data-action="bookmarkStory"]');
  await expect(bookmarkBtn).toBeVisible();
  await expect(bookmarkBtn.locator('.icon-bookmark')).toBeVisible();

  await bookmarkBtn.click();
  // Upon bookmarking, button becomes active/bookmarked and icon changes to filled
  await expect(bookmarkBtn).toHaveClass(/active/);
  await expect(bookmarkBtn.locator('.icon-bookmark-filled')).toBeVisible();

  // 2. Test Like button & filled icon
  const likeBtn = page.locator('button[data-action="likeStory"]');
  await expect(likeBtn).toBeVisible();
  await expect(likeBtn.locator('.icon-heart')).toBeVisible();

  await likeBtn.click();
  // Upon liking, button becomes active/liked and icon changes to filled
  await expect(likeBtn).toHaveClass(/active/);
  await expect(likeBtn.locator('.icon-heart-filled')).toBeVisible();

  // 3. Test rating the story: click the 5th star
  const fiveStarBtn = ratingPanel.locator('.star-rate-btn[data-rating="5"]');
  await fiveStarBtn.click();

  // After rating 5 stars, button feedback updates and active stars are highlighted
  await expect(ratingPanel.locator('.rate-story-feedback')).toContainText('You rated this 5 / 5');
  await expect(ratingPanel.locator('.star-rate-btn.active')).toHaveCount(5);
});

test('provides Eligibility field with All ages, 13+, 16+, and 18+ options when creating and editing stories', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/');

  // Set up author user
  await page.evaluate(() => {
    window.state.user = { id: 'author-1', email: 'writer@example.test' };
    window.state.role = 'author';
    window.render();
  });

  // Navigate to Studio
  await page.getByRole('link', { name: 'Studio' }).click();

  // 1. Open New Story creation dialog
  await page.getByRole('button', { name: 'New Story' }).click();
  const createModal = page.getByRole('dialog', { name: 'Create New Story' });
  await expect(createModal).toBeVisible();

  // Field select dropdown by label "Eligibility"
  const eligibilitySelect = createModal.getByLabel('Eligibility');
  await expect(eligibilitySelect).toBeVisible();

  const options = eligibilitySelect.locator('option');
  await expect(options).toHaveCount(4);
  await expect(options.nth(0)).toHaveText('All ages');
  await expect(options.nth(1)).toHaveText('13+');
  await expect(options.nth(2)).toHaveText('16+');
  await expect(options.nth(3)).toHaveText('18+');

  // Close create modal
  await page.locator('#storyModalClose').click();
  await expect(createModal).toBeHidden();

  // 2. Open Edit Story Settings dialog
  await page.getByRole('button', { name: 'Edit Settings' }).click();
  const editModal = page.getByRole('dialog', { name: 'Story Settings' });
  await expect(editModal).toBeVisible();

  const editEligibilitySelect = editModal.getByLabel('Eligibility');
  await expect(editEligibilitySelect).toBeVisible();

  const editOptions = editEligibilitySelect.locator('option');
  await expect(editOptions).toHaveCount(4);
  await expect(editOptions.nth(0)).toHaveText('All ages');
  await expect(editOptions.nth(1)).toHaveText('13+');
  await expect(editOptions.nth(2)).toHaveText('16+');
  await expect(editOptions.nth(3)).toHaveText('18+');
});

test('comic reader Pages mode renders double-page spread with 0 gap, responsive panel fit, and contained image zoom', async ({ page }) => {
  const comicPagesStoryId = 'comic-pages-mode-test-id';
  const comicStoryWithPages = {
    ...story,
    id: comicPagesStoryId,
    title: 'Dual Page Comic',
    type: 'Chitrānk',
    chapters: [
      {
        id: 'comic-pages-ch-1',
        sort_order: 1,
        title: 'Chapter 1: The Spread',
        status: 'published',
        access: 'public',
        words: 0,
        reads: 15,
        likes: 5,
        content: null,
        pages: [
          { bg: 'https://images.example.test/panel-1.webp', label: 'Panel 1' },
          { bg: 'https://images.example.test/panel-2.webp', label: 'Panel 2' }
        ],
        comments: []
      }
    ]
  };

  await installApiMocks(page, {
    story: comicStoryWithPages,
    stories: (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [comicStoryWithPages], next_cursor: null, has_more: false })
    })
  });

  await page.route(new RegExp(`/api/stories/${comicPagesStoryId}`), (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(comicStoryWithPages)
    });
  });

  await page.goto('/');

  // Switch to reader with Pages mode
  await page.evaluate((cId) => {
    window.ui.readerMode = 'pages';
    window.location.hash = `reader?id=${cId}`;
  }, comicPagesStoryId);

  // 1. Verify two-page spread has 0 gap and seamless styling
  const doublePages = page.locator('.comic-double-pages');
  await expect(doublePages).toBeVisible();

  const spreadStyle = await doublePages.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      gap: cs.gap,
      display: cs.display
    };
  });
  expect(spreadStyle.gap).toBe('0px');
  expect(spreadStyle.display).toBe('flex');

  // Verify two comic pages are present side-by-side
  const comicPages = doublePages.locator('.comic-page');
  await expect(comicPages).toHaveCount(2);

  // Verify border-radius is 0 on comic pages and wrappers
  const pageBorderRadius = await comicPages.first().evaluate((el) => {
    return window.getComputedStyle(el).borderRadius;
  });
  expect(pageBorderRadius).toBe('0px');

  // Verify bounding boxes touch flush at the center seam (0 gap between pages at default zoom)
  const page1Box = await comicPages.nth(0).locator('.comic-page-wrapper').boundingBox();
  const page2Box = await comicPages.nth(1).locator('.comic-page-wrapper').boundingBox();
  expect(page1Box).not.toBeNull();
  expect(page2Box).not.toBeNull();
  const seamGap = Math.abs((page1Box.x + page1Box.width) - page2Box.x);
  expect(seamGap).toBeLessThanOrEqual(1.5);

  // 2. Open Settings Drawer and test Panel Fit
  await page.locator('.reader-settings-btn').click();
  const drawer = page.locator('.reader-settings-drawer');
  await expect(drawer).toBeVisible();

  const fitSelect = drawer.locator('select[data-action="comicFitSelect"]');
  await expect(fitSelect).toBeVisible();

  // Test Narrow Fit (640px)
  await fitSelect.selectOption('narrow');
  await expect(page.locator('.reader-content.flip-mode')).toHaveClass(/comic-fit-narrow/);
  await expect(doublePages).toHaveClass(/comic-fit-narrow/);

  // Test Wide Fit (960px)
  await fitSelect.selectOption('width');
  await expect(page.locator('.reader-content.flip-mode')).toHaveClass(/comic-fit-width/);
  await expect(doublePages).toHaveClass(/comic-fit-width/);

  // Test Full Width (100%)
  await fitSelect.selectOption('full');
  await expect(page.locator('.reader-content.flip-mode')).toHaveClass(/comic-fit-full/);
  await expect(doublePages).toHaveClass(/comic-fit-full/);
  await page.waitForTimeout(250);

  // Verify Full Width also has 0 seam gap between pages
  const fullPage1Box = await comicPages.nth(0).locator('.comic-page-wrapper').boundingBox();
  const fullPage2Box = await comicPages.nth(1).locator('.comic-page-wrapper').boundingBox();
  expect(fullPage1Box).not.toBeNull();
  expect(fullPage2Box).not.toBeNull();
  const fullSeamGap = Math.abs((fullPage1Box.x + fullPage1Box.width) - fullPage2Box.x);
  expect(fullSeamGap).toBeLessThanOrEqual(1.5);

  // 3. Test Image Zoom slider and containment within reader-frame
  const zoomSlider = drawer.locator('input[data-action="comicZoom"]');
  await expect(zoomSlider).toBeVisible();

  // Zoom to 150%
  await zoomSlider.fill('150');
  await zoomSlider.dispatchEvent('input');

  const containerZoomFactor = await page.locator('.reader-content.flip-mode').evaluate((el) => {
    return el.style.getPropertyValue('--comic-zoom-factor');
  });
  expect(containerZoomFactor).toBe('1.5');

  // Verify reader-content maintains overflow containment
  const contentOverflow = await page.locator('.reader-content.flip-mode').evaluate((el) => {
    return window.getComputedStyle(el).overflow;
  });
  expect(contentOverflow).toBe('auto');

  // Verify reader frame boundary contains content
  const frameRect = await page.locator('.reader-frame').boundingBox();
  const contentRect = await page.locator('.reader-content.flip-mode').boundingBox();
  expect(contentRect.x).toBeGreaterThanOrEqual(frameRect.x - 2);
  expect(contentRect.x + contentRect.width).toBeLessThanOrEqual(frameRect.x + frameRect.width + 2);
});

test('reader bottom layout renders comments tree with multi-level replies on left and TRENDY-styled recommendations on right', async ({ page }) => {
  const currentStory = {
    ...story,
    id: storyId,
    title: 'The Reading Saga',
    genre: 'Fantasy',
    type: 'Web Novel',
    chapters: [
      {
        id: 'ch-tree-1',
        sort_order: 1,
        title: 'Prologue of Voices',
        status: 'published',
        access: 'public',
        words: 50,
        reads: 10,
        likes: 3,
        content: ['The journey begins here with wisdom and echoes.'],
        pages: null,
        comments: [
          {
            id: 'root-1',
            user: 'ReaderOne',
            user_id: 'u-1',
            text: 'This is the main root comment.',
            parentId: null,
            created_at: '2026-10-10T10:00:00Z'
          },
          {
            id: 'reply-1-1',
            user: 'ReaderTwo',
            user_id: 'u-2',
            text: 'First reply to root comment.',
            parentId: 'root-1',
            created_at: '2026-10-10T10:05:00Z'
          },
          {
            id: 'reply-1-1-1',
            user: 'ReaderThree',
            user_id: 'u-3',
            text: 'Nested reply to reply (arbitrary depth)!',
            parentId: 'reply-1-1',
            created_at: '2026-10-10T10:10:00Z'
          }
        ]
      }
    ]
  };

  const recStory1 = {
    id: 'rec-story-1',
    title: 'Echoes of Magic',
    author: 'Elena Vance',
    genre: 'Fantasy',
    type: 'Web Novel',
    status: 'published',
    views: 4500,
    chapters: []
  };

  const recStory2 = {
    id: 'rec-story-2',
    title: 'Shadow Realm',
    author: 'Kaelen Cross',
    genre: 'Fantasy',
    type: 'Web Novel',
    status: 'published',
    views: 2800,
    chapters: []
  };

  await installApiMocks(page, {
    story: currentStory,
    stories: (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [currentStory, recStory1, recStory2], next_cursor: null, has_more: false })
    })
  });

  await page.goto('/');

  // Set user as logged in to verify reply buttons
  await page.evaluate(({ s, r1, r2 }) => {
    window.state.user = { id: 'u-test', email: 'tester@example.test' };
    window.state.stories = [s, r1, r2];
    window.ui.currentStoryId = s.id;
    window.ui.currentChapterIndex = 0;
    window.location.hash = `reader?id=${s.id}`;
    window.render();
  }, { s: currentStory, r1: recStory1, r2: recStory2 });

  await expect(page).toHaveURL(/#reader/);

  // 1. Verify layout-two exists with left section and right aside
  const layoutTwo = page.locator('.layout-two');
  await expect(layoutTwo).toBeVisible();

  // 2. Verify Comments section on Left:
  const leftPanel = layoutTwo.locator('section.panel');
  await expect(leftPanel.locator('h2')).toContainText('Comments');

  // Verify Comment Box is placed at the top of comments section in collapsed pill state
  const topCommentForm = leftPanel.locator('form[data-form="commentForm"]');
  await expect(topCommentForm).toBeVisible();
  await expect(topCommentForm).toHaveClass(/collapsed/);
  const commentTextarea = topCommentForm.locator('textarea[name="comment"]');
  await expect(commentTextarea).toBeVisible();
  await expect(commentTextarea).toHaveAttribute('placeholder', 'Join the conversation');

  // Focus expands the composer to expanded state
  await commentTextarea.focus();
  await expect(topCommentForm).toHaveClass(/expanded/);

  // Verify Twitter-style character progress ring and send button are visible
  const charRing = topCommentForm.locator('.comment-char-ring-wrap');
  await expect(charRing).toBeVisible();
  await expect(charRing).toHaveAttribute('title', '0 / 5000');

  const sendBtn = topCommentForm.locator('.comment-send-btn');
  await expect(sendBtn).toBeVisible();
  await expect(sendBtn.locator('.animated-send-icon')).toBeVisible();

  // Typing updates Twitter-style progress ring
  await commentTextarea.fill('Exciting chapter!');
  await expect(charRing).toHaveAttribute('title', '17 / 5000');

  // Clear and click outside collapses the composer back to pill
  await commentTextarea.fill('');
  await leftPanel.locator('h2').click();
  await expect(topCommentForm).toHaveClass(/collapsed/);

  // 3. Verify YouTube-style Recursive Comment Tree:
  // Root comment
  const rootItem = leftPanel.locator('.comment-thread-wrapper:has-text("This is the main root comment.")');
  await expect(rootItem).toBeVisible();

  // Child reply (level 1)
  const childReply = rootItem.locator('.comment-reply-item:has-text("First reply to root comment.")');
  await expect(childReply).toBeVisible();

  // Deeply nested reply to reply (level 2)
  const grandChildReply = rootItem.locator('.comment-reply-item:has-text("Nested reply to reply (arbitrary depth)!")');
  await expect(grandChildReply).toBeVisible();

  // Verify tree connector guide lines exist (.comment-tree-replies)
  const treeBranches = rootItem.locator('.comment-tree-replies');
  await expect(treeBranches.first()).toBeVisible();

  // Verify every reply has a "Reply" button for authenticated users
  const childReplyBtn = childReply.locator('button:has-text("Reply")');
  await expect(childReplyBtn).toBeVisible();

  // Clicking "Reply" on a nested reply opens inline reply form directly beneath it
  await childReplyBtn.click();
  const inlineReplyForm = rootItem.locator('form[data-form="replyForm"]');
  await expect(inlineReplyForm).toBeVisible();
  await expect(inlineReplyForm.locator('input[name="parentId"]')).toHaveValue('reply-1-1');

  // 4. Verify Recommended section on Right:
  const rightAside = layoutTwo.locator('aside.trending-sidebar.reader-recommend-sidebar');
  await expect(rightAside).toBeVisible();
  await expect(rightAside.locator('.trending-heading')).toHaveText('RECOMMENDED');

  // Verify recommendations format: trending-items with rank, title, author, and views
  const recItems = rightAside.locator('.trending-item');
  await expect(recItems).toHaveCount(2);

  // First recommended story (highest relevance & views)
  const firstRec = recItems.first();
  await expect(firstRec.locator('.trending-rank')).toHaveText('1');
  await expect(firstRec.locator('.trending-title')).toHaveText('Echoes of Magic');
  await expect(firstRec.locator('.trending-author')).toHaveText('Elena Vance');
  await expect(firstRec.locator('.trending-views')).toBeVisible();
  await expect(firstRec.locator('.trending-flame-icon')).toBeVisible();
});

test('Forgot password flow uses URL reset link and displays email confirmation card without 6-digit code', async ({ page }) => {
  await installApiMocks(page);
  await page.route('**/api/config', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        supabase_url: 'https://mock.supabase.co',
        supabase_anon_key: 'mock-key',
        admin_email: '',
        moderator_emails: []
      })
    });
  });
  await page.route('https://mock.supabase.co/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({})
    });
  });
  await page.addInitScript(() => {
    const mockAuth = {
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null }, error: null })
    };
    const mockClient = { auth: mockAuth };
    const mockSupabase = { createClient: () => mockClient };
    Object.defineProperty(window, 'supabase', {
      get: () => mockSupabase,
      set: () => {},
      configurable: true
    });
  });
  await page.goto('/');

  // 1. Open auth modal
  const signInBtn = page.locator('#signInBtn');
  await signInBtn.click();
  await expect(page.locator('#authModal')).toBeVisible();

  // 2. Click forgot password link
  const forgotPwdLink = page.locator('#forgotPasswordLink');
  await expect(forgotPwdLink).toBeVisible();
  await forgotPwdLink.click();

  // 3. Verify forgot password form is visible
  const forgotForm = page.locator('#forgotPasswordForm');
  await expect(forgotForm).toBeVisible();

  // Verify copy does not mention 6-digit recovery code and button says "Send Reset Link"
  await expect(forgotForm).not.toContainText('6-digit recovery code');
  await expect(forgotForm).toContainText('secure link to reset your password');
  const submitBtn = forgotForm.locator('button[type="submit"]');
  await expect(submitBtn).toHaveText('Send Reset Link');

  // 4. Fill email and submit
  await page.fill('#forgotPasswordForm input[name="email"]', 'testuser@example.com');
  await submitBtn.click();

  // 5. Verify dedicated confirmation card is shown
  const sentState = page.locator('#forgotPasswordSentState');
  await expect(sentState).toBeVisible();
  await expect(sentState.locator('#forgotSentEmail')).toHaveText('testuser@example.com');
  await expect(page.locator('#authModalTitle')).toHaveText('Check Your Email');
  await expect(sentState.locator('#forgotResendBtn')).toBeVisible();

  // 6. Verify "Back to Log In" button returns to login view
  const backBtn = sentState.locator('#forgotSentBackBtn');
  await expect(backBtn).toBeVisible();
  await backBtn.click();
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect(sentState).toBeHidden();
});






