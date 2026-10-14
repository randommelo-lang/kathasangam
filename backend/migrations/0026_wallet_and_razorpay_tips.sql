-- 0026_wallet_and_razorpay_tips.sql
-- Creator Wallet, Razorpay payment verification, and Payout request system.

-- 1. Create Wallets Table for Creator Balances
CREATE TABLE IF NOT EXISTS public.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    total_earned NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_earned >= 0),
    total_withdrawn NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_withdrawn >= 0),
    payout_upi_id TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backfill a wallet for every existing profile
INSERT INTO public.wallets (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- 2. Enhance tips table with payment gateway details
ALTER TABLE public.tips
    ADD COLUMN IF NOT EXISTS order_id TEXT,
    ADD COLUMN IF NOT EXISTS payment_id TEXT,
    ADD COLUMN IF NOT EXISTS signature TEXT,
    ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'INR',
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(10, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS net_amount NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS donor_name TEXT,
    ADD COLUMN IF NOT EXISTS donor_message TEXT,
    ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Backfill author_id from stories for legacy tips
UPDATE public.tips
SET author_id = stories.author_id,
    gross_amount = COALESCE(tips.amount, 5),
    net_amount = COALESCE(tips.amount, 5),
    status = 'completed'
FROM public.stories
WHERE tips.story_id = stories.id AND tips.author_id IS NULL;

-- 3. Wallet Transactions Ledger
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL, -- 'tip_received', 'payout_withdrawal', 'payout_refund'
    gross_amount NUMERIC(10, 2) NOT NULL,
    platform_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    net_amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'completed', -- 'completed', 'pending', 'rejected'
    reference_id TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Payout Requests
CREATE TABLE IF NOT EXISTS public.payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payout_upi_id TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'rejected'
    admin_notes TEXT,
    transaction_ref TEXT,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_wallets_user ON public.wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON public.wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_order_id ON public.tips(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tips_payment_id_unique ON public.tips(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tips_author_id ON public.tips(author_id);
CREATE INDEX IF NOT EXISTS idx_tips_story_completed ON public.tips(story_id, status);
CREATE INDEX IF NOT EXISTS idx_payout_requests_user ON public.payout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON public.payout_requests(status);

-- Enable RLS
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Wallets
CREATE POLICY "Users view own wallet" ON public.wallets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users update own payout upi" ON public.wallets
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for Wallet Transactions
CREATE POLICY "Users view own transactions" ON public.wallet_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- RLS Policies for Payout Requests
CREATE POLICY "Users view own payout requests" ON public.payout_requests
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own payout requests" ON public.payout_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Public can view completed tips on published stories (for supporter feed)
DROP POLICY IF EXISTS "Users view own tips, authors view tips, mods/admins view all" ON public.tips;
CREATE POLICY "View completed tips publicly, authors and donors view details" ON public.tips
    FOR SELECT USING (
        status = 'completed' OR
        auth.uid() = user_id OR
        auth.uid() = author_id OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE public.profiles.id = auth.uid()
            AND public.profiles.role IN ('moderator', 'admin')
        )
    );
