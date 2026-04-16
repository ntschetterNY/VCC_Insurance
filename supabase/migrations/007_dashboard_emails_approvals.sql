-- ============================================================================
-- Migration 007 — Dashboard overview, Procore email generation, per-flag
-- review workflow, user self-registration + admin approval, and
-- admin-initiated user creation with first-login password set.
--
-- Run after 005_ensure_doc_type_constraint.sql and 006_ensure_post_002_schema.sql.
--
-- HOW TO RUN:
--   1. Open the Supabase dashboard > SQL Editor.
--   2. Paste this entire file and click "Run".
--   3. Safe to re-run: every CREATE / ALTER uses IF NOT EXISTS guards and
--      policies are dropped before being recreated.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Projects (local cache / grouping of Procore projects)
--    Submissions already have procore_project_id; this gives us a real
--    "project" entity to group submissions by for the dashboard.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  procore_project_id TEXT UNIQUE,
  address TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read projects" ON public.projects;
CREATE POLICY "Authenticated users can read projects" ON public.projects
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage projects" ON public.projects;
CREATE POLICY "Authenticated users can manage projects" ON public.projects
  FOR ALL USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 2. Submissions — link to projects & store policy expiration dates so the
--    dashboard can surface upcoming expirations.
-- ---------------------------------------------------------------------------
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gl_expiration DATE,
  ADD COLUMN IF NOT EXISTS wc_expiration DATE,
  ADD COLUMN IF NOT EXISTS auto_expiration DATE,
  ADD COLUMN IF NOT EXISTS umbrella_expiration DATE,
  ADD COLUMN IF NOT EXISTS subcontractor_email TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_project_id ON public.submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_submissions_gl_expiration ON public.submissions(gl_expiration);

-- ---------------------------------------------------------------------------
-- 3. Reviewer flags — add a per-flag review/check workflow so a reviewer can
--    mark each generated flag as reviewed, identify a real policy issue,
--    and indicate whether we need to collect something from the sub.
-- ---------------------------------------------------------------------------
ALTER TABLE public.reviewer_flags
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai', 'system')),
  ADD COLUMN IF NOT EXISTS check_status TEXT DEFAULT 'pending'
    CHECK (check_status IN ('pending', 'reviewed', 'not_an_issue', 'collected', 'waived')),
  ADD COLUMN IF NOT EXISTS is_policy_issue BOOLEAN,
  ADD COLUMN IF NOT EXISTS needs_collection BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS collection_item TEXT,
  ADD COLUMN IF NOT EXISTS resolution TEXT,
  ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reviewer_flags_check_status ON public.reviewer_flags(check_status);

-- ---------------------------------------------------------------------------
-- 4. Users — add approval status and first-login password-change flag so
--    admins can review/approve signups and create users that reset their
--    password the first time they sign in.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'suspended')),
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 5. Registration requests (self-serve signup awaiting admin approval)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registration_requests (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  company TEXT,
  reason TEXT,
  requested_role TEXT DEFAULT 'reviewer'
    CHECK (requested_role IN ('admin', 'reviewer')),
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;

-- Admins can read and manage registrations. Anonymous inserts are handled
-- through the service-role API route (bypasses RLS); no public policy needed.
DROP POLICY IF EXISTS "Admins can manage registrations" ON public.registration_requests;
CREATE POLICY "Admins can manage registrations" ON public.registration_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 6. Email log — stores every expiration email generated so we can audit,
--    and exposes the Procore email id when the send is fulfilled via the
--    Procore Emails tool.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_log (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES public.submissions(id) ON DELETE SET NULL,
  subcontractor_id INTEGER REFERENCES public.subcontractors(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES public.projects(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  cc_emails TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  email_type TEXT DEFAULT 'expiration'
    CHECK (email_type IN ('expiration', 'collection', 'approval', 'other')),
  delivery_method TEXT DEFAULT 'draft'
    CHECK (delivery_method IN ('draft', 'procore', 'mailto', 'external')),
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'failed')),
  procore_email_id TEXT,
  sent_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  error_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_submission ON public.email_log(submission_id);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON public.email_log(status);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage email_log" ON public.email_log;
CREATE POLICY "Authenticated users can manage email_log" ON public.email_log
  FOR ALL USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 7. Backfill: create a project row for every distinct procore_project_id
--    already recorded in submissions, and link submissions to it.
-- ---------------------------------------------------------------------------
INSERT INTO public.projects (name, procore_project_id)
SELECT DISTINCT
  ('Procore Project ' || procore_project_id) AS name,
  procore_project_id
FROM public.submissions
WHERE procore_project_id IS NOT NULL
  AND procore_project_id <> ''
ON CONFLICT (procore_project_id) DO NOTHING;

UPDATE public.submissions s
   SET project_id = p.id
  FROM public.projects p
 WHERE s.procore_project_id = p.procore_project_id
   AND s.project_id IS NULL;

-- ---------------------------------------------------------------------------
-- 8. Verification — run these after migration to confirm everything landed.
--    (Safe to comment out; they only SELECT.)
-- ---------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('projects', 'registration_requests', 'email_log');
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'submissions'
--     AND column_name IN ('project_id','gl_expiration','wc_expiration',
--                         'auto_expiration','umbrella_expiration','subcontractor_email');
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'reviewer_flags'
--     AND column_name IN ('source','check_status','is_policy_issue',
--                         'needs_collection','collection_item','resolution');
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'users'
--     AND column_name IN ('status','must_change_password','created_by');
--
-- SELECT count(*) AS backfilled_projects FROM public.projects;

