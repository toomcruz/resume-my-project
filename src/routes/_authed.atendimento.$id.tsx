import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  canStartAutoExtract,
  computeExtractedSignature,
  decidePollInterval,
  EXTRACT_LOCK_TTL_MS,
  mergeFieldsPreservingEdits,
} from "@/lib/attendance-runtime";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, FileDown, FileText, Loader2, Sparkles, Trash2 } from "lucide-react";
import { getProcess } from "@/lib/processes";
import { getErrorMessage } from "@/lib/error-message";
import { extractAttendanceData, generateDocument, getSignedUrl } from "@/lib/attendances.functions";
import { extractAttendanceVision } from "@/lib/vision/extract-attendance.functions";
import { flattenVisionState } from "@/lib/vision/flatten-vision";
import type { VisionState } from "@/lib/vision/attendance-vision-store";
import type { FlatFieldMeta } from "@/lib/vision/flatten-vision";
import { computeReviewSummary } from "@/lib/vision/review-status";
import { getCriticalFieldKeys } from "@/lib/domain/critical-fields";
import { isTemplateApplicable } from "@/lib/official-templates";
import { DocumentReview } from "@/components/document-review";
import type { FieldConflict } from "@/lib/domain/vision/types";
import {
  buildTriagemOverrides,
  TRIAGEM_SEPULTAMENTO_REVIEW_KEYS,
} from "@/lib/triagem-sepultamento";

export const Route = createFileRoute("/_authed/atendimento/$id")({
  component: AttendanceDetail,
});

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  extracting: "Extraindo dados",
  reviewing: "Em revisão",
  done: "Concluído",
  error: "Erro",
};

const SUBPROCESS_LABELS: Record<string, string> = {
  jazigo: "Sepultamento em jazigo",
  quadra_geral: "Sepultamento em quadra geral",
};

function buildPersistedExtractedData(
  source: unknown,
  fields: Record<string, string>,
  meta: Record<string, FlatFieldMeta>,
): Record<string, unknown> {
  const preservedMetadata: Record<string, unknown> = {};
  if (source && typeof source === "object") {
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (key.startsWith("_")) preservedMetadata[key] = value;
    }
  }
  return { ...preservedMetadata, ...fields, _visionMeta: meta };
}

