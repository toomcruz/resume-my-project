-- =============================================================================
-- Consolidated schema migration for external Supabase project
-- Generated: 2026-07-18
-- Scope: STRUCTURE ONLY (no data, no users, no files)
-- Safe to run on a fresh Supabase project. Idempotent where possible.
-- =============================================================================
--
-- Source migrations (chronological order):
--   1) 20260715210604_0eebf6b2-c428-45a4-aa7b-de8b5fc185bb.sql
--   2) 20260715210619_7c060b8c-edf1-4f83-a63b-4e380c3648b7.sql
--   3) 20260715210640_96d98112-a81b-43f4-b6b2-ea53361311d0.sql
--   4) 20260715214500_create_agenda_events.sql
--   5) 20260716000528_f16322ec-9d73-47b5-95a1-550429b98780.sql
--   6) 20260716011258_22c57fc3-822b-40d8-9cce-7d6e50ee1cf7.sql
--   7) 20260716012604_9de78f28-999c-4697-8ca3-000b9c136335.sql   (data-rename; NOT included: destructive UPDATE)
--   8) 20260716203000_add_document_template_storage_update_policy.sql
--   9) 20260717230127_6f304cb9-a372-4107-95c2-379f72c29568.sql   (re-declaration of full schema; merged)
--  10) 20260718143306_ff46a92e-8c80-4eb8-a0e7-935363f92773.sql   (funeral_* module)
--  11) 20260718174213_575592a3-327e-4334-a83c-1dc4c21312d6.sql   (extraction_locks + atomic RPCs)
--
-- Tables (14): profiles, attendances, attendance_images, document_templates,
--   generated_documents, agenda_events, exhumation_appointments,
--   funeral_processes, funeral_deceased, funeral_documents,
--   funeral_discrepancies, funeral_field_feedback, funeral_audit_log,
--   extraction_locks
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. STORAGE BUCKETS (private)
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('attendance-images',   'attendance-images',   false),
  ('document-templates',  'document-templates',  false),
  ('generated-documents', 'generated-documents', false)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. SHARED FUNCTIONS
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.set_updated_at()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 3. CORE TABLES
-- =============================================================================

-- profiles ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own profile" ON public.profiles;
CREATE POLICY "Users manage own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- attendances ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  process TEXT NOT NULL CHECK (process IN ('sepultamento','exumacao','ossario','translado','atualizacao_cadastral')),
  subprocess TEXT,
  subprocess_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','extracting','reviewing','generating','done','error')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendances_user_id_idx ON public.attendances (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendances TO authenticated;
