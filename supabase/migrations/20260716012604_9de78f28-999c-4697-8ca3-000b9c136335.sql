-- =========================================================================
-- Renomeia chaves antigas em attendances.extracted_data conforme o processo.
-- Idempotente: safe rerun. Só toca chaves que ainda são as antigas.
-- =========================================================================

CREATE OR REPLACE FUNCTION public._rename_extracted_key(
  data JSONB,
  from_key TEXT,
  to_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF data IS NULL OR jsonb_typeof(data) <> 'object' THEN
    RETURN data;
  END IF;
  IF NOT (data ? from_key) THEN
    RETURN data;
  END IF;
  IF data ? to_key THEN
    RETURN data - from_key;
  END IF;
  RETURN (data - from_key) || jsonb_build_object(to_key, data -> from_key);
END;
$$;

-- 1) inscricao_gs -> inscricao_gscemi (todos os processos).
UPDATE public.attendances
SET extracted_data = public._rename_extracted_key(extracted_data, 'inscricao_gs', 'inscricao_gscemi')
WHERE extracted_data ? 'inscricao_gs';

-- 2) Sepultamento: nome_falecido -> nome_falecido_sepultamento.
UPDATE public.attendances
SET extracted_data = public._rename_extracted_key(extracted_data, 'nome_falecido', 'nome_falecido_sepultamento')
WHERE process = 'sepultamento' AND extracted_data ? 'nome_falecido';

-- 3) Exumação: nome_falecido -> nome_falecido_exumacao.
UPDATE public.attendances
SET extracted_data = public._rename_extracted_key(extracted_data, 'nome_falecido', 'nome_falecido_exumacao')
WHERE process = 'exumacao' AND extracted_data ? 'nome_falecido';

-- 4) Sepultamento com contexto de jazigo: localizacao -> local_jazigo.
UPDATE public.attendances
SET extracted_data = public._rename_extracted_key(extracted_data, 'localizacao', 'local_jazigo')
WHERE process = 'sepultamento'
  AND extracted_data ? 'localizacao'
  AND COALESCE(subprocess_details->>'local_sepultamento_tipo', '') = 'jazigo';

-- 5) Sepultamento em quadra geral: localizacao -> local_sepultamento.
UPDATE public.attendances
SET extracted_data = public._rename_extracted_key(extracted_data, 'localizacao', 'local_sepultamento')
WHERE process = 'sepultamento'
  AND extracted_data ? 'localizacao'
  AND COALESCE(subprocess_details->>'local_sepultamento_tipo', '') = 'quadra_geral';

-- 6) Exumação: localizacao -> local_exumacao.
UPDATE public.attendances
SET extracted_data = public._rename_extracted_key(extracted_data, 'localizacao', 'local_exumacao')
WHERE process = 'exumacao' AND extracted_data ? 'localizacao';

DROP FUNCTION public._rename_extracted_key(JSONB, TEXT, TEXT);