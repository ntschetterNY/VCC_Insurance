-- ============================================================================
-- VCC Insurance — Supabase PostgreSQL Migration
-- Run this in the Supabase SQL Editor to create all tables and RLS policies.
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. Users profile table (linked to Supabase Auth via auth.users.id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'reviewer' CHECK (role IN ('admin', 'reviewer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Subcontractors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subcontractors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  trade TEXT,
  tier TEXT CHECK (tier IN ('primary', 'second')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Submissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.submissions (
  id SERIAL PRIMARY KEY,
  sub_id INTEGER NOT NULL REFERENCES public.subcontractors(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'approved', 'rejected')),
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  assigned_to UUID REFERENCES public.users(id),
  procore_project_id TEXT,
  procore_contract_id TEXT
);

-- ---------------------------------------------------------------------------
-- 4. Documents (files stored in Supabase Storage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  doc_type TEXT CHECK (doc_type IN ('accord25', 'policy')),
  filename TEXT,
  storage_path TEXT,
  extracted_text TEXT,
  processed_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- 5. AI Analysis results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_analysis (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER UNIQUE NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  cg_numbers JSONB DEFAULT '[]',
  limits_found JSONB DEFAULT '{}',
  limits_met BOOLEAN DEFAULT false,
  issues JSONB DEFAULT '[]',
  flags JSONB DEFAULT '[]',
  checklist JSONB DEFAULT '{}',
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. Reviewer flags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviewer_flags (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  flag_type TEXT,
  description TEXT,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. Insurance requirement schedule
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule (
  id SERIAL PRIMARY KEY,
  trade TEXT NOT NULL,
  gl_per_occurrence INTEGER,
  gl_aggregate INTEGER,
  workers_comp INTEGER,
  auto_liability INTEGER,
  umbrella INTEGER,
  notes TEXT
);

-- ---------------------------------------------------------------------------
-- 8. Knowledge base / memory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.memory (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  severity TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 9. Settings (key-value store)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ---------------------------------------------------------------------------
-- 10. Audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_address TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- All authenticated users can read most data; writes are more restrictive.
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviewer_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Users: authenticated users can read all, only admins can modify
CREATE POLICY "Users are viewable by authenticated users" ON public.users
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage users" ON public.users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Subcontractors: full access for authenticated users
CREATE POLICY "Authenticated users can manage subcontractors" ON public.subcontractors
  FOR ALL USING (auth.role() = 'authenticated');

-- Submissions: full access for authenticated users
CREATE POLICY "Authenticated users can manage submissions" ON public.submissions
  FOR ALL USING (auth.role() = 'authenticated');

-- Documents: full access for authenticated users
CREATE POLICY "Authenticated users can manage documents" ON public.documents
  FOR ALL USING (auth.role() = 'authenticated');

-- AI Analysis: full access for authenticated users
CREATE POLICY "Authenticated users can manage ai_analysis" ON public.ai_analysis
  FOR ALL USING (auth.role() = 'authenticated');

-- Reviewer flags: full access for authenticated users
CREATE POLICY "Authenticated users can manage reviewer_flags" ON public.reviewer_flags
  FOR ALL USING (auth.role() = 'authenticated');

-- Schedule: read for all, write for admins
CREATE POLICY "Authenticated users can read schedule" ON public.schedule
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage schedule" ON public.schedule
  FOR ALL USING (auth.role() = 'authenticated');

-- Memory: full access for authenticated users
CREATE POLICY "Authenticated users can manage memory" ON public.memory
  FOR ALL USING (auth.role() = 'authenticated');

-- Settings: read for all authenticated, write for admins
CREATE POLICY "Authenticated users can read settings" ON public.settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage settings" ON public.settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Audit log: admins can read, system can write
CREATE POLICY "Admins can read audit_log" ON public.audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authenticated users can insert audit_log" ON public.audit_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- SEED DATA — default schedule requirements
-- ============================================================================
INSERT INTO public.schedule (trade, gl_per_occurrence, gl_aggregate, workers_comp, auto_liability, umbrella, notes)
VALUES
  ('General Contractor', 1000000, 2000000, 1000000, 1000000, 5000000, 'Standard GC requirements'),
  ('Electrical', 1000000, 2000000, 500000, 1000000, 2000000, 'Electrical subcontractor requirements'),
  ('Plumbing', 1000000, 2000000, 500000, 1000000, 2000000, 'Plumbing subcontractor requirements')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- STORAGE BUCKET — for uploaded PDF documents
-- Run this separately in the Supabase Dashboard > Storage section, or via SQL:
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT DO NOTHING;

-- Storage policies: authenticated users can upload/download
CREATE POLICY "Authenticated users can upload documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents' AND auth.role() = 'authenticated');

CREATE POLICY "Admins can delete documents" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents'
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
