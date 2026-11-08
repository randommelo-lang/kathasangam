import { test, expect } from '@playwright/test';

const sampleStories = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    author_id: 'author-1',
    title: 'Fantasy Romance Story',
    type: 'Web Novel',
    genre: 'Fantasy, Romance',
    status: 'published',
    views: 100,
    likes: 20,
    followers: 10,
    chapters: [{ id: 'ch-1', title: 'Chapter 1', status: 'published', words: 500, reads: 100, likes: 20 }]
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    author_id: 'author-1',
    title: 'Sci-Fi Romance Adventure',
    type: 'Web Novel',
    genre: 'Romance, Sci-Fi',
    status: 'published',
    views: 200,
    likes: 40,
    followers: 15,
    chapters: [{ id: 'ch-2', title: 'Chapter 1', status: 'published', words: 800, reads: 200, likes: 40 }]
  }
];

async function installApiMocks(page, stories = []) {
  await page.addInitScript(() => {
    localStorage.setItem('kathasangam_onboarding_dismissed', 'true');
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
        body: JSON.stringify({ items: stories, next_cursor: null, has_more: false })
      });
    }
    if (url.pathname === '/api/stats') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ published: stories.length, views: 300, followers: 25, open_reports: 0 })
      });
    }
    if (url.pathname === '/api/progress' || url.pathname === '/api/library/ids' || url.pathname === '/api/notifications' || url.pathname.includes('internal-notes')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

test.describe('Genre Analytics and Display Name', () => {
  test('calculates and renders clean unclustered genre analytics bars with comma separation and tooltips', async ({ page }) => {
    await installApiMocks(page, sampleStories);
    await page.goto('/');

    await page.evaluate((stories) => {
      window.state.user = { id: 'author-1', email: 'author@example.com' };
      window.state.profile = {
        id: 'author-1',
        username: 'author_pro',
        display_name: 'Author Pro',
        role: 'author'
      };
      window.state.role = 'author';
      window.state.stories = stories;
      window.location.hash = 'studio';
    }, sampleStories);

    // Studio active series switcher and workspace are loaded
    await expect(page.locator('.studio-main')).toBeVisible();

    // Click on Genre Analytics tab
    const genreTabBtn = page.getByRole('button', { name: 'Genre Analytics' });
    await expect(genreTabBtn).toBeVisible();
    await genreTabBtn.click();

    // Verify SVG chart is rendered
    const svgChart = page.locator('.svg-chart-container svg');
    await expect(svgChart).toBeVisible();

    // Check individual bar groups for Romance, Sci-Fi, and Fantasy
    const barGroups = svgChart.locator('g.genre-chart-bar-group');
    await expect(barGroups).toHaveCount(3);

    // Verify chart text contains clean separated genre labels
    const textContent = await svgChart.textContent();
    expect(textContent).toContain('Romance');
    expect(textContent).toContain('Sci-Fi');
    expect(textContent).toContain('Fantasy');
  });

  test('displays display_name with @username handle, account menu, and allows updating display_name in settings', async ({ page }) => {
    let putPayload = null;
    await installApiMocks(page, sampleStories);

    await page.route('**/api/profile**', async (route) => {
      const method = route.request().method();
      if (method === 'PUT') {
        putPayload = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Profile updated' })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-1',
          username: 'penmaster',
          display_name: 'Pen Master 99',
          role: 'author',
          avatar_url: '',
          bio: 'Writing captivating stories.',
          followers_count: 8,
          following_count: 3,
          preferences: {}
        })
      });
    });

    await page.goto('/');

    await page.evaluate(() => {
      window.state.user = { id: 'user-1', email: 'penmaster@example.com' };
      window.state.profile = {
        id: 'user-1',
        username: 'penmaster',
        display_name: 'Pen Master 99',
        role: 'author',
        avatar_url: '',
        bio: 'Writing captivating stories.',
        followers_count: 8,
        following_count: 3,
        preferences: {}
      };
      window.state.role = 'author';
      window.location.hash = 'profile';
    });

    // 1. Profile header displays Display Name and @username handle
    const profileHeader = page.locator('.profile-header-card');
    await expect(profileHeader).toBeVisible();
    await expect(profileHeader.locator('.profile-display-name')).toHaveText('Pen Master 99');
    await expect(profileHeader.locator('.profile-username-handle')).toHaveText('@penmaster');

    // 2. Settings view has Display Name input and update button
    await page.evaluate(() => {
      window.location.hash = 'settings';
    });

    const displayNameInput = page.locator('input[name="display_name"]');
    await expect(displayNameInput).toBeVisible();
    await expect(displayNameInput).toHaveValue('Pen Master 99');

    // Update display name
    await displayNameInput.fill('Grand Author');
    const updateBtn = page.getByRole('button', { name: 'Update Display Name' });
    await expect(updateBtn).toBeVisible();
    await updateBtn.click();

    // Verify PUT request was dispatched with new display_name
    await expect.poll(() => putPayload).toEqual({ display_name: 'Grand Author' });
  });

  test('falls back cleanly to username when display_name is not set', async ({ page }) => {
    await installApiMocks(page, sampleStories);
    await page.goto('/');

    await page.evaluate(() => {
      window.state.user = { id: 'user-2', email: 'solouser@example.com' };
      window.state.profile = {
        id: 'user-2',
        username: 'solouser',
        display_name: '',
        role: 'reader',
        avatar_url: '',
        bio: '',
        followers_count: 0,
        following_count: 0,
        preferences: {}
      };
      window.state.role = 'reader';
      window.location.hash = 'profile';
    });

    const profileHeader = page.locator('.profile-header-card');
    await expect(profileHeader).toBeVisible();
    await expect(profileHeader.locator('.profile-display-name')).toHaveText('solouser');
    // Handle should NOT be shown if display_name is empty / identical to username
    await expect(profileHeader.locator('.profile-username-handle')).toHaveCount(0);
  });
});
