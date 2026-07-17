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
CREATE UNIQUE INDEX uq_exhumation_appointments_slot
  ON public.exhumation_appointments(user_id, event_date, time_slot)
  WHERE status NOT IN ('cancelado');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exhumation_appointments TO authenticated;
GRANT ALL ON public.exhumation_appointments TO service_role;

ALTER TABLE public.exhumation_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own exhumation appointments"
  ON public.exhumation_appointments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_exhumation_appointments_updated_at
  BEFORE UPDATE ON public.exhumation_appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();