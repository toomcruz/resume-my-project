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

CREATE INDEX IF NOT EXISTS agenda_events_user_date_idx ON public.agenda_events (user_id, event_date, agenda_type);
CREATE INDEX IF NOT EXISTS agenda_events_attendance_idx ON public.agenda_events (attendance_id) WHERE attendance_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agenda_events_attendance_type_unique ON public.agenda_events (attendance_id, agenda_type) WHERE attendance_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_events TO authenticated;
GRANT ALL ON public.agenda_events TO service_role;

ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own agenda events" ON public.agenda_events;
CREATE POLICY "Users manage own agenda events"
  ON public.agenda_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_agenda_events_updated ON public.agenda_events;
CREATE TRIGGER trg_agenda_events_updated
  BEFORE UPDATE ON public.agenda_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();