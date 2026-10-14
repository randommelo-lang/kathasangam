import { test, expect } from '@playwright/test';

test.describe('About Section, Social Media & Notification Persistence', () => {

  test('About Section renders properly as continuous markdown document with official social links', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('kathasangam_welcome_popup_v1', 'true');
      localStorage.setItem('kathasangam_onboarding_dismissed', 'true');
    });

    // Mock /api/config with custom social links
    await page.route('**/api/config', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          supabase_url: 'https://mock.supabase.co',
          supabase_anon_key: 'mock-key',
          social_links: {
            nyburs: 'https://www.nyburs.com/home',
            vync: 'https://vync.live/',
            twitter: 'https://twitter.com/kathasangam',
            github: 'https://github.com/randommelo-lang/kathasangam',
            email: 'contact@kathasangam.co.in'
          }
        })
      });
    });

    await page.route('**/api/stories*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, limit: 20 })
      });
    });

    await page.goto('/');

    // 1. Discover toolbar contains the About button (icon-only, SVG circle with 'i')
    const aboutBtn = page.locator('.about-nav-btn');
    await expect(aboutBtn).toBeVisible();
    await expect(aboutBtn.locator('svg')).toBeVisible();

    // 2. Click About button -> routes to #about
    await aboutBtn.click();
    await expect(page).toHaveURL(/#about/);

    // 3. Verify Hero and title in markdown document
    const heroTitle = page.locator('.about-hero-title');
    await expect(heroTitle).toContainText('KathaSangam');
    const heroBadge = page.locator('.about-hero-badge');
    await expect(heroBadge).toContainText('Indian Literature');

    // 4. Verify Section 1: Mission & Formats is visible
    await expect(page.locator('text=Stories Across India')).toBeVisible();
    await expect(page.locator('h3:has-text("Web Novels")')).toBeVisible();
    await expect(page.locator('text=Chitrānk (चित्रांक)')).toBeVisible();

    // 5. Verify Section 2: Platform Guide is visible continuously (no tab clicking needed)
    await expect(page.locator('text=Customizable Reader')).toBeVisible();
    await expect(page.locator('text=Creator Tipping')).toBeVisible();

    // 6. Verify Section 3: Rules & Guidelines is visible
    await expect(page.locator('text=100% Intellectual Property & Copyright Ownership')).toBeVisible();
    await expect(page.locator('text=Accurate Content Ratings & NSFW Labeling')).toBeVisible();

    // 7. Verify Section 4: Open Source Stack is visible (including itshover)
    await expect(page.locator('text=Rust & Axum')).toBeVisible();
    await expect(page.locator('text=Tokio & SQLx')).toBeVisible();
    await expect(page.locator('text=Mammoth.js')).toBeVisible();
    await expect(page.locator('text=PDF.js')).toBeVisible();
    const itshoverLink = page.locator('a[href="https://github.com/itshover/itshover"]');
    await expect(itshoverLink).toBeVisible();
    await expect(itshoverLink).toContainText('itshover');

    // 8. Verify Section 5: Community & Socials is visible with SVG icons
    const nybursCard = page.locator('.nyburs-card');
    await expect(nybursCard).toBeVisible();
    await expect(nybursCard).toHaveAttribute('href', 'https://www.nyburs.com/home');
    await expect(nybursCard.locator('img[src*="Nyburs.svg"]')).toBeVisible();

    const vyncCard = page.locator('.vync-card');
    await expect(vyncCard).toBeVisible();
    await expect(vyncCard).toHaveAttribute('href', 'https://vync.live/');
    await expect(vyncCard.locator('img[src*="Vync.svg"]')).toBeVisible();

    const twitterCard = page.locator('.twitter-card');
    await expect(twitterCard).toBeVisible();
    await expect(twitterCard).toHaveAttribute('href', 'https://twitter.com/kathasangam');
    await expect(twitterCard.locator('img[src*="twitter-x-icon.svg"]')).toBeVisible();

    const githubCard = page.locator('.github-card');
    await expect(githubCard).toBeVisible();
    await expect(githubCard).toHaveAttribute('href', 'https://github.com/randommelo-lang/kathasangam');
    await expect(githubCard.locator('img[src*="github-icon.svg"]')).toBeVisible();

    const emailCard = page.locator('.email-card');
    await expect(emailCard).toBeVisible();
    await expect(emailCard).toHaveAttribute('href', 'mailto:contact@kathasangam.co.in');
    await expect(emailCard.locator('img[src*="gmail-icon.svg"]')).toBeVisible();
  });

  test('Notification persistence: clicking notification marks it as read, stays in list, updates badge', async ({ page }) => {
    let patchedReadId = null;

    await page.addInitScript(() => {
      localStorage.setItem('kathasangam_welcome_popup_v1', 'true');
      localStorage.setItem('kathasangam_onboarding_dismissed', 'true');
    });

    await page.route('**/api/config', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ supabase_url: '', supabase_anon_key: '' })
      });
    });

    await page.route('**/api/notifications', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'notif-101',
            message: 'New chapter in Sacred Blade',
            is_read: false,
            created_at: new Date().toISOString()
          },
          {
            id: 'notif-102',
            message: 'Author replied to your comment',
            is_read: true,
            created_at: new Date(Date.now() - 3600000).toISOString()
          }
        ])
      });
    });

    await page.route('**/api/notifications/*/read', async route => {
      patchedReadId = route.request().url();
      await route.fulfill({ status: 204 });
    });

    await page.route('**/api/stories*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, limit: 20 })
      });
    });

    await page.goto('/');

    await expect(page.locator('#signInBtn')).toBeVisible();

    // Simulate logged in user with notifications and update UI
    await page.evaluate(() => {
      window.state.user = { id: 'u1', email: 'reader@example.com' };
      window.state.profile = { username: 'testuser', role: 'reader' };
      window.state.notifications = [
        {
          id: 'notif-101',
          message: 'New chapter in Sacred Blade',
          is_read: false,
          created_at: new Date().toISOString()
        },
        {
          id: 'notif-102',
          message: 'Author replied to your comment',
          is_read: true,
          created_at: new Date(Date.now() - 3600000).toISOString()
        }
      ];
      window.updateAuthUI();
      window.updateHeroNotificationUI();
    });

    // 1. Verify bell button is visible
    const bellBtn = page.locator('.hero-bell-btn');
    await expect(bellBtn).toBeVisible();

    // 2. Verify bell badge is visible because notif-101 is unread
    const bellBadge = page.locator('.hero-bell-badge');
    await expect(bellBadge).toBeVisible();

    // 3. Open notification dropdown
    await bellBtn.click();
    const dropdown = page.locator('.notification-dropdown');
    await expect(dropdown).toBeVisible();

    // 4. Verify items are rendered with unread/read classes and timestamps
    const unreadItem = page.locator('.notification-item.notification-unread');
    await expect(unreadItem).toBeVisible();
    await expect(unreadItem).toContainText('New chapter in Sacred Blade');
    await expect(unreadItem).toContainText('Just now');

    const readItem = page.locator('.notification-item.notification-read');
    await expect(readItem).toBeVisible();
    await expect(readItem).toContainText('Author replied to your comment');
    await expect(readItem).toContainText('1h ago');

    // 5. Click the unread notification
    await unreadItem.click();

    // Verify PATCH was called to mark as read
    expect(patchedReadId).toContain('notif-101/read');

    // 6. Open bell dropdown again -> Verify notification is STILL there! (Persistent!)
    await bellBtn.click();
    await expect(page.locator('.notification-dropdown')).toBeVisible();
    await expect(page.locator('.notification-dropdown').locator('text=New chapter in Sacred Blade')).toBeVisible();

    // 7. Verify bell badge is now gone because all notifications are read
    await expect(page.locator('.hero-bell-badge')).toHaveCount(0);
  });

  test('Onboarding welcome modal includes across India phrasing and routes to About', async ({ page }) => {
    await page.route('**/api/config', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ supabase_url: 'https://mock.supabase.co', supabase_anon_key: 'mock-key' })
      });
    });

    await page.route('**/api/stories*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, limit: 20 })
      });
    });

    // Clear dismissed flag
    await page.addInitScript(() => {
      localStorage.removeItem('kathasangam_welcome_popup_v1');
      localStorage.removeItem('kathasangam_onboarding_dismissed');
    });

    await page.goto('/');

    // 1. Verify modal appears with "across India"
    const modalSubtitle = page.locator('#onboardingModalSubtitle');
    await expect(modalSubtitle).toBeVisible();
    await expect(modalSubtitle).toContainText('across India');

    // 2. Verify social strip and Explore Full About button
    const aboutFromModal = page.locator('[data-action="openAboutFromOnboarding"]');
    await expect(aboutFromModal).toBeVisible();
    await aboutFromModal.click();

    // 3. Verify routed to #about and modal dismissed
    await expect(page).toHaveURL(/#about/);
    await expect(page.locator('#onboardingModalBackdrop')).toHaveCount(0);
  });

  test('TOC pills in about-toc-bar navigate/scroll to sections without redirecting to #discover', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('kathasangam_welcome_popup_v1', 'true');
      localStorage.setItem('kathasangam_onboarding_dismissed', 'true');
    });

    await page.route('**/api/config', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ supabase_url: '', supabase_anon_key: '' })
      });
    });

    await page.route('**/api/stories*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, limit: 20 })
      });
    });

    await page.goto('/#about');

    // Verify on #about view
    await expect(page.locator('.about-hero-title')).toBeVisible();

    const tocBar = page.locator('.about-toc-bar');
    await expect(tocBar).toBeVisible();

    // Click "Rules & Guidelines" pill
    const rulesPill = tocBar.locator('.toc-pill', { hasText: 'Rules & Guidelines' });
    await expect(rulesPill).toBeVisible();
    await rulesPill.click();

    // Wait a brief moment to ensure no redirect to #discover occurred
    await page.waitForTimeout(500);

    // Verify still on #about and NOT redirected to #discover
    expect(page.url()).not.toContain('#discover');
    await expect(page.locator('#rules-guidelines')).toBeVisible();
    await expect(page.locator('.about-hero-title')).toBeVisible();

    // Click "Community Channels" pill
    const commPill = tocBar.locator('.toc-pill', { hasText: 'Community Channels' });
    await expect(commPill).toBeVisible();
    await commPill.click();
    await page.waitForTimeout(500);

    expect(page.url()).not.toContain('#discover');
    await expect(page.locator('#community-channels')).toBeVisible();
  });

});

