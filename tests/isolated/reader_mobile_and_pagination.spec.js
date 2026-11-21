import { test, expect } from '@playwright/test';

test.describe('Mobile Reader Navigation & Balanced Page Pagination', () => {
  const storyId = '77777777-7777-4777-8777-777777777777';
  const mockStory = {
    id: storyId,
    author_id: 'author-test-1',
    title: 'The Silent Grove',
    author: 'Anya Sharma',
    type: 'Web Novel',
    genre: 'Fantasy, Adventure',
    language: 'English',
    license: 'All Rights Reserved',
    status: 'published',
    tags: ['fantasy', 'adventure'],
    description: 'An adventurous journey through misty forests.',
    cover: 'https://images.example.test/grove.jpg',
    followers: 45,
    views: 1200,
    likes: 32,
    earnings: 0,
    progress: 0,
    created_at: '2026-10-01T00:00:00Z',
    chapters: [
      {
        id: 'ch-1',
        sort_order: 0,
        title: 'Chapter 1: The Departure',
        status: 'published',
        access: 'free',
        createdAt: '2026-10-01T00:00:00Z',
        words: 450,
        reads: 320,
        likes: 18,
        content: [
          'The morning mist settled quietly across the wide mountain valley as the iron bell sounded its first call of dawn. She stepped through the high gates, clutching her leather bag tightly, fully knowing there was no turning back from this path. The forest trail before her was lined with pine needles damp from overnight rain.',
          '"Who goes there?" called a sharp voice from the shadows near the ancient oak tree.',
          '"A traveler seeking passage," she replied quietly, her hand hovering near the hilt hidden under her traveling cloak.',
          '"No one passes without paying the silver toll to the warden of the grove." The sentry stepped into the thin morning sunlight.',
          'She took a slow breath and weighed her options carefully. Turning back meant returning to the desolate ruins of her former village, where nothing but cold ash and bitter memories remained. Going forward meant risking whatever perils the whispering woods had in store for unsuspecting wanderers. She reached into her pocket, found two silver coins, and extended her palm without a word of complaint.',
          'The sentry inspected the coins with a cautious glance, nodded curtly, and stepped aside into the dense brush. She continued along the winding trail as the rising sun slowly warmed the cold mountain air.'
        ],
        pages: null,
        comments: []
      }
    ],
    collaborators: []
  };

  test.beforeEach(async ({ page }) => {
    await page.route('https://images.example.test/**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#333"/></svg>'
      });
    });

    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/config') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ supabase_url: '', supabase_anon_key: '', admin_email: '', moderator_emails: [] })
        });
      }
      if (url.pathname === '/api/stories') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [mockStory], next_cursor: null, has_more: false })
        });
      }
      if (url.pathname === `/api/stories/${storyId}`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockStory)
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
  });

  test('Mobile layout: reader-side-nav prev and next buttons are visible, touch-styled, and functional in Pages mode', async ({ page }) => {
    // 1. Mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    // 2. Open story and reader in Pages mode
    await page.evaluate(({ sId, story }) => {
      window.state.stories = [story];
      window.ui.currentStoryId = sId;
      window.ui.currentChapterIndex = 0;
      window.ui.readerMode = 'pages';
      window.ui.currentTextPageIndex = 0;
      window.location.hash = 'reader?id=' + sId;
      window.render();
    }, { sId: storyId, story: mockStory });

    await expect(page).toHaveURL(/#reader/);

    // 3. Verify reader-side-nav prev and next are visible on mobile screen
    const prevBtn = page.locator('.reader-side-nav.prev');
    const nextBtn = page.locator('.reader-side-nav.next');

    await expect(prevBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();

    // Verify touch-friendly dimensions on mobile
    const prevBox = await prevBtn.boundingBox();
    expect(prevBox).toBeTruthy();
    expect(prevBox.width).toBeGreaterThanOrEqual(35);
    expect(prevBox.height).toBeGreaterThanOrEqual(50);

    const nextBox = await nextBtn.boundingBox();
    expect(nextBox).toBeTruthy();
    expect(nextBox.width).toBeGreaterThanOrEqual(35);
    expect(nextBox.height).toBeGreaterThanOrEqual(50);

    // 4. On page 1: prev button is disabled, next button is enabled
    await expect(prevBtn).toBeDisabled();
    await expect(nextBtn).toBeEnabled();

    // 5. Verify reader-content horizontal padding provides safe clearance from side buttons
    const readerContent = page.locator('.reader-frame.mode-pages .reader-content');
    const contentStyles = await readerContent.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        paddingLeft: parseFloat(cs.paddingLeft),
        paddingRight: parseFloat(cs.paddingRight)
      };
    });
    expect(contentStyles.paddingLeft).toBeGreaterThanOrEqual(40);
    expect(contentStyles.paddingRight).toBeGreaterThanOrEqual(40);

    // 6. Click next button -> advances page
    await nextBtn.click();

    // Now on page 2: prev button must be enabled
    await expect(prevBtn).toBeEnabled();
    const pageIdx = await page.evaluate(() => window.ui.currentTextPageIndex);
    expect(pageIdx).toBe(1);

    // Click prev button -> returns to page 1
    await prevBtn.click();
    await expect(prevBtn).toBeDisabled();
    const backIdx = await page.evaluate(() => window.ui.currentTextPageIndex);
    expect(backIdx).toBe(0);
  });

  test('Balanced line and word pagination: pages maintain consistent lines and display word count in indicator', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(({ sId, story }) => {
      window.state.stories = [story];
      window.ui.currentStoryId = sId;
      window.ui.currentChapterIndex = 0;
      window.ui.readerMode = 'pages';
      window.ui.currentTextPageIndex = 0;
      window.location.hash = 'reader?id=' + sId;
      window.render();
    }, { sId: storyId, story: mockStory });

    await expect(page).toHaveURL(/#reader/);

    // Check bottom-page-indicator: contains chapter and transparent words per page info
    const indicator = page.locator('.bottom-page-indicator');
    await expect(indicator).toBeVisible();
    await expect(indicator).toContainText('Chapter 1 of 1');
    await expect(indicator).toContainText('words');

    // Verify pagination segments on page 1: holds balanced lines, not a lonely 1-line fragment
    const paragraphs = page.locator('.reader-content .paragraph-wrapper');
    const pCount = await paragraphs.count();
    expect(pCount).toBeGreaterThanOrEqual(2);

    // Open Reader Settings drawer -> check Page Density caption
    await page.locator('.reader-settings-btn').click();
    const drawer = page.locator('.reader-settings-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Page Density');
    await expect(drawer).toContainText('Balanced ~15 lines (150 words) per page');
  });

  test('Touch swipe navigation: swiping left advances page, swiping right goes back', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.evaluate(({ sId, story }) => {
      window.state.stories = [story];
      window.ui.currentStoryId = sId;
      window.ui.currentChapterIndex = 0;
      window.ui.readerMode = 'pages';
      window.ui.currentTextPageIndex = 0;
      window.location.hash = 'reader?id=' + sId;
      window.render();
    }, { sId: storyId, story: mockStory });

    await expect(page).toHaveURL(/#reader/);

    // Simulate swipe left (touch move from x=300 to x=100)
    await page.evaluate(() => {
      const frame = document.querySelector('.reader-frame');
      const startEvt = new CustomEvent('touchstart', { bubbles: true });
      startEvt.touches = [{ clientX: 300, clientY: 400 }];
      frame.dispatchEvent(startEvt);

      const endEvt = new CustomEvent('touchend', { bubbles: true });
      endEvt.changedTouches = [{ clientX: 100, clientY: 400 }];
      frame.dispatchEvent(endEvt);
    });

    // Page should have advanced to 1
    await expect(page.locator('.reader-side-nav.prev')).toBeEnabled();
    const currentIdx = await page.evaluate(() => window.ui.currentTextPageIndex);
    expect(currentIdx).toBe(1);

    // Simulate swipe right (touch move from x=100 to x=300)
    await page.evaluate(() => {
      const frame = document.querySelector('.reader-frame');
      const startEvt = new CustomEvent('touchstart', { bubbles: true });
      startEvt.touches = [{ clientX: 100, clientY: 400 }];
      frame.dispatchEvent(startEvt);

      const endEvt = new CustomEvent('touchend', { bubbles: true });
      endEvt.changedTouches = [{ clientX: 300, clientY: 400 }];
      frame.dispatchEvent(endEvt);
    });

    // Page should have returned to 0
    await expect(page.locator('.reader-side-nav.prev')).toBeDisabled();
    const backIdx = await page.evaluate(() => window.ui.currentTextPageIndex);
    expect(backIdx).toBe(0);
  });
});
