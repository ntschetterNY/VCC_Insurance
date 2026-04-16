-- ============================================================================
-- VCC Insurance — Catch-up migration for schema additions in 003 / 004
--
-- Just like 005 fixed the doc_type CHECK constraint that migration 002
-- never made it to production, this migration ensures every schema
-- addition from migrations 003 and 004 is present. Symptom that triggered
-- this: AI Analysis failing with
--   "Could not find the 'custom_checks' column of 'ai_analysis' in the
--    schema cache"
-- which is added by 003_usage_schedule_groups_review_checks.sql.
--
-- This migration is IDEMPOTENT and PURELY ADDITIVE. It will not touch
-- any existing data and is safe to run multiple times.
--
-- HOW TO APPLY:
--   1. Open your Supabase project → SQL Editor
--   2. Paste EVERYTHING below and click "Run"
--   3. Re-try AI Analysis. The schema-cache error will be gone.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ai_analysis.custom_checks — required by /api/analysis upsert
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_analysis
  ADD COLUMN IF NOT EXISTS custom_checks JSONB DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- 2. memory.active — required by classification-hint and review-check queries
-- ---------------------------------------------------------------------------
ALTER TABLE public.memory
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- ---------------------------------------------------------------------------
-- 3. schedule.schedule_group / schedule.schedule_type / schedule.deductible
--    Used by upload + review pages when matching a trade to its limits.
-- ---------------------------------------------------------------------------
ALTER TABLE public.schedule
  ADD COLUMN IF NOT EXISTS schedule_group TEXT DEFAULT 'A';

ALTER TABLE public.schedule
  ADD COLUMN IF NOT EXISTS schedule_type TEXT;

-- Add the CHECK constraint for schedule_type only if it doesn't exist.
-- (Wrapped in DO so the conditional doesn't fail if it's already present.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedule_schedule_type_check'
  ) THEN
    ALTER TABLE public.schedule
      ADD CONSTRAINT schedule_schedule_type_check
      CHECK (schedule_type IS NULL OR schedule_type IN ('A', 'B', 'C'));
  END IF;
END $$;

ALTER TABLE public.schedule
  ADD COLUMN IF NOT EXISTS deductible INTEGER;

-- ---------------------------------------------------------------------------
-- 4. subcontractors.schedule_type — persists the auto-suggested schedule
-- ---------------------------------------------------------------------------
ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS schedule_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subcontractors_schedule_type_check'
  ) THEN
    ALTER TABLE public.subcontractors
      ADD CONSTRAINT subcontractors_schedule_type_check
      CHECK (schedule_type IS NULL OR schedule_type IN ('A', 'B', 'C'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. ai_usage_log — token usage tracking (powers the AI Usage page)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id SERIAL PRIMARY KEY,
  model TEXT NOT NULL,
  function_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  submission_id INTEGER REFERENCES public.submissions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY does not support IF NOT EXISTS; wrap in DO.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_usage_log'
      AND policyname = 'Authenticated users can read ai_usage_log'
  ) THEN
    CREATE POLICY "Authenticated users can read ai_usage_log" ON public.ai_usage_log
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_usage_log'
      AND policyname = 'Authenticated users can insert ai_usage_log'
  ) THEN
    CREATE POLICY "Authenticated users can insert ai_usage_log" ON public.ai_usage_log
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;
