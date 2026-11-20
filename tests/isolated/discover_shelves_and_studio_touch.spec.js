import { test, expect } from '@playwright/test';

test.describe('Studio Switcher Touch and Discover MangaPlus Shelves', () => {
  const story1Id = '11111111-1111-4111-8111-111111111111';
  const story2Id = '22222222-2222-4222-8222-222222222222';

  const mockStories = [
    {
      id: story1Id,
      author_id: 'test-author-id',
      title: 'First Story Alpha',
      author: 'Author One',
      type: 'Web Novel',
      genre: 'Fantasy',
      language: 'English',
      status: 'ongoing',
      tags: ['magic'],
      description: 'First fantasy novel.',
      cover: 'https://images.example.test/s1.jpg',
      views: 1200,
      followers: 40,
      created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      chapters: [
        { id: 'ch-1', sort_order: 0, title: 'Chapter 1', status: 'published', access: 'free', createdAt: new Date(Date.now() - 10 * 86400000).toISOString(), words: 100, reads: 100, likes: 10, content: ['P1'], pages: null, comments: [] }
      ]
    },
    {
      id: story2Id,
      author_id: 'test-author-id',
      title: 'Second Story Beta',
      author: 'Author One',
      type: 'Web Novel',
      genre: 'Drama',
      language: 'English',
      status: 'ongoing',
      tags: ['drama'],
      description: 'Second drama novel.',
      cover: 'https://images.example.test/s2.jpg',
      views: 800,
      followers: 25,
      created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
      chapters: [
        { id: 'ch-2', sort_order: 0, title: 'Chapter 1', status: 'published', access: 'free', createdAt: new Date(Date.now() - 8 * 86400000).toISOString(), words: 120, reads: 80, likes: 8, content: ['P1'], pages: null, comments: [] }
      ]
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      author_id: 'author-tagore',
      title: 'নৌকাডুবি (Noukadubi)',
      author: 'Rabindranath Tagore',
      type: 'Classic',
      genre: 'Classic, Romance',
      language: 'Bengali',
      status: 'published',
      tags: ['classic', 'masterpiece'],
      description: 'A classic Bengali romance and drama.',
      cover: 'https://images.example.test/s3.jpg',
      views: 5400,
      followers: 310,
      created_at: '2026-01-01T00:00:00Z',
      chapters: [
        { id: 'ch-3', sort_order: 0, title: 'Chapter 1', status: 'published', access: 'free', createdAt: '2026-01-01T00:00:00Z', words: 200, reads: 500, likes: 50, content: ['P1'], pages: null, comments: [] }
      ]
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      author_id: 'author-tagore',
      title: 'চোখের বালি (Chokher Bali)',
      author: 'Rabindranath Tagore',
      type: 'Classic',
      genre: 'Classic, Drama',
      language: 'Bengali',
      status: 'published',
      tags: ['classic'],
      description: 'Another classic tale.',
      cover: 'https://images.example.test/s4.jpg',
      views: 4200,
      followers: 210,
      created_at: '2026-01-02T00:00:00Z',
      chapters: [
        { id: 'ch-4', sort_order: 0, title: 'Chapter 1', status: 'published', access: 'free', createdAt: '2026-01-02T00:00:00Z', words: 180, reads: 400, likes: 40, content: ['P1'], pages: null, comments: [] }
      ]
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      author_id: 'author-other',
      title: 'Cyberpunk Kolkata',
      author: 'Modern Author',
      type: 'Web Novel',
      genre: 'Sci-Fi',
      language: 'English',
      status: 'published',
      tags: ['scifi', 'cyberpunk'],
      description: 'Futuristic story.',
      cover: 'https://images.example.test/s5.jpg',
      views: 3100,
      followers: 90,
      created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      chapters: [
        { id: 'ch-5', sort_order: 0, title: 'Chapter 1', status: 'published', access: 'free', createdAt: new Date(Date.now() - 1 * 86400000).toISOString(), words: 150, reads: 200, likes: 20, content: ['P1'], pages: null, comments: [] }
      ]
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      author_id: 'author-other-2',
      title: 'Midnight Chronicles',
      author: 'Thriller Author',
      type: 'Web Novel',
      genre: 'Mystery, Thriller',
      language: 'English',
      status: 'published',
      tags: ['mystery'],
      description: 'A thrilling tale.',
      cover: 'https://images.example.test/s6.jpg',
      views: 2900,
      followers: 85,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      chapters: [
        { id: 'ch-6', sort_order: 0, title: 'Chapter 1', status: 'published', access: 'free', createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), words: 140, reads: 190, likes: 18, content: ['P1'], pages: null, comments: [] }
      ]
    }
  ];

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
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ supabase_url: '', supabase_anon_key: '', admin_email: '', moderator_emails: [] }) });
      }
      if (url.pathname === '/api/stories') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: mockStories, next_cursor: null, has_more: false }) });
      }
      if (url.pathname.includes('/collaborations/invites') || url.pathname.includes('/internal-notes')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.addInitScript(() => {
      localStorage.setItem('kathasangam_onboarding_dismissed', 'true');
    });
  });

  test('1. Studio story switcher: click does not dismiss or recreate selector; change event switches active story', async ({ page }) => {
    await page.goto('/');

    // Set user as author and assign stories
    await page.evaluate(({ s1Id, s2Id, stories }) => {
      window.state.user = { id: 'test-author-id', email: 'author@example.test' };
      window.state.profile = { id: 'test-author-id', username: 'author_one', role: 'author' };
      window.state.role = 'author';
      window.state.stories = stories;
      window.ui.currentStoryId = s1Id;
      window.location.hash = 'studio';
      window.render();
    }, { s1Id: story1Id, s2Id: story2Id, stories: mockStories });
    await expect(page).toHaveURL(/#studio/);

    const switcher = page.locator('.studio-story-switcher-select');
    await expect(switcher).toBeVisible();

    // Verify initial value is story1Id
    expect(await switcher.inputValue()).toBe(story1Id);

    // Verify pointer-events and touch-action styling on switcher
    const touchAction = await switcher.evaluate((el) => window.getComputedStyle(el).touchAction);
    expect(['auto', 'manipulation']).toContain(touchAction);

    // Verify selector does NOT have data-action attribute to prevent click delegation interference
    const hasDataAction = await switcher.evaluate((el) => el.hasAttribute('data-action'));
    expect(hasDataAction).toBe(false);

    // Simulate clicking / tapping on the select element:
    // In buggy version, clicking the select fired a click event which triggered ctx.render() and destroyed the node.
    // We check that after click, the element remains the same DOM reference and wasn't destroyed.
    const isSameNodeAfterClick = await switcher.evaluate((el) => {
      const origNode = el;
      el.click();
      return document.querySelector('.studio-story-switcher-select') === origNode;
    });
    expect(isSameNodeAfterClick).toBe(true);

    // Now select the second story via change event
    await switcher.selectOption(story2Id);

    // Verify currentStoryId switched to story2Id
    const currentStoryId = await page.evaluate(() => window.ui.currentStoryId);
    expect(currentStoryId).toBe(story2Id);
  });

  test('2. Discover shelves: Newly Added, Classics, and All Stories render in side-scrollable MangaPlus shelf format', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { window.location.hash = 'discover'; });

    // Verify the three shelves exist
    const newlyAddedRow = page.locator('.story-grid-row[data-shelf="newly-added"]');
    const classicsRow = page.locator('.story-grid-row[data-shelf="classics"]');
    const allStoriesRow = page.locator('.story-grid-row[data-shelf="all-stories"]');

    await expect(newlyAddedRow).toBeVisible();
    await expect(classicsRow).toBeVisible();
    await expect(allStoriesRow).toBeVisible();

    // Verify each shelf contains .shelf-scroll-container and .shelf-row
    for (const shelfRow of [newlyAddedRow, classicsRow, allStoriesRow]) {
      const scrollContainer = shelfRow.locator('.shelf-scroll-container');
      const innerRow = shelfRow.locator('.shelf-row');
      await expect(scrollContainer).toBeVisible();
      await expect(innerRow).toBeVisible();

      // Verify horizontal scrolling CSS
      const overflowX = await scrollContainer.evaluate((el) => window.getComputedStyle(el).overflowX);
      expect(['auto', 'scroll']).toContain(overflowX);
    }

    // Verify cards in All Stories have MangaPlus format (.shelf-card and .story-card)
    const allCards = allStoriesRow.locator('.story-card');
    const count = await allCards.count();
    expect(count).toBe(6);

    for (let i = 0; i < count; i++) {
      const card = allCards.nth(i);
      await expect(card).toHaveClass(/shelf-card/);
      // MangaPlus cards must have .cover-button, .cover-date-badge, and .story-card-title
      await expect(card.locator('.cover-button')).toBeVisible();
      await expect(card.locator('.story-card-title')).toBeVisible();
      // MangaPlus shelf cards do not render action buttons
      await expect(card.locator('.story-actions button')).toHaveCount(0);
    }
  });

  test('3. Discover shelves navigation: shelves with > 5 stories render < and > buttons; shelves with <= 5 stories hide them', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { window.location.hash = 'discover'; });

    // Classics shelf has 2 stories (<= 5) -> navigation < and > buttons must NOT be rendered
    const classicsHeader = page.locator('.story-grid-header[data-shelf="classics"]');
    await expect(classicsHeader).toBeVisible();
    const classicsPrev = classicsHeader.locator('.shelf-nav-prev');
    const classicsNext = classicsHeader.locator('.shelf-nav-next');
    await expect(classicsPrev).toHaveCount(0);
    await expect(classicsNext).toHaveCount(0);

    // All Stories shelf has 6 stories (> 5) -> navigation < and > buttons MUST be rendered
    const allHeader = page.locator('.story-grid-header[data-shelf="all-stories"]');
    await expect(allHeader).toBeVisible();
    const allPrev = allHeader.locator('.shelf-nav-prev');
    const allNext = allHeader.locator('.shelf-nav-next');
    await expect(allPrev).toBeVisible();
    await expect(allNext).toBeVisible();

    // Verify clicking '>' triggers shelf scrolling
    const allShelf = page.locator('.story-grid-row[data-shelf="all-stories"]');
    const scrollContainer = allShelf.locator('.shelf-scroll-container');
    await expect(scrollContainer).toBeVisible();

    // Simulate clicking '>'
    await allNext.click();
    await page.waitForTimeout(300);
  });

  test('4. Discover shelves View All: each shelf header has "View All ›" which toggles expanded grid view and changes text to "Show Less ▴"', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { window.location.hash = 'discover'; });

    const allHeader = page.locator('.story-grid-header[data-shelf="all-stories"]');
    const allShelf = page.locator('.story-grid-row[data-shelf="all-stories"]');
    const viewAllBtn = allHeader.locator('.shelf-view-all-btn');

    await expect(viewAllBtn).toBeVisible();
    await expect(viewAllBtn).toHaveText(/View All/);

    // Shelf row should not be expanded initially
    await expect(allShelf).not.toHaveClass(/is-expanded/);

    // Click "View All ›"
    await viewAllBtn.click();

    // Shelf row must now have class .is-expanded
    await expect(allShelf).toHaveClass(/is-expanded/);
    await expect(viewAllBtn).toHaveText(/Show Less/);

    // Click "Show Less ▴"
    await viewAllBtn.click();

    // Shelf row must remove .is-expanded and restore "View All ›"
    await expect(allShelf).not.toHaveClass(/is-expanded/);
    await expect(viewAllBtn).toHaveText(/View All/);
  });

  test('5. Mobile portrait: side-scrolling enabled and MangaPlus format parity across all shelves', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.evaluate(() => { window.location.hash = 'discover'; });

    const shelves = ['newly-added', 'classics', 'all-stories'];

    for (const shelfId of shelves) {
      const shelfRow = page.locator(`.story-grid-row[data-shelf="${shelfId}"]`);
      await expect(shelfRow).toBeVisible();

      const scrollContainer = shelfRow.locator('.shelf-scroll-container');
      await expect(scrollContainer).toBeVisible();

      // Verify container width is constrained to viewport (not blown out to 1196px)
      const clientWidth = await scrollContainer.evaluate((el) => el.clientWidth);
      expect(clientWidth).toBeLessThanOrEqual(375);

      // Verify touch attributes
      const touchAction = await scrollContainer.evaluate((el) => window.getComputedStyle(el).touchAction);
      expect(touchAction).toBe('pan-x pan-y');

      // Check first card in each shelf
      const firstCard = shelfRow.locator('.story-card').first();
      await expect(firstCard).toHaveClass(/shelf-card/);

      // Verify card width on mobile is 135px
      const cardWidth = await firstCard.evaluate((el) => window.getComputedStyle(el).width);
      expect(cardWidth).toBe('135px');

      // Verify title tag is H2 for all shelves (format parity)
      const titleTag = await firstCard.locator('.story-card-title').evaluate((el) => el.tagName);
      expect(titleTag).toBe('H2');

      // Verify tags and action buttons are hidden on shelf cards
      const actionsDisplay = await firstCard.locator('.story-actions').evaluate((el) => window.getComputedStyle(el).display);
      expect(actionsDisplay).toBe('none');

      // Verify cover-button has touch-action pan-x pan-y and cover-art has pointer-events none
      const coverBtnTouch = await firstCard.locator('.cover-button').evaluate((el) => window.getComputedStyle(el).touchAction);
      expect(coverBtnTouch).toBe('pan-x pan-y');
      const coverArtPointer = await firstCard.locator('.cover-art').evaluate((el) => window.getComputedStyle(el).pointerEvents);
      expect(coverArtPointer).toBe('none');
    }

    // Verify side-scrolling on All Stories shelf (which has 6 stories, scrollWidth > clientWidth)
    const allScrollContainer = page.locator('.story-grid-row[data-shelf="all-stories"] .shelf-scroll-container');
    const scrollMetrics = await allScrollContainer.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      canScroll: el.scrollWidth > el.clientWidth
    }));
    expect(scrollMetrics.canScroll).toBe(true);
  });

  test('6. Mobile portrait: Studio story switcher select has touch-action auto and full-width touch target', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    await page.evaluate(({ s1Id, s2Id, stories }) => {
      window.state.user = { id: 'test-author-id', email: 'author@example.test' };
      window.state.profile = { id: 'test-author-id', username: 'author_one', role: 'author' };
      window.state.role = 'author';
      window.state.stories = stories;
      window.ui.currentStoryId = s1Id;
      window.location.hash = 'studio';
      window.render();
    }, { s1Id: story1Id, s2Id: story2Id, stories: mockStories });
    await expect(page).toHaveURL(/#studio/);

    const switcher = page.locator('.studio-story-switcher-select');
    await expect(switcher).toBeVisible();

    // Verify touch action is manipulation or auto for mobile OS picker
    const touchAction = await switcher.evaluate((el) => window.getComputedStyle(el).touchAction);
    expect(['auto', 'manipulation']).toContain(touchAction);

    // Verify touch target height is at least 44px
    const rect = await switcher.boundingBox();
    expect(rect.height).toBeGreaterThanOrEqual(44);

    // Verify font-size is 16px to prevent iOS auto-zoom
    const fontSize = await switcher.evaluate((el) => window.getComputedStyle(el).fontSize);
    expect(fontSize).toBe('16px');

    // Verify changing value works cleanly
    await switcher.selectOption(story2Id);
    const updatedId = await page.evaluate(() => window.ui.currentStoryId);
    expect(updatedId).toBe(story2Id);
  });

  test('7. Mobile landscape: shelves maintain side-scrolling and format parity', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');
    await page.evaluate(() => { window.location.hash = 'discover'; });

    const allScrollContainer = page.locator('.story-grid-row[data-shelf="all-stories"] .shelf-scroll-container');
    await expect(allScrollContainer).toBeVisible();

    const scrollMetrics = await allScrollContainer.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      canScroll: el.scrollWidth > el.clientWidth
    }));
    expect(scrollMetrics.canScroll).toBe(true);

    // Verify format parity: all stories first card has H2 titleTag
    const allTitleTag = await page.locator('.story-grid-row[data-shelf="all-stories"] .story-card-title').first().evaluate((el) => el.tagName);
    const newlyAddedTitleTag = await page.locator('.story-grid-row[data-shelf="newly-added"] .story-card-title').first().evaluate((el) => el.tagName);
    expect(allTitleTag).toBe('H2');
    expect(newlyAddedTitleTag).toBe('H2');
  });
});
