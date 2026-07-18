
-- funeral_processes
CREATE TABLE public.funeral_processes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attendance_id UUID REFERENCES public.attendances(id) ON DELETE SET NULL,
  tipo_processo TEXT NOT NULL DEFAULT 'sepultamento',
  status TEXT NOT NULL DEFAULT 'em_analise',
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.funeral_processes(user_id);
CREATE INDEX ON public.funeral_processes(attendance_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funeral_processes TO authenticated;
GRANT ALL ON public.funeral_processes TO service_role;
ALTER TABLE public.funeral_processes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own funeral_processes" ON public.funeral_processes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_funeral_processes_updated BEFORE UPDATE ON public.funeral_processes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- funeral_deceased
CREATE TABLE public.funeral_deceased (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id UUID NOT NULL REFERENCES public.funeral_processes(id) ON DELETE CASCADE,
  papel TEXT NOT NULL DEFAULT 'principal',
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.funeral_deceased(process_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funeral_deceased TO authenticated;
GRANT ALL ON public.funeral_deceased TO service_role;
ALTER TABLE public.funeral_deceased ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own funeral_deceased" ON public.funeral_deceased
  FOR ALL USING (EXISTS (SELECT 1 FROM public.funeral_processes p WHERE p.id = process_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.funeral_processes p WHERE p.id = process_id AND p.user_id = auth.uid()));

-- funeral_documents
CREATE TABLE public.funeral_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  process_id UUID NOT NULL REFERENCES public.funeral_processes(id) ON DELETE CASCADE,
  attendance_image_id UUID REFERENCES public.attendance_images(id) ON DELETE SET NULL,
  tipo_documento TEXT NOT NULL,
  classificacao_confianca NUMERIC(3,2) NOT NULL DEFAULT 0,
  dados_extraidos JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.funeral_documents(process_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funeral_documents TO authenticated;
GRANT ALL ON public.funeral_documents TO service_role;
ALTER TABLE public.funeral_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own funeral_documents" ON public.funeral_documents
  FOR ALL USING (EXISTS (SELECT 1 FROM public.funeral_processes p WHERE p.id = process_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.funeral_processes p WHERE p.id = process_id AND p.user_id = auth.uid()));

-- funeral_discrepancies
CREATE TABLE public.funeral_discrepancies (
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
CREATE INDEX ON public.funeral_discrepancies(process_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funeral_discrepancies TO authenticated;
GRANT ALL ON public.funeral_discrepancies TO service_role;
ALTER TABLE public.funeral_discrepancies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own funeral_discrepancies" ON public.funeral_discrepancies
  FOR ALL USING (EXISTS (SELECT 1 FROM public.funeral_processes p WHERE p.id = process_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.funeral_processes p WHERE p.id = process_id AND p.user_id = auth.uid()));

-- funeral_field_feedback
CREATE TABLE public.funeral_field_feedback (
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
CREATE INDEX ON public.funeral_field_feedback(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funeral_field_feedback TO authenticated;
GRANT ALL ON public.funeral_field_feedback TO service_role;
ALTER TABLE public.funeral_field_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own funeral_field_feedback" ON public.funeral_field_feedback
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- funeral_audit_log (mascarado)
CREATE TABLE public.funeral_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  process_id UUID REFERENCES public.funeral_processes(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.funeral_audit_log(user_id);
CREATE INDEX ON public.funeral_audit_log(process_id);
GRANT SELECT, INSERT ON public.funeral_audit_log TO authenticated;
GRANT ALL ON public.funeral_audit_log TO service_role;
ALTER TABLE public.funeral_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own funeral_audit_log select" ON public.funeral_audit_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own funeral_audit_log insert" ON public.funeral_audit_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);
