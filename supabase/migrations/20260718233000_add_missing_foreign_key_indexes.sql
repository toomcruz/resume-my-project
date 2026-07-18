-- Indexes required to cover foreign keys reported by the Supabase database linter.
-- Applied to external project geprepccebxpdbhokuyl.

CREATE INDEX IF NOT EXISTS attendance_images_user_id_idx
  ON public.attendance_images(user_id);

CREATE INDEX IF NOT EXISTS funeral_discrepancies_doc_a_id_idx
  ON public.funeral_discrepancies(doc_a_id);

CREATE INDEX IF NOT EXISTS funeral_discrepancies_doc_b_id_idx
  ON public.funeral_discrepancies(doc_b_id);

CREATE INDEX IF NOT EXISTS funeral_discrepancies_resolvido_por_idx
  ON public.funeral_discrepancies(resolvido_por);

CREATE INDEX IF NOT EXISTS funeral_documents_attendance_image_id_idx
  ON public.funeral_documents(attendance_image_id);

CREATE INDEX IF NOT EXISTS funeral_field_feedback_process_id_idx
  ON public.funeral_field_feedback(process_id);

CREATE INDEX IF NOT EXISTS generated_documents_template_id_idx
  ON public.generated_documents(template_id);

CREATE INDEX IF NOT EXISTS generated_documents_user_id_idx
  ON public.generated_documents(user_id);