GRANT ALL ON public.attendances TO service_role;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own attendances" ON public.attendances;
CREATE POLICY "Users manage own attendances" ON public.attendances
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS trg_attendances_updated ON public.attendances;
CREATE TRIGGER trg_attendances_updated BEFORE UPDATE ON public.attendances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- attendance_images ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES public.attendances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_images_attendance_id_idx ON public.attendance_images (attendance_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_images TO authenticated;
GRANT ALL ON public.attendance_images TO service_role;
ALTER TABLE public.attendance_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own attendance images" ON public.attendance_images;
CREATE POLICY "Users manage own attendance images" ON public.attendance_images
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- document_templates -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  process TEXT CHECK (process IS NULL OR process IN ('sepultamento','exumacao','ossario','translado','atualizacao_cadastral')),
  storage_path TEXT NOT NULL,
  placeholders TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_templates_user_id_idx ON public.document_templates (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT ALL ON public.document_templates TO service_role;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own templates" ON public.document_templates;
CREATE POLICY "Users manage own templates" ON public.document_templates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS trg_templates_updated ON public.document_templates;
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- generated_documents ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES public.attendances(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.document_templates(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS generated_documents_attendance_id_idx ON public.generated_documents (attendance_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_documents TO authenticated;
GRANT ALL ON public.generated_documents TO service_role;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own generated docs" ON public.generated_documents;
CREATE POLICY "Users manage own generated docs" ON public.generated_documents
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- 4. AUTH USER TRIGGER (auto-create profile)
-- =============================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 5. AGENDA & EXHUMATION APPOINTMENTS
-- =============================================================================

-- agenda_events ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attendance_id UUID REFERENCES public.attendances(id) ON DELETE CASCADE,
  agenda_type TEXT NOT NULL CHECK (agenda_type IN ('exumacao','velorio_sepultamento','exumacao_pss')),
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  deceased_name TEXT,
  responsible_name TEXT,
  registration_number TEXT,
  service TEXT,
  location TEXT,
  room TEXT,
  burial_time TIME,
  burial_location TEXT,
  funeral_home TEXT,
  family_present BOOLEAN,
  destination TEXT,
  result_status TEXT,
  payment_date DATE,
  pss_reference TEXT,
  status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado','confirmado','em_andamento','concluido','cancelado','pendente')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agenda_events_user_date_idx
  ON public.agenda_events (user_id, event_date, agenda_type);
CREATE INDEX IF NOT EXISTS agenda_events_attendance_idx
  ON public.agenda_events (attendance_id) WHERE attendance_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agenda_events_attendance_type_unique
  ON public.agenda_events (attendance_id, agenda_type) WHERE attendance_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_events TO authenticated;
GRANT ALL ON public.agenda_events TO service_role;
ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own agenda events" ON public.agenda_events;
CREATE POLICY "Users manage own agenda events" ON public.agenda_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS trg_agenda_events_updated ON public.agenda_events;
CREATE TRIGGER trg_agenda_events_updated BEFORE UPDATE ON public.agenda_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- exhumation_appointments ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exhumation_appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attendance_id UUID REFERENCES public.attendances(id) ON DELETE SET NULL,
  event_date DATE NOT NULL,
  time_slot TIME NOT NULL CHECK (time_slot IN ('08:30','09:00','09:30')),
  exhumation_phase TEXT NOT NULL CHECK (exhumation_phase IN ('exumacao','coleta_dna','reinumacao')),
  deceased_name TEXT,
  responsible_name TEXT,
  registration_number TEXT,
  location TEXT,
  room TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado','confirmado','em_andamento','concluido','cancelado','pendente')),
  pss_reference TEXT,
  destination TEXT,
  result_status TEXT,
  family_present BOOLEAN,
  payment_date DATE,
  funeral_home TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exhumation_appointments_user_date
  ON public.exhumation_appointments(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_exhumation_appointments_attendance
  ON public.exhumation_appointments(attendance_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_exhumation_appointments_slot
  ON public.exhumation_appointments(user_id, event_date, time_slot)
  WHERE status NOT IN ('cancelado');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exhumation_appointments TO authenticated;
GRANT ALL ON public.exhumation_appointments TO service_role;
ALTER TABLE public.exhumation_appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own exhumation appointments" ON public.exhumation_appointments;
CREATE POLICY "Users manage own exhumation appointments" ON public.exhumation_appointments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS set_exhumation_appointments_updated_at ON public.exhumation_appointments;
CREATE TRIGGER set_exhumation_appointments_updated_at
  BEFORE UPDATE ON public.exhumation_appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 6. FUNERAL DOCUMENT MODULE
-- =============================================================================

-- funeral_processes ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.funeral_processes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attendance_id UUID REFERENCES public.attendances(id) ON DELETE SET NULL,
  tipo_processo TEXT NOT NULL DEFAULT 'sepultamento',
  status TEXT NOT NULL DEFAULT 'em_analise',
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funeral_processes_user_id_idx ON public.funeral_processes(user_id);
CREATE INDEX IF NOT EXISTS funeral_processes_attendance_id_idx ON public.funeral_processes(attendance_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funeral_processes TO authenticated;
GRANT ALL ON public.funeral_processes TO service_role;
ALTER TABLE public.funeral_processes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own funeral_processes" ON public.funeral_processes;
CREATE POLICY "own funeral_processes" ON public.funeral_processes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS trg_funeral_processes_updated ON public.funeral_processes;
CREATE TRIGGER trg_funeral_processes_updated BEFORE UPDATE ON public.funeral_processes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- funeral_deceased -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.funeral_deceased (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id UUID NOT NULL REFERENCES public.funeral_processes(id) ON DELETE CASCADE,
  papel TEXT NOT NULL DEFAULT 'principal',
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funeral_deceased_process_id_idx ON public.funeral_deceased(process_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funeral_deceased TO authenticated;
GRANT ALL ON public.funeral_deceased TO service_role;
ALTER TABLE public.funeral_deceased ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own funeral_deceased" ON public.funeral_deceased;
CREATE POLICY "own funeral_deceased" ON public.funeral_deceased
  FOR ALL USING (EXISTS (SELECT 1 FROM public.funeral_processes p WHERE p.id = process_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.funeral_processes p WHERE p.id = process_id AND p.user_id = auth.uid()));

-- funeral_documents ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.funeral_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id UUID NOT NULL REFERENCES public.funeral_processes(id) ON DELETE CASCADE,
  attendance_image_id UUID REFERENCES public.attendance_images(id) ON DELETE SET NULL,
  tipo_documento TEXT NOT NULL,
  classificacao_confianca NUMERIC(3,2) NOT NULL DEFAULT 0,
  dados_extraidos JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funeral_documents_process_id_idx ON public.funeral_documents(process_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funeral_documents TO authenticated;
GRANT ALL ON public.funeral_documents TO service_role;
ALTER TABLE public.funeral_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own funeral_documents" ON public.funeral_documents;
CREATE POLICY "own funeral_documents" ON public.funeral_documents
  FOR ALL USING (EXISTS (SELECT 1 FROM public.funeral_processes p WHERE p.id = process_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.funeral_processes p WHERE p.id = process_id AND p.user_id = auth.uid()));

-- funeral_discrepancies --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.funeral_discrepancies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id UUID NOT NULL REFERENCES public.funeral_processes(id) ON DELETE CASCADE,
  campo TEXT NOT NULL,
  valor_a TEXT,
  valor_b TEXT,
  doc_a_id UUID REFERENCES public.funeral_documents(id) ON DELETE SET NULL,
  doc_b_id UUID REFERENCES public.funeral_documents(id) ON DELETE SET NULL,
  confianca NUMERIC(3,2) NOT NULL DEFAULT 0,
  sugestao TEXT,
  valor_final TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  resolvido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolvido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funeral_discrepancies_process_id_idx ON public.funeral_discrepancies(process_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funeral_discrepancies TO authenticated;
GRANT ALL ON public.funeral_discrepancies TO service_role;
ALTER TABLE public.funeral_discrepancies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own funeral_discrepancies" ON public.funeral_discrepancies;
CREATE POLICY "own funeral_discrepancies" ON public.funeral_discrepancies
  FOR ALL USING (EXISTS (SELECT 1 FROM public.funeral_processes p WHERE p.id = process_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.funeral_processes p WHERE p.id = process_id AND p.user_id = auth.uid()));

-- funeral_field_feedback -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.funeral_field_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  process_id UUID REFERENCES public.funeral_processes(id) ON DELETE SET NULL,
  tipo_documento TEXT NOT NULL,
  campo TEXT NOT NULL,
  valor_extraido TEXT,
  valor_correto TEXT NOT NULL,
  coordenadas JSONB,
  modelo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funeral_field_feedback_user_id_idx ON public.funeral_field_feedback(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funeral_field_feedback TO authenticated;
GRANT ALL ON public.funeral_field_feedback TO service_role;
ALTER TABLE public.funeral_field_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own funeral_field_feedback" ON public.funeral_field_feedback;
CREATE POLICY "own funeral_field_feedback" ON public.funeral_field_feedback
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- funeral_audit_log ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.funeral_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  process_id UUID REFERENCES public.funeral_processes(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funeral_audit_log_user_id_idx ON public.funeral_audit_log(user_id);
CREATE INDEX IF NOT EXISTS funeral_audit_log_process_id_idx ON public.funeral_audit_log(process_id);
GRANT SELECT, INSERT ON public.funeral_audit_log TO authenticated;
GRANT ALL ON public.funeral_audit_log TO service_role;
ALTER TABLE public.funeral_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own funeral_audit_log select" ON public.funeral_audit_log;
DROP POLICY IF EXISTS "own funeral_audit_log insert" ON public.funeral_audit_log;
CREATE POLICY "own funeral_audit_log select" ON public.funeral_audit_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own funeral_audit_log insert" ON public.funeral_audit_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- 7. EXTRACTION LOCKS + ATOMIC RPCs
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.extraction_locks (
  attendance_id UUID PRIMARY KEY REFERENCES public.attendances(id) ON DELETE CASCADE,
  execution_id  UUID NOT NULL DEFAULT gen_random_uuid(),
  status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','error')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  released_at   TIMESTAMPTZ,
  error_message TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extraction_locks TO authenticated;
GRANT ALL ON public.extraction_locks TO service_role;
ALTER TABLE public.extraction_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owners manage own extraction locks" ON public.extraction_locks;
CREATE POLICY "owners manage own extraction locks"
  ON public.extraction_locks
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.attendances a
    WHERE a.id = extraction_locks.attendance_id AND a.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.attendances a
    WHERE a.id = extraction_locks.attendance_id AND a.user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.try_acquire_extraction_lock(
  _attendance_id UUID,
  _ttl_seconds   INT DEFAULT 180
)
RETURNS TABLE (execution_id UUID, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_exec    UUID := gen_random_uuid();
  new_expires TIMESTAMPTZ := now() + make_interval(secs => _ttl_seconds);
  owner_ok    BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.attendances a
    WHERE a.id = _attendance_id AND a.user_id = auth.uid()
  ) INTO owner_ok;
  IF NOT owner_ok THEN
    RETURN;
  END IF;

  INSERT INTO public.extraction_locks (attendance_id, execution_id, status, started_at, expires_at)
  VALUES (_attendance_id, new_exec, 'running', now(), new_expires)
  ON CONFLICT (attendance_id) DO UPDATE
    SET execution_id = EXCLUDED.execution_id,
        status       = 'running',
        started_at   = now(),
        expires_at   = EXCLUDED.expires_at,
        released_at  = NULL,
        error_message = NULL
    WHERE public.extraction_locks.status <> 'running'
       OR public.extraction_locks.expires_at < now()
  RETURNING public.extraction_locks.execution_id, public.extraction_locks.expires_at
  INTO execution_id, expires_at;

  IF execution_id IS NULL THEN
    RETURN;
  END IF;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_extraction_lock(
  _attendance_id UUID,
  _execution_id  UUID,
  _status        TEXT,
  _error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated INT;
BEGIN
  IF _status NOT IN ('done','error') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.extraction_locks
     SET status        = _status,
         released_at   = now(),
         error_message = _error_message
   WHERE attendance_id = _attendance_id
     AND execution_id  = _execution_id;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_extraction_lock(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_acquire_extraction_lock(UUID, INT) TO authenticated;
REVOKE ALL ON FUNCTION public.release_extraction_lock(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_extraction_lock(UUID, UUID, TEXT, TEXT) TO authenticated;

-- =============================================================================
-- 8. STORAGE RLS POLICIES (bucket contents scoped to owner via <user_id>/... prefix)
-- =============================================================================

-- attendance-images ------------------------------------------------------------
DROP POLICY IF EXISTS "Users read own attendance images"   ON storage.objects;
DROP POLICY IF EXISTS "Users insert own attendance images" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own attendance images" ON storage.objects;
CREATE POLICY "Users read own attendance images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users insert own attendance images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attendance-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own attendance images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'attendance-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- document-templates -----------------------------------------------------------
DROP POLICY IF EXISTS "Users read own templates"   ON storage.objects;
DROP POLICY IF EXISTS "Users insert own templates" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own templates" ON storage.objects;
DROP POLICY IF EXISTS "Users update own templates" ON storage.objects;
CREATE POLICY "Users read own templates" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'document-templates' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users insert own templates" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'document-templates' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own templates" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'document-templates' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own templates" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'document-templates' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'document-templates' AND (storage.foldername(name))[1] = auth.uid()::text);

-- generated-documents ----------------------------------------------------------
DROP POLICY IF EXISTS "Users read own generated docs"   ON storage.objects;
DROP POLICY IF EXISTS "Users insert own generated docs" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own generated docs" ON storage.objects;
CREATE POLICY "Users read own generated docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'generated-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users insert own generated docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'generated-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own generated docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'generated-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;

-- =============================================================================
-- END OF CONSOLIDATED SCHEMA
-- =============================================================================
