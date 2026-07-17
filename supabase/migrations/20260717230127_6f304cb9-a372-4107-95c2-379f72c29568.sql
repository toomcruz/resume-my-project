-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.attendances (
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
CREATE INDEX ON public.attendances (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendances TO authenticated;
GRANT ALL ON public.attendances TO service_role;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own attendances" ON public.attendances FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.attendance_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES public.attendances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.attendance_images (attendance_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_images TO authenticated;
GRANT ALL ON public.attendance_images TO service_role;
ALTER TABLE public.attendance_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own attendance images" ON public.attendance_images FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  process TEXT CHECK (process IS NULL OR process IN ('sepultamento','exumacao','ossario','translado','atualizacao_cadastral')),
  storage_path TEXT NOT NULL,
  placeholders TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.document_templates (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT ALL ON public.document_templates TO service_role;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own templates" ON public.document_templates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.generated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES public.attendances(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.document_templates(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.generated_documents (attendance_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_documents TO authenticated;
GRANT ALL ON public.generated_documents TO service_role;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own generated docs" ON public.generated_documents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_attendances_updated BEFORE UPDATE ON public.attendances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON public.document_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE POLICY "Users read own attendance images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users insert own attendance images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attendance-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own attendance images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attendance-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own templates" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'document-templates' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users insert own templates" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'document-templates' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own templates" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'document-templates' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own templates" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'document-templates' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'document-templates' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own generated docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'generated-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users insert own generated docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'generated-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own generated docs" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'generated-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE TABLE public.agenda_events (
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
CREATE INDEX agenda_events_user_date_idx ON public.agenda_events (user_id, event_date, agenda_type);
CREATE INDEX agenda_events_attendance_idx ON public.agenda_events (attendance_id) WHERE attendance_id IS NOT NULL;
CREATE UNIQUE INDEX agenda_events_attendance_type_unique ON public.agenda_events (attendance_id, agenda_type) WHERE attendance_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_events TO authenticated;
GRANT ALL ON public.agenda_events TO service_role;
ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own agenda events" ON public.agenda_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_agenda_events_updated BEFORE UPDATE ON public.agenda_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.exhumation_appointments (
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
CREATE INDEX idx_exhumation_appointments_user_date ON public.exhumation_appointments(user_id, event_date);
CREATE INDEX idx_exhumation_appointments_attendance ON public.exhumation_appointments(attendance_id);
CREATE UNIQUE INDEX uq_exhumation_appointments_slot ON public.exhumation_appointments(user_id, event_date, time_slot) WHERE status NOT IN ('cancelado');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exhumation_appointments TO authenticated;
GRANT ALL ON public.exhumation_appointments TO service_role;
ALTER TABLE public.exhumation_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own exhumation appointments" ON public.exhumation_appointments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_exhumation_appointments_updated_at BEFORE UPDATE ON public.exhumation_appointments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();