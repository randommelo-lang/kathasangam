-- SB-13: bound tip amounts at the schema level.
--
-- `tips.amount` is INTEGER with no CHECK constraint (see 0003_supabase_upgrade.sql:146)
-- and the handler now validates the range before use. This constraint is defence in
-- depth: it holds even if a future write path forgets the handler check, and it stops
-- rows that predate the fix from continuing to corrupt `stories.earnings`.

ALTER TABLE public.tips
    DROP CONSTRAINT IF EXISTS tips_amount_bounds;

ALTER TABLE public.tips
    ADD CONSTRAINT tips_amount_bounds
    CHECK (amount IS NULL OR (amount >= 1 AND amount <= 10000));