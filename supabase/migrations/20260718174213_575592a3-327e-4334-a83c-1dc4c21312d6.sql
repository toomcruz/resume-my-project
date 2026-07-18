
-- Atomic per-attendance extraction lock
CREATE TABLE public.extraction_locks (
  attendance_id UUID PRIMARY KEY REFERENCES public.attendances(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','error')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  error_message TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extraction_locks TO authenticated;
GRANT ALL ON public.extraction_locks TO service_role;

ALTER TABLE public.extraction_locks ENABLE ROW LEVEL SECURITY;

-- Only owners of the attendance can see/manage their locks
CREATE POLICY "owners manage own extraction locks"
  ON public.extraction_locks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.attendances a
      WHERE a.id = extraction_locks.attendance_id
        AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.attendances a
      WHERE a.id = extraction_locks.attendance_id
        AND a.user_id = auth.uid()
    )
  );

-- Atomic acquire: returns the row if this caller won the lock, NULL otherwise.
-- Reclaims stale locks (expired or previously errored) atomically.
CREATE OR REPLACE FUNCTION public.try_acquire_extraction_lock(
  _attendance_id UUID,
  _ttl_seconds INT DEFAULT 180
)
RETURNS TABLE (execution_id UUID, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_exec UUID := gen_random_uuid();
  new_expires TIMESTAMPTZ := now() + make_interval(secs => _ttl_seconds);
  owner_ok BOOLEAN;
BEGIN
  -- Authorize: caller must own the attendance
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
        status = 'running',
        started_at = now(),
        expires_at = EXCLUDED.expires_at,
        released_at = NULL,
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
  _execution_id UUID,
  _status TEXT,
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
     SET status = _status,
         released_at = now(),
         error_message = _error_message
   WHERE attendance_id = _attendance_id
     AND execution_id = _execution_id;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_extraction_lock(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_acquire_extraction_lock(UUID, INT) TO authenticated;
REVOKE ALL ON FUNCTION public.release_extraction_lock(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_extraction_lock(UUID, UUID, TEXT, TEXT) TO authenticated;
