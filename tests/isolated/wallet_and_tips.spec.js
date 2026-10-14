import { test, expect } from '@playwright/test';

const storyId = '11111111-1111-4111-8111-111111111111';
const story = {
  id: storyId,
  author_id: 'author-1',
  title: 'The Test Chronicle',
  author: 'A. Writer',
  type: 'Web Novel',
  genre: 'Fantasy',
  language: 'English',
  license: 'Original',
  status: 'published',
  tags: ['test'],
  description: 'A story for isolated browser checks.',
  cover: '',
  followers: 3,
  views: 42,
  likes: 8,
  earnings: 0,
  progress: 0,
  created_at: '2026-01-01T00:00:00',
  isNsfw: false,
  chapters: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      sort_order: 1,
      title: 'The First Page',
      status: 'published',
      access: 'public',
      words: 10,
      reads: 7,
      likes: 1,
      content: ['A chapter shown in the browser test.'],
      pages: null,
      comments: [
        {
          id: 'c-1',
          user_id: 'supporter-1',
          user: 'Anjali',
          text: 'Loved this chapter so much!',
          paragraphIndex: null,
          parentId: null,
          isSupporter: true
        }
      ]
    }
  ],
  collaborators: []
};

async function installApiMocks(page) {
  page.on('pageerror', (error) => console.error('[page error]', error.message));
  page.on('console', (msg) => console.log('[browser]', msg.type(), msg.text()));
  await page.addInitScript(() => {
    localStorage.setItem('kathasangam_onboarding_dismissed', 'true');
    localStorage.setItem('kathasangam_welcome_popup_v1', 'true');
  });

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/api/config') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          supabase_url: '',
          supabase_anon_key: '',
          admin_email: '',
          moderator_emails: []
        })
      });
    }

    if (url.pathname === '/api/stories') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [story], next_cursor: null, has_more: false })
      });
    }

    if (url.pathname === `/api/stories/${storyId}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(story)
      });
    }

    if (url.pathname === `/api/stories/${storyId}/tips`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'tip-1',
            donor_name: 'Anjali',
            donor_message: 'Keep going!',
            gross_amount: 50.0,
            created_at: '2026-10-14T10:00:00'
          }
        ])
      });
    }

    if (url.pathname === `/api/stories/${storyId}/tip`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          order_id: 'order_sim_12345',
          amount: 5000,
          currency: 'INR',
          key_id: 'rzp_test_mock',
          story_id: storyId,
          story_title: story.title,
          author_name: story.author
        })
      });
    }

    if (url.pathname === `/api/stories/${storyId}/tip/verify`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          message: 'Thank you! ₹50 donation received.',
          gross_amount: 50.0,
          net_amount: 47.5,
          platform_fee: 2.5
        })
      });
    }

    if (url.pathname === '/api/wallet') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          balance: 475.0,
          total_earned: 950.0,
          total_withdrawn: 475.0,
          payout_upi_id: 'author@okhdfcbank',
          min_withdrawal_amount: 100.0,
          platform_fee_percent: 5.0
        })
      });
    }

    if (url.pathname === '/api/wallet/transactions') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'tx-1',
            type: 'tip_received',
            gross_amount: 50.0,
            platform_fee: 2.5,
            net_amount: 47.5,
            currency: 'INR',
            status: 'completed',
            description: 'Tip from Anjali on "The Test Chronicle"',
            created_at: '2026-10-14T10:00:00'
          }
        ])
      });
    }

    if (url.pathname === '/api/author/tips') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'tip-1',
              story_title: 'The Test Chronicle',
              donor_name: 'Anjali',
              donor_message: 'Keep going!',
              gross_amount: 50.0,
              net_amount: 47.5,
              created_at: '2026-10-14T10:00:00'
            }
          ]
        })
      });
    }

    if (url.pathname === '/api/stats') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ published: 1, views: 42, followers: 3, open_reports: 0 })
      });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

test('renders Support Creator button and opens donation modal with preset chips and fee note', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/#story?id=' + storyId);

  // 1. Verify Support Creator button is visible in action row
  const supportBtn = page.locator('button.btn-support-creator').first();
  await expect(supportBtn).toBeVisible();

  // 2. Click to open modal
  await supportBtn.click();
  const modal = page.locator('.support-modal-box');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Support A. Writer');
  await expect(modal).toContainText('95% directly credited to the creator\'s wallet · 5% platform fee');

  // 3. Verify preset chips
  const chip100 = modal.locator('button[data-amount="100"]');
  await expect(chip100).toBeVisible();
  await chip100.click();

  const payBtn = modal.locator('.support-pay-btn');
  await expect(payBtn).toContainText('Proceed to Pay ₹100');

  // 4. Test simulated payment flow
  await payBtn.click();

  // 5. Verify Celebration Success Dialog appears
  const successModal = page.locator('.celebration-modal-box');
  await expect(successModal).toBeVisible();
  await expect(successModal).toContainText('Thank You for Supporting!');
  await expect(successModal).toContainText('₹100');

  // Close celebration dialog
  await successModal.locator('button').click();
  await expect(successModal).toBeHidden();
});

test('renders Creator Wallet with available balance, total earnings, and transaction history', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/');

  // Set logged in user state and navigate to #wallet
  await page.evaluate(() => {
    window.state.user = { id: 'author-1', email: 'author@example.com' };
    window.state.profile = { id: 'author-1', username: 'TestAuthor', role: 'author' };
    window.location.hash = 'wallet';
  });

  // Verify wallet header and stats cards
  await expect(page.locator('.wallet-page-title')).toHaveText('Creator Wallet & Earnings');
  await expect(page.locator('.balance-value')).toHaveText('₹475.00');
  await expect(page.locator('.wallet-stats-grid')).toContainText('Total Net Earnings');
  await expect(page.locator('.wallet-stats-grid')).toContainText('₹950.00');
  await expect(page.locator('.wallet-stats-grid')).toContainText('95% creator share (5% platform fee)');

  // Verify registered UPI ID banner
  await expect(page.locator('.wallet-upi-banner')).toContainText('author@okhdfcbank');

  // Verify transaction history table
  await expect(page.locator('.wallet-history-table')).toBeVisible();
  await expect(page.locator('.wallet-history-table')).toContainText('Tip Credit');
  await expect(page.locator('.wallet-history-table')).toContainText('+₹47.50');
});

test('shows Tip Creator callout at the end of a reader chapter', async ({ page }) => {
  await installApiMocks(page);
  await page.goto('/#reader?story=' + storyId + '&ch=0');

  const readerCallout = page.locator('.reader-support-callout');
  await expect(readerCallout).toBeVisible();
  await expect(readerCallout).toContainText('Enjoying the story?');
  await expect(readerCallout.locator('button')).toContainText('Tip Creator');

  // Verify Supporter emoji badge on comments
  const supporterBadge = page.locator('.comment-supporter-badge');
  await expect(supporterBadge).toBeVisible();
  await expect(supporterBadge).toContainText('Supporter');
});
