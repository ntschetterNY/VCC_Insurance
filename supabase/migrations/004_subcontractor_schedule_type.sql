-- Add schedule_type to subcontractors so the suggested schedule persists
ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS schedule_type TEXT CHECK (schedule_type IN ('A', 'B', 'C'));
