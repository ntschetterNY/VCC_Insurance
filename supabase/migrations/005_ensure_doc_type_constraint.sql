-- ============================================================================
-- VCC Insurance — Ensure documents.doc_type CHECK constraint is up to date
--
-- Migration 002 expanded the allowed doc_type values, but if 002 was never
-- applied to a given Supabase instance the app will keep failing with
-- `new row for relation "documents" violates check constraint
--  "documents_doc_type_check"` when the client or AI sends any of the
-- newer values (policy_gl, policy_excess, endorsement, etc.).
--
-- This migration is IDEMPOTENT. Run it as many times as you want — it will
-- always leave the DB with the correct expanded constraint.
--
-- HOW TO APPLY THIS IF `supabase db push` / migration CLI isn't wired up:
--   1. Open your Supabase project → SQL Editor
--   2. Paste EVERYTHING below and click "Run"
--   3. Re-try the upload. The
--      "documents_doc_type_check" error will be gone.
-- ============================================================================

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_doc_type_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN (
    'accord25',
    'accord28',
    'policy',
    'policy_gl',
    'policy_excess',
    'policy_wc',
    'policy_auto',
    'endorsement',
    'contract',
    'other'
  ));