function AttendanceDetail() {
  const { id } = useParams({ from: "/_authed/atendimento/$id" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const extractFn = useServerFn(extractAttendanceData);
  const extractVisionFn = useServerFn(extractAttendanceVision);
  const generateFn = useServerFn(generateDocument);
  const signFn = useServerFn(getSignedUrl);

  // Polling controlado: 5s enquanto extrai, cortado imediatamente ao chegar
  // em qualquer status terminal, com timeout máximo de 120s.
  const pollStartRef = useRef<number | null>(null);
  const [extractTimedOut, setExtractTimedOut] = useState(false);

  const { data: att, isLoading } = useQuery({
    queryKey: ["attendance", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendances").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)?.status;
      const decision = decidePollInterval({
        status,
        startedAt: pollStartRef.current,
        now: Date.now(),
      });
      pollStartRef.current = decision.startedAt;
      if (decision.timedOut && !extractTimedOut) {
        // agendar toggle fora do callback do react-query
        queueMicrotask(() => setExtractTimedOut(true));
      }
      return decision.interval;
    },
  });

  useEffect(() => {
    if (!extractTimedOut) return;
    toast.error(
      "A extração demorou além do esperado. Verifique as imagens e use Re-extrair se necessário.",
    );
  }, [extractTimedOut]);

  const { data: images } = useQuery({
    queryKey: ["attendance-images", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_images")
        .select("id, storage_path, original_name")
        .eq("attendance_id", id);
      if (error) throw error;
      return data;
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["templates", att?.process, att?.subprocess],
    enabled: !!att?.process,
    // process/subprocess mudam raramente para o mesmo atendimento; mantém
    // fresco por 5 minutos para evitar refetches disparados pelo polling.
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates")
        .select("id, name, process, placeholders, storage_path")
        .or(`process.eq.${att!.process},process.is.null`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: generated } = useQuery({
    queryKey: ["generated", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_documents")
        .select("id, name, storage_path, created_at, template_id")
        .eq("attendance_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const triagemFields = useMemo<Record<string, string>>(() => {
    if (att?.process !== "sepultamento") return {};
    const details = (att.subprocess_details as Record<string, string>) ?? {};
    return buildTriagemOverrides({
      subprocess: att.subprocess ?? undefined,
      data_agendada: details.data_agendada,
      hora_sepultamento: details.hora_sepultamento,
      tem_velorio: (details.tem_velorio as "SIM" | "NAO" | "") || "",
      sala_velorio: details.sala_velorio,
      inicio_velorio: details.inicio_velorio,
      fim_velorio: details.fim_velorio,
      local_sepultamento: details.local_sepultamento,
      funeraria: details.funeraria,
      sem_velorio: (details.sem_velorio as "SIM" | "") || "",
      placa_identificacao: details.placa_identificacao,
      placa_confirmada: (details.placa_confirmada as "SIM" | "") || "",
    });
  }, [att?.process, att?.subprocess, att?.subprocess_details]);

  // Preserva edições manuais e só reprocessa `extracted_data` quando há
  // uma nova versão real da extração (assinatura diferente) ou quando o
  // atendimento selecionado muda.
  const userEditedKeysRef = useRef<Set<string>>(new Set());
  const lastExtractionSignatureRef = useRef<string>("");
  const lastAttendanceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastAttendanceIdRef.current !== id) {
      userEditedKeysRef.current = new Set();
      lastExtractionSignatureRef.current = "";
      lastAttendanceIdRef.current = id;
    }
  }, [id]);

  useEffect(() => {
    if (!att?.extracted_data) return;
    const raw = att.extracted_data as Record<string, unknown>;
    const signature = computeExtractedSignature(raw);
    const isNewExtraction = signature !== lastExtractionSignatureRef.current;
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith("_")) continue;
      if (typeof v === "string") flat[k] = v;
    }
    setFields((current) => {
      if (!isNewExtraction && Object.keys(current).length > 0) {
        // Sem nova versão de extração: apenas reaplica overrides derivados
        // (triagem) sem sobrescrever edições do usuário.
        return { ...current, ...triagemFields };
      }
      lastExtractionSignatureRef.current = signature;
      return mergeFieldsPreservingEdits({
        incoming: flat,
        current,
        userEditedKeys: userEditedKeysRef.current,
        overrides: triagemFields,
      });
    });
  }, [att?.extracted_data, triagemFields, id]);

  const handleFieldsChange = useCallback(
    (updater: React.SetStateAction<Record<string, string>>) => {
      setFields((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        for (const [key, value] of Object.entries(next)) {
          if (prev[key] !== value) userEditedKeysRef.current.add(key);
        }
        for (const key of Object.keys(prev)) {
          if (!(key in next)) userEditedKeysRef.current.add(key);
        }
        return next;
      });
    },
    [],
  );


  // Metadados de confiança/conflito derivados do estado de visão salvo.
  const fieldMeta = useMemo<Record<string, FlatFieldMeta>>(() => {
    try {
      const raw = att?.extracted_data as Record<string, unknown> | undefined;
      if (!raw || typeof raw !== "object") return {};
      const savedMeta = raw._visionMeta as Record<string, FlatFieldMeta> | undefined;
      if (savedMeta && typeof savedMeta === "object") return savedMeta;
      const state = raw._vision as VisionState | undefined;
      if (!state || typeof state !== "object") return {};
      return flattenVisionState(state).meta;
    } catch (err) {
      console.error("[atendimento] fieldMeta derivation failed:", err);
      return {};
    }
  }, [att?.extracted_data]);

  // Conflitos originais do pipeline de visão para exibir opções ao usuário.
  const visionConflicts = useMemo<FieldConflict[]>(() => {
    try {
      const raw = att?.extracted_data as Record<string, unknown> | undefined;
      const state = raw?._vision as VisionState | undefined;
      const list = state?.conflicts;
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }, [att?.extracted_data]);

  // Confirmações locais de "usar valor atual" (baixa confiança → normal).
  const [confirmedOverrides, setConfirmedOverrides] = useState<Set<string>>(new Set());

  const effectiveMeta = useMemo<Record<string, FlatFieldMeta>>(() => {
    if (confirmedOverrides.size === 0) return fieldMeta;
    const out: Record<string, FlatFieldMeta> = { ...fieldMeta };
    for (const key of confirmedOverrides) {
      const base = out[key];
      out[key] = base
        ? { ...base, confirmedByUser: true, confidence: 1 }
        : { key, value: fields[key] ?? "", confidence: 1, confirmedByUser: true };
    }
    return out;
  }, [fieldMeta, confirmedOverrides, fields]);

  const applicableTemplates = useMemo(() => {
    if (!att) return [];
    return (templates ?? []).filter((template) =>
      isTemplateApplicable(template, {
        process: att.process,
        subprocess: att.subprocess,
        subprocessDetails: (att.subprocess_details as Record<string, unknown>) ?? {},
        extractedData: (att.extracted_data as Record<string, unknown>) ?? {},
      }),
    );
  }, [att, templates]);

  const allFields = useMemo(() => {
    const fieldsSet = new Set<string>();
    for (const key of Object.keys(fields)) fieldsSet.add(key);
    for (const template of applicableTemplates) {
      for (const placeholder of (template.placeholders as string[]) ?? []) {
        fieldsSet.add(placeholder);
      }
    }
    return Array.from(fieldsSet).sort();
  }, [fields, applicableTemplates]);

  const reviewFields = useMemo(
    () =>
      att?.process === "sepultamento"
        ? allFields.filter((key) => !TRIAGEM_SEPULTAMENTO_REVIEW_KEYS.has(key))
        : allFields,
    [allFields, att?.process],
  );

  const criticalKeys = useMemo(
    () => getCriticalFieldKeys(applicableTemplates),
    [applicableTemplates],
  );

  const reviewSummary = useMemo(
    () =>
      computeReviewSummary({
        keys: reviewFields,
        fields,
        meta: effectiveMeta,
        criticalKeys,
      }),
    [reviewFields, fields, effectiveMeta, criticalKeys],
  );

  async function triggerExtract(autoGenerate = false) {
    setExtracting(true);
    try {
      // Novo pipeline (extração por imagem, consolidação, validações).
      let extracted: Record<string, string> = {};
      let usedFallback = false;
      try {
        const visionResult = await extractVisionFn({ data: { attendanceId: id } });
        extracted = (visionResult?.data ?? {}) as Record<string, string>;
      } catch (visionError: unknown) {
        // Fallback automático: extrator legado.
        usedFallback = true;
        console.warn("[vision] fallback ativado:", getErrorMessage(visionError, ""));
        const legacy = await extractFn({ data: { attendanceId: id } });
        extracted = (legacy?.data ?? {}) as Record<string, string>;
      }
      await qc.invalidateQueries({ queryKey: ["attendance", id] });
      toast.success(usedFallback ? "Dados extraídos (modo legado)" : "Dados extraídos");
      const consolidated = { ...extracted, ...triagemFields };
      setFields(consolidated);
      if (autoGenerate && att) {
        const applicable = (templates ?? []).filter((template) =>
          isTemplateApplicable(template, {
            process: att.process,
            subprocess: att.subprocess,
            subprocessDetails: (att.subprocess_details as Record<string, unknown>) ?? {},
            extractedData: consolidated,
          }),
        );
        if (applicable.length) {
          for (const template of applicable) {
            setGeneratingId(template.id);
            try {
              await generateFn({ data: { attendanceId: id, templateId: template.id } });
            } catch (error: unknown) {
              toast.error(`${template.name}: ${getErrorMessage(error, "Falha ao gerar")}`);
            }
          }
          setGeneratingId(null);
          await supabase.from("attendances").update({ status: "done" }).eq("id", id);
          await qc.invalidateQueries({ queryKey: ["generated", id] });
          await qc.invalidateQueries({ queryKey: ["attendance", id] });
          toast.success("Pacote gerado");
        }
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Falha na extração");
      toast.error(message);
      // Garante que o status nunca fique preso em "extracting" após
      // qualquer falha (Gemini, geração de documento, storage…).
      try {
        await supabase.from("attendances").update({ status: "error" }).eq("id", id);
        await qc.invalidateQueries({ queryKey: ["attendance", id] });
      } catch (persistError) {
        console.error("[atendimento] falha ao registrar status=error:", persistError);
      }
    } finally {
      setExtracting(false);
    }
  }

  // Proteção em 2 camadas contra disparos duplicados da extração:
  //   1) `autoExtractRef` — evita re-disparo durante a mesma montagem.
  //   2) `sessionStorage` — evita re-disparo entre remounts/tabs enquanto
  //      já existe uma extração ativa para o mesmo atendimento.
  const autoExtractRef = useRef(false);
  useEffect(() => {
    if (autoExtractRef.current) return;
    const status = att?.status;
    const hasData = Object.keys(att?.extracted_data ?? {}).length > 0;
    if (extractTimedOut) return;
    const lockKey = `attendance:extract-lock:${id}`;
    let lockTimestamp: number | null = null;
    try {
      const raw = sessionStorage.getItem(lockKey);
      if (raw) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) lockTimestamp = parsed;
      }
    } catch {
      // sessionStorage indisponível — segue apenas com o guard local.
    }
    const now = Date.now();
    const canStart = canStartAutoExtract({
      status,
      hasExtractedData: hasData,
      extracting,
      lockTimestamp,
      now,
    });
    if (!canStart) return;
    try {
      sessionStorage.setItem(lockKey, String(now));
    } catch {
      // ignora
    }
    autoExtractRef.current = true;
    triggerExtract(true).finally(() => {
      try {
        const stored = sessionStorage.getItem(lockKey);
        if (stored && Number(stored) === now) sessionStorage.removeItem(lockKey);
      } catch {
        // ignora
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [att?.status, att?.extracted_data, id, extractTimedOut]);

  // Garante liberação do lock persistente ao desmontar caso a extração
  // ainda estivesse em andamento (evita "lock preso" após 5 min de TTL).
  useEffect(() => {
    const lockKey = `attendance:extract-lock:${id}`;
    return () => {
      try {
        const raw = sessionStorage.getItem(lockKey);
        if (!raw) return;
        const ts = Number(raw);
        if (Number.isFinite(ts) && Date.now() - ts >= EXTRACT_LOCK_TTL_MS) {
          sessionStorage.removeItem(lockKey);
        }
      } catch {
        // ignora
      }
    };
  }, [id]);

  async function saveFields() {
    setSaving(true);
    const { error } = await supabase
      .from("attendances")
      .update({
        extracted_data: buildPersistedExtractedData(
          att?.extracted_data,
          fields,
          effectiveMeta,
        ) as never,
        status: "reviewing",
      })
      .eq("id", id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Dados salvos");
    qc.invalidateQueries({ queryKey: ["attendance", id] });
  }

  function assertCanGenerate() {
    if (reviewSummary.blockingKeys.length > 0) {
      toast.error(
        `Corrija os campos críticos antes de gerar: ${reviewSummary.blockingKeys.join(", ")}`,
      );
      return false;
    }
    return true;
  }

  async function handleGenerate(templateId: string) {
    if (!assertCanGenerate()) return;
    await supabase
      .from("attendances")
      .update({
        extracted_data: buildPersistedExtractedData(
          att?.extracted_data,
          fields,
          effectiveMeta,
        ) as never,
      })
      .eq("id", id);
    setGeneratingId(templateId);
    try {
      await generateFn({ data: { attendanceId: id, templateId } });
      toast.success("Documento gerado");
      qc.invalidateQueries({ queryKey: ["generated", id] });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Falha ao gerar"));
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleGenerateAll() {
    if (!applicableTemplates.length) {
      return toast.error("Nenhum modelo aplicável a este atendimento.");
    }
    if (!assertCanGenerate()) return;
    await supabase
      .from("attendances")
      .update({
        extracted_data: buildPersistedExtractedData(
          att?.extracted_data,
          fields,
          effectiveMeta,
        ) as never,
      })
      .eq("id", id);
    for (const template of applicableTemplates) {
      setGeneratingId(template.id);
      try {
        await generateFn({ data: { attendanceId: id, templateId: template.id } });
      } catch (error: unknown) {
        toast.error(`${template.name}: ${getErrorMessage(error, "Falha ao gerar")}`);
      }
    }
    setGeneratingId(null);
    await supabase.from("attendances").update({ status: "done" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["generated", id] });
    qc.invalidateQueries({ queryKey: ["attendance", id] });
    toast.success("Pacote gerado");
  }

  async function download(bucket: string, path: string, filename?: string) {
    try {
      // Nome amigável (com extensão .docx) para forçar Content-Disposition
      // e evitar que o navegador abra o arquivo em visualizadores in-browser
      // (Chrome/Google Docs preview) que renderizam a fonte pequena e distorcem
      // o layout do modelo oficial.
      const suggested = filename
        ? `${filename.replace(/[^\w.-]+/g, "_")}.docx`
        : (path.split("/").pop() ?? "documento.docx");
      const { url } = await signFn({ data: { bucket, path, filename: suggested } });
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = suggested;
      anchor.rel = "noopener";
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Falha ao baixar documento"));
    }
  }


  async function deleteAttendance() {
    if (!confirm("Excluir este atendimento e todos os documentos?")) return;
    await supabase.from("attendances").delete().eq("id", id);
    toast.success("Atendimento excluído");
    navigate({ to: "/dashboard" });
  }

  if (isLoading || !att) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const proc = getProcess(att.process);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate({ to: "/dashboard" })}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> Voltar
          </button>
          <h1 className="text-2xl font-semibold tracking-tight mt-2">
            {proc?.label ?? att.process}
          </h1>
          <div className="text-sm text-muted-foreground">
            {att.subprocess ? (
              <Badge variant="outline" className="mr-2">
                {SUBPROCESS_LABELS[att.subprocess] ?? att.subprocess.replace(/_/g, " ")}
              </Badge>
            ) : null}
            Status:{" "}
            <span className="font-medium">
              {ATTENDANCE_STATUS_LABELS[att.status] ?? att.status}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={deleteAttendance}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid lg:grid-cols-[1fr,320px] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>Revisão do documento</CardTitle>
                <CardDescription>
                  Confirme apenas o que estiver em destaque — o restante já foi conferido.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => triggerExtract(false)}
                  disabled={extracting}
                  className="gap-2"
                >
                  {extracting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Re-extrair
                </Button>
                <Button size="sm" onClick={saveFields} disabled={saving}>
                  {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />} Salvar revisão
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {att.process === "sepultamento" && Object.keys(triagemFields).length > 0 && (
                <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                  <p className="text-sm font-medium">Dados da triagem já aplicados</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Modalidade, data, horário, sala, placa e demais dados operacionais não precisam
                    ser preenchidos novamente nesta tela.
                  </p>
                </div>
              )}
              {extracting && !Object.keys(fields).length && (
                <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Analisando imagens com IA…
                </div>
              )}
              {allFields.length === 0 && !extracting ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum dado ainda. Instale os modelos oficiais ou adicione modelos com
                  placeholders {"{campo}"} em{" "}
                  <a className="underline" href="/modelos">
                    Modelos
                  </a>
                  , depois clique em Re-extrair.
                </p>
              ) : (
                <DocumentReview
                  keys={reviewFields}
                  fields={fields}
                  meta={effectiveMeta}
                  statuses={reviewSummary.statuses}
                  summary={reviewSummary}
                  conflicts={visionConflicts}
                  criticalKeys={criticalKeys}
                  onFieldsChange={setFields}
                  onConfirmField={(key) =>
                    setConfirmedOverrides((prev) => {
                      const next = new Set(prev);
                      next.add(key);
                      return next;
                    })
                  }
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Documentos</CardTitle>
                <CardDescription>
                  Modelos aplicáveis ao processo e à modalidade escolhida.
                </CardDescription>
              </div>
              {!!applicableTemplates.length && (
                <Button
                  size="sm"
                  onClick={handleGenerateAll}
                  disabled={!!generatingId}
                  className="gap-2"
                >
                  <FileDown className="h-3 w-3" /> Gerar todos
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {!applicableTemplates.length && (
                <div className="text-sm text-muted-foreground">
                  Nenhum modelo aplicável. Instale os modelos oficiais em{" "}
                  <a className="underline" href="/modelos">
                    Modelos
                  </a>
                  .
                </div>
              )}
              {applicableTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between border rounded-md px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{template.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(template.placeholders as string[])?.length ?? 0} campos
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGenerate(template.id)}
                    disabled={generatingId === template.id}
                  >
                    {generatingId === template.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Gerar"
                    )}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {!!generated?.length && (
            <Card>
              <CardHeader>
                <CardTitle>Documentos gerados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {generated.map((document) => (
                  <div
                    key={document.id}
                    className="flex items-center justify-between border rounded-md px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{document.name}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        download("generated-documents", document.storage_path, document.name)
                      }

                      className="gap-1"
                    >
                      <FileDown className="h-3 w-3" /> Baixar
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Imagens ({images?.length ?? 0})</div>
          <div className="grid grid-cols-2 gap-2">
            {images?.map((image) => (
              <ImageThumb key={image.id} path={image.storage_path} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    supabase.storage
      .from("attendance-images")
      .createSignedUrl(path, 600)
      .then(({ data }) => {
        if (data?.signedUrl) setUrl(data.signedUrl);
      });
  }, [path]);
  return (
    <div className="aspect-square rounded-md overflow-hidden border bg-muted">
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  );
}
