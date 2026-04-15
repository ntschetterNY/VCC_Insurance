-- ============================================================================
-- VCC Insurance — AI usage tracking, schedule groups, review checks
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. AI Usage Log — tracks token usage per model and function
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

CREATE POLICY "Authenticated users can read ai_usage_log" ON public.ai_usage_log
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert ai_usage_log" ON public.ai_usage_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 2. Schedule groups (A, B, C) — added to schedule table
-- ---------------------------------------------------------------------------
ALTER TABLE public.schedule
  ADD COLUMN IF NOT EXISTS schedule_group TEXT DEFAULT 'A';

-- Update existing seed data with default groups
UPDATE public.schedule SET schedule_group = 'A' WHERE schedule_group IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Review checks — custom items to check during AI review
--    Uses the existing memory table with category = 'Review Check'
--    No schema change needed — just documenting the convention.
--    We also add an 'active' column to memory for toggling checks on/off.
-- ---------------------------------------------------------------------------
ALTER TABLE public.memory
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- ---------------------------------------------------------------------------
-- 4. Custom checks column on ai_analysis
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_analysis
  ADD COLUMN IF NOT EXISTS custom_checks JSONB DEFAULT '{}';
