import { test, expect } from '@playwright/test';

test('Discovery MangaPlus cards: DD.MM release date, latest chapter number, click cover to #story, click title to latest chapter on #reader', async ({ page }) => {
  const storyId = '55555555-5555-4555-8555-555555555555';
  const mockStory = {
    id: storyId,
    author_id: 'author-test-1',
    title: 'নৌকাডুবি',
    author: 'Rabindranath Tagore',
    type: 'Web Novel',
    genre: 'Classic, Romance',
    language: 'Bengali',
    license: 'Public Domain',
    status: 'published',
    tags: ['classic', 'drama'],
    description: 'A classic Bengali masterpiece.',
    cover: 'https://images.example.test/noukadubi.jpg',
    followers: 120,
    views: 4500,
    likes: 80,
    earnings: 0,
    progress: 0,
    created_at: '2026-07-12T00:00:00', // First creation date: July 12
    chapters: [
      { id: 'ch-1', sort_order: 0, title: 'Chapter 1: The Storm', status: 'published', access: 'free', createdAt: '2026-07-12T00:00:00Z', words: 120, reads: 400, likes: 20, content: ['First chapter paragraph.'], pages: null, comments: [] },
      { id: 'ch-2', sort_order: 1, title: 'Chapter 2: The Shore', status: 'published', access: 'free', createdAt: '2026-08-15T00:00:00Z', words: 140, reads: 350, likes: 15, content: ['Second chapter paragraph.'], pages: null, comments: [] },
      { id: 'ch-3', sort_order: 2, title: 'Chapter 3: The Reunion', status: 'published', access: 'free', createdAt: '2026-11-08T10:00:00Z', words: 180, reads: 280, likes: 30, content: ['Third chapter paragraph.'], pages: null, comments: [] }
    ],
    collaborators: []
  };

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/config') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ supabase_url: '', supabase_anon_key: '', admin_email: '', moderator_emails: [] }) });
    }
    if (url.pathname === '/api/stories') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [mockStory], next_cursor: null, has_more: false }) });
    }
    if (url.pathname === `/api/stories/${storyId}`) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockStory) });
    }
    if (url.pathname === `/api/stories/${storyId}/view`) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ viewed: true, views: 4501 }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  await page.addInitScript(() => {
    localStorage.setItem('kathasangam_onboarding_dismissed', 'true');
  });

  await page.goto('/');

  const card = page.locator('#storyGrid .story-card').first();
  await expect(card).toBeVisible();

  // 1. Verify Date badge: DD.MM format showing latest chapter's date (Nov 8 = 8.11 SUN) NOT first chapter (7.12)
  const dateBadge = card.locator('.cover-date-badge');
  await expect(dateBadge).toBeVisible();
  const dateText = await dateBadge.textContent();
  expect(dateText).toMatch(/^8\.11\s+[A-Z]{3}$/); // 8.11 SUN in DD.MM format

  // 2. Verify Latest chapter count: #3 (1-based from sort_order 2)
  const chSub = card.locator('.story-sub-chapter');
  await expect(chSub).toHaveText('#3');

  // 3. Verify story actions exist and have accessible touch height >= 44px
  const readBtn = card.locator('.story-actions button').first();
  await expect(readBtn).toBeVisible();
  const readHeight = await readBtn.evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.round(readHeight)).toBeGreaterThanOrEqual(44);

  // 4. Clicking the Cover goes to #story details
  const coverBtn = card.locator('.cover-button');
  await coverBtn.click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(`#story?id=${storyId}`);

  // 5. Return to discover and click the Story Title -> must navigate to #reader with the latest chapter (Chapter 3, index 2)
  await page.evaluate(() => { window.location.hash = 'discover'; });
  await expect(card).toBeVisible();

  const titleEl = card.locator('.story-card-title');
  await expect(titleEl).toBeVisible();
  await titleEl.click();

  // Verify reader opened
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#reader');

  // Verify window.ui.currentChapterIndex is 2 (Chapter 3)
  const currentChapterIdx = await page.evaluate(() => window.ui ? window.ui.currentChapterIndex : null);
  expect(currentChapterIdx).toBe(2);

  // Verify reader is showing Chapter 3
  await expect(page.locator('.bottom-page-indicator')).toContainText('Chapter 3 of 3');
});
