import { test, expect } from '@playwright/test';

test.describe('Chapter Editor Cloud Sync and Cross-Device Persistence', () => {
  const storyId = '99999999-9999-4999-8999-999999999999';
  const chapterId = '88888888-8888-4888-8888-888888888888';

  // Story from /api/stories (content: None as returned by backend metadata list)
  let cloudChapterStore = {
    id: chapterId,
    sort_order: 1,
    title: 'Cloud Synced Chapter',
    status: 'draft',
    access: 'free',
    scheduled_at: null,
    created_at: '2026-11-12T00:00:00Z',
    words: 25,
    reads: 0,
    likes: 0,
    content: ['This is the cloud saved paragraph written previously on another device.'],
    pages: null,
    comments: []
  };

  test('Chapter editor loads content from GET /api/chapters/:id and syncs across devices', async ({ page }) => {
    // 1. Setup API route handlers
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();

      if (url.pathname === '/api/config') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ supabase_url: '', supabase_anon_key: '' }) });
      }

      if (url.pathname === '/api/stories') {
        // Return story with chapter metadata only (content is null, matching backend behavior)
        const storyMetadata = {
          id: storyId,
          author_id: 'test-author-id',
          title: 'Cross Device Story',
          author: 'Test Writer',
          type: 'Web Novel',
          genre: 'Drama',
          status: 'ongoing',
          tags: [],
          description: 'Testing cross device chapter sync.',
          cover: '',
          chapters: [{
            id: chapterId,
            sort_order: 1,
            title: cloudChapterStore.title,
            status: cloudChapterStore.status,
            access: cloudChapterStore.access,
            words: cloudChapterStore.words,
            reads: cloudChapterStore.reads,
            likes: cloudChapterStore.likes,
            content: null, // Note: metadata endpoint sends null content!
            pages: null
          }]
        };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [storyMetadata], next_cursor: null, has_more: false }) });
      }

      if (url.pathname === `/api/chapters/${chapterId}`) {
        if (method === 'GET') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cloudChapterStore) });
        }
        if (method === 'PUT') {
          const body = JSON.parse(route.request().postData() || '{}');
          if (body.title) cloudChapterStore.title = body.title;
          if (body.content) cloudChapterStore.content = body.content;
          if (body.status) cloudChapterStore.status = body.status;
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cloudChapterStore) });
        }
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.addInitScript(() => {
      localStorage.setItem('kathasangam_onboarding_dismissed', 'true');
    });

    await page.goto('/');

    // 2. Set user as author, initialize story state, and open the chapter editor (simulating Desktop opening)
    await page.evaluate(({ sId, chId, cloudCh }) => {
      window.state.user = { id: 'test-author-id', email: 'author@example.test' };
      window.state.role = 'author';
      window.state.stories = [{
        id: sId,
        author_id: 'test-author-id',
        title: 'Cross Device Story',
        author: 'Test Writer',
        type: 'Web Novel',
        genre: 'Drama',
        status: 'ongoing',
        tags: [],
        description: 'Testing cross device chapter sync.',
        cover: '',
        chapters: [{
          id: chId,
          sort_order: 1,
          title: cloudCh.title,
          status: cloudCh.status,
          access: cloudCh.access,
          words: cloudCh.words,
          reads: cloudCh.reads,
          likes: cloudCh.likes,
          content: null,
          pages: null
        }]
      }];
      window.ui.currentStoryId = sId;
      window.ui.editingChapterId = chId;
      window.ui.currentView = 'editor';
      window.location.hash = 'editor';
      window.render();
    }, { sId: storyId, chId: chapterId, cloudCh: cloudChapterStore });

    // 3. Verify editor loads cloud content into paragraph div
    const editorDiv = page.locator('.editor-textarea');
    await expect(editorDiv).toBeVisible();
    await expect(editorDiv).toContainText('This is the cloud saved paragraph written previously on another device.');

    // 4. Verify save status pill shows "Cloud synced"
    const statusPill = page.locator('#editorSaveStatus');
    await expect(statusPill).toBeVisible();
    await expect(statusPill).toContainText('Cloud synced');

    // 5. Type additional content (simulating writing on device)
    await editorDiv.click();
    await page.keyboard.press('Enter');
    await page.keyboard.type('New live paragraph added from editor.');

    // 6. Save Draft
    await page.click('button:has-text("Save Draft")');
    await expect(page.locator('text=Chapter saved').first()).toBeVisible();

    // 7. Verify the cloudChapterStore was updated with the new paragraph
    expect(cloudChapterStore.content.length).toBeGreaterThan(1);
    expect(cloudChapterStore.content.some(p => p.includes('New live paragraph added from editor.'))).toBe(true);
  });
});
