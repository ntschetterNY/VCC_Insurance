-- ============================================================================
-- VCC Insurance — Expand document types
-- Adds support for granular document classification (endorsements, policy
-- sub-types, ACORD 28, contracts, etc.)
-- ============================================================================

-- Drop the old CHECK constraint and add expanded one
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
