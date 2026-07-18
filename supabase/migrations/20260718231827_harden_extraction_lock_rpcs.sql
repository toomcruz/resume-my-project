-- Keep extraction-lock RPCs callable by authenticated users while enforcing ownership.

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
  bounded_ttl INT := LEAST(GREATEST(COALESCE(_ttl_seconds, 180), 30), 1800);
  new_expires TIMESTAMPTZ := now() + make_interval(secs => bounded_ttl);
  owner_ok BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.attendances a
    WHERE a.id = _attendance_id
      AND a.user_id = auth.uid()
  ) INTO owner_ok;

  IF NOT owner_ok THEN
    RETURN;
  END IF;

  INSERT INTO public.extraction_locks (
    attendance_id,
    execution_id,
    status,
    started_at,
    expires_at
  )
  VALUES (
    _attendance_id,
    new_exec,
    'running',
    now(),
    new_expires
  )
  ON CONFLICT (attendance_id) DO UPDATE
    SET execution_id = EXCLUDED.execution_id,
        status = 'running',
        started_at = now(),
        expires_at = EXCLUDED.expires_at,
        released_at = NULL,
        error_message = NULL
    WHERE public.extraction_locks.status <> 'running'
       OR public.extraction_locks.expires_at < now()
  RETURNING public.extraction_locks.execution_id,
            public.extraction_locks.expires_at
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
  IF _status NOT IN ('done', 'error') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  UPDATE public.extraction_locks l
     SET status = _status,
         released_at = now(),
         error_message = _error_message
   WHERE l.attendance_id = _attendance_id
     AND l.execution_id = _execution_id
     AND EXISTS (
       SELECT 1
       FROM public.attendances a
       WHERE a.id = _attendance_id
         AND a.user_id = auth.uid()
     );

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_extraction_lock(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.try_acquire_extraction_lock(UUID, INT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.release_extraction_lock(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_extraction_lock(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
