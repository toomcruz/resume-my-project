import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROCESSES, getProcess, type ProcessExtraField } from "@/lib/processes";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CalendarDays, FileText, Loader2, Upload, X } from "lucide-react";
import type { AgendaType } from "@/lib/agenda";
import {
  burialRequiresPps,
  resolveAgendaType,
  shouldCreateAgendaEvent,
  validatePpsSchedule,
} from "@/lib/agenda-sync";
import { buildAttendanceContext } from "@/lib/domain/context-adapter";
import { getRequiredDocuments } from "@/lib/domain/documents";
import { getErrorMessage } from "@/lib/error-message";
import { TriagemSepultamento } from "@/components/triagem-sepultamento";
import { validateTriagemSepultamento } from "@/lib/triagem-sepultamento";

const TRIAGEM_SEPULTAMENTO_KEYS = new Set([
  "data_agendada",
  "hora_sepultamento",
  "sala_velorio",
  "inicio_velorio",
  "fim_velorio",
  "local_sepultamento",
  "funeraria",
]);

export const Route = createFileRoute("/_authed/atendimento/novo")({
  component: NewAttendance,
});

type Step = "process" | "details" | "upload";

const db = supabase;

function NewAttendance() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("process");
  const [processKey, setProcessKey] = useState<string>("");
  const [subprocess, setSubprocess] = useState<string>("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const proc = getProcess(processKey);
  const visibleExtraFields =
    proc?.extraFields?.filter(
      (field) => !field.showWhen || extras[field.showWhen.field] === field.showWhen.equals,
    ) ?? [];
  const isSepultamentoPps = processKey === "sepultamento" && burialRequiresPps(subprocess, extras);

  const previewedDocuments = (() => {
    if (!proc) return [];
    const ctx = buildAttendanceContext(proc.key, subprocess, extras);
    return ctx ? getRequiredDocuments(ctx) : [];
  })();

  function addFiles(list: FileList | null) {
    if (!list) return;
    const selected = Array.from(list).filter((file) => file.type.startsWith("image/"));
    setFiles((current) => [...current, ...selected].slice(0, 20));
  }

  function selectProcess(key: string) {
    setProcessKey(key);
    setSubprocess("");
    // Exumação escolhida como processo sempre usa a agenda normal.
    // PPS só é decidido dentro do Sepultamento em jazigo sem gaveta.
    setExtras(key === "exumacao" ? { tipo_agenda_exumacao: "exumacao" } : {});
    setStep("details");
  }

  function chooseExumacaoSubprocess(value: string) {
    setSubprocess(value);
    if (processKey === "exumacao") {
      setExtras((current) => ({
        ...current,
        tipo_agenda_exumacao: "exumacao",
      }));
    }
  }

  function updateExtra(name: string, value: string) {
    setExtras((current) => ({ ...current, [name]: value }));
  }

  function updateExtras(patch: Record<string, string>) {
    setExtras((current) => ({ ...current, ...patch }));
  }

  const isSepultamento = processKey === "sepultamento";

  function hasScheduleWithoutDate(): boolean {
    if (!proc || !["sepultamento", "exumacao"].includes(proc.key)) return false;
    if (proc.key === "sepultamento" && extras.tem_velorio !== "SIM" && !isSepultamentoPps) {
      return false;
    }
    const scheduleKeys =
      proc.key === "sepultamento"
        ? [
            "inicio_velorio",
            "fim_velorio",
            "sala_velorio",
            "local_sepultamento",
            "funeraria",
            "hora_exumacao_pps",
          ]
        : ["hora_agendamento", "referencia_pps", "referencia_pss"];
    return scheduleKeys.some((key) => extras[key]?.trim()) && !extras.data_agendada?.trim();
  }

  async function createLinkedAgendaEvents(attendanceId: string, userId: string): Promise<void> {
    if (!proc || !shouldCreateAgendaEvent(proc.key, extras)) return;
    const eventDate = extras.data_agendada!.trim();
    const rows: Array<Record<string, unknown>> = [];

    if (proc.key === "sepultamento") {
      if (extras.tem_velorio === "SIM") {
        rows.push({
          user_id: userId,
          attendance_id: attendanceId,
          agenda_type: "velorio_sepultamento" as AgendaType,
          event_date: eventDate,
          start_time: extras.inicio_velorio || extras.hora_sepultamento || null,
          end_time: extras.fim_velorio || null,
          service: "Velório + Sepultamento",
          location: extras.local_sepultamento || null,
          room: extras.sala_velorio || null,
          burial_time: extras.hora_sepultamento || null,
          burial_location: extras.local_sepultamento || null,
          funeral_home: extras.funeraria || null,
          pss_reference: null,
          status: "agendado",
          notes: notes || null,
        });
      }
      if (isSepultamentoPps) {
        rows.push({
          user_id: userId,
          attendance_id: attendanceId,
          agenda_type: "exumacao_pss" as AgendaType,
          event_date: eventDate,
          start_time: extras.hora_exumacao_pps || null,
          end_time: null,
          service: "Exumação PPS para Pronto Sepultamento",
          location: extras.local_sepultamento || null,
          room: null,
          burial_time: extras.hora_sepultamento || null,
          burial_location: extras.local_sepultamento || null,
          funeral_home: extras.funeraria || null,
          pss_reference: extras.referencia_pps || extras.referencia_pss || null,
          status: "agendado",
          notes: notes || null,
        });
      }
    } else {
      const agendaType = resolveAgendaType(proc.key, extras.tipo_agenda_exumacao);
      if (!agendaType) return;
      rows.push({
        user_id: userId,
        attendance_id: attendanceId,
        agenda_type: agendaType,
        event_date: eventDate,
        start_time: extras.hora_agendamento || null,
        end_time: null,
        service: proc.label,
        location: extras.localizacao || null,
        room: null,
        burial_time: null,
        burial_location: null,
        funeral_home: null,
        pss_reference: null,
        status: "agendado",
        notes: notes || null,
      });
    }

    if (!rows.length) return;
    const { error } = await db.from("agenda_events").insert(rows);
    if (error) throw new Error(`Atendimento criado, mas a agenda não foi salva: ${error.message}`);
  }

  async function submit() {
    if (!proc) return;
    if (!files.length) return toast.error("Envie pelo menos uma imagem");
    if (hasScheduleWithoutDate()) {
      return toast.error("Informe a data para adicionar este atendimento à agenda.");
    }
    const ppsErrors = validatePpsSchedule({
      processKey: proc.key,
      subprocess,
      tipoAgendaExumacao: extras.tipo_agenda_exumacao,
      jazigoPossuiGavetaDisponivel: extras.jazigo_possui_gaveta_disponivel,
      data_agendada: extras.data_agendada,
      hora_agendamento: isSepultamentoPps ? extras.hora_exumacao_pps : extras.hora_agendamento,
    });
    if (ppsErrors.length) return toast.error(ppsErrors[0]);

    setSubmitting(true);
    try {
      const { data: userResult } = await supabase.auth.getUser();
      const userId = userResult.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      const { data: attendance, error: attendanceError } = await supabase
        .from("attendances")
        .insert({
          user_id: userId,
          process: proc.key,
          subprocess: subprocess || null,
          subprocess_details: extras,
          notes: notes || null,
          status: "extracting",
        })
        .select("id")
        .single();
      if (attendanceError) throw attendanceError;

      for (const file of files) {
        const dotIdx = file.name.lastIndexOf(".");
        const rawExt = dotIdx > 0 ? file.name.slice(dotIdx + 1).toLowerCase() : "";
        const extension = rawExt || (file.type.split("/")[1] ?? "bin");
        const path = `${userId}/${attendance.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("attendance-images")
          .upload(path, file, { contentType: file.type });
        if (uploadError) throw uploadError;

        const { error: rowError } = await supabase.from("attendance_images").insert({
          attendance_id: attendance.id,
          user_id: userId,
          storage_path: path,
          original_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        });
        if (rowError) throw rowError;
      }

      await createLinkedAgendaEvents(attendance.id, userId);
      navigate({ to: "/atendimento/$id", params: { id: attendance.id } });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao criar atendimento"));
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => navigate({ to: "/dashboard" })}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Voltar
        </button>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Novo atendimento</h1>
      </div>

      <Stepper current={step} />

      {step === "process" && (
        <Card>
          <CardHeader>
            <CardTitle>Qual o processo?</CardTitle>
            <CardDescription>Escolha o tipo de atendimento.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3">
            {PROCESSES.map((process) => (
              <button
                key={process.key}
                onClick={() => selectProcess(process.key)}
                className={cn(
                  "text-left p-4 rounded-lg border transition-colors hover:border-primary hover:bg-accent/50",
                  processKey === process.key && "border-primary bg-accent/50",
                )}
              >
                <div className="font-medium">{process.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{process.description}</div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {step === "details" && proc && (
        <Card>
          <CardHeader>
            <CardTitle>{proc.label}</CardTitle>
            <CardDescription>
              Defina os detalhes do atendimento. Os campos de velório só aparecem quando
              necessários.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isSepultamento ? (
              <TriagemSepultamento
                subprocess={subprocess}
                extras={extras}
                onSubprocessChange={setSubprocess}
                onExtrasChange={updateExtras}
              />
            ) : (
              proc.subprocessOptions && (
                <div className="space-y-2">
                  <Label>{proc.subprocessLabel}</Label>
                  <div className="grid sm:grid-cols-3 gap-2">
                    {proc.subprocessOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => chooseExumacaoSubprocess(option.value)}
                        className={cn(
                          "p-3 rounded-md border text-sm text-center transition-colors hover:border-primary",
                          subprocess === option.value && "border-primary bg-accent",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}

            <ExtraFields
              fields={
                isSepultamento
                  ? visibleExtraFields.filter((field) => !TRIAGEM_SEPULTAMENTO_KEYS.has(field.name))
                  : visibleExtraFields
              }
              values={extras}
              onChange={updateExtra}
            />

            {previewedDocuments.length > 0 && (
              <div className="rounded-md border bg-muted/25 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Documentos previstos para este atendimento
                </div>
                <ul className="space-y-1 text-sm">
                  {previewedDocuments.map((doc) => (
                    <li key={doc.slug} className="flex flex-col">
                      <span className="font-medium">{doc.slug}</span>
                      <span className="text-xs text-muted-foreground">{doc.reason}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Lista preliminar — pode mudar após a IA processar as imagens.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Observações (opcional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
              />
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("process")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button
                onClick={() => {
                  if (isSepultamento) {
                    const errs = validateTriagemSepultamento({
                      subprocess,
                      data_agendada: extras.data_agendada,
                      hora_sepultamento: extras.hora_sepultamento,
                      tem_velorio: (extras.tem_velorio as "SIM" | "NAO" | "") || "",
                      sala_velorio: extras.sala_velorio,
                      sem_velorio: (extras.sem_velorio as "SIM" | "") || "",
                    });
                    if (errs.length) return toast.error(errs[0]);
                  }
                  setStep("upload");
                }}
                disabled={!!proc.subprocessOptions && !subprocess}
              >
                Continuar <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Envie prints e fotos</CardTitle>
            <CardDescription>
              A IA extrai os dados do atendimento e atualiza a agenda quando houver vínculo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {proc && shouldCreateAgendaEvent(proc.key, extras) && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm flex items-start gap-2">
                <CalendarDays className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <div className="font-medium">Este atendimento será incluído na Agenda Geral</div>
                  <div className="text-muted-foreground">
                    {extras.data_agendada}
                    {processKey === "exumacao" && extras.tipo_agenda_exumacao === "exumacao_pss"
                      ? " · Exumação PSS"
                      : processKey === "exumacao"
                        ? " · Agenda de Exumação"
                        : " · Velório + Sepultamento"}
                  </div>
                </div>
              </div>
            )}

            <label
              htmlFor="files"
              className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer hover:border-primary transition-colors"
            >
              <Upload className="h-6 w-6 text-muted-foreground mb-2" />
              <span className="text-sm font-medium">Clique para escolher imagens</span>
              <span className="text-xs text-muted-foreground">PNG, JPG · até 20 arquivos</span>
              <input
                id="files"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => addFiles(event.target.files)}
              />
            </label>

            {files.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="relative group aspect-square rounded-md overflow-hidden border bg-muted"
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((_, position) => position !== index))}
                      className="absolute top-1 right-1 p-1 rounded-full bg-background/90 opacity-0 group-hover:opacity-100"
                      aria-label={`Remover ${file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("details")} disabled={submitting}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button onClick={submit} disabled={submitting || !files.length}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Enviar e extrair
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ExtraFields({
  fields,
  values,
  onChange,
}: {
  fields: ProcessExtraField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  let lastSection: string | undefined;

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const showSection = field.section && field.section !== lastSection;
        lastSection = field.section;
        return (
          <div key={field.name} className="space-y-4">
            {showSection && (
              <div className="flex items-center gap-2 border-t pt-5 first:border-t-0 first:pt-0">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">{field.section}</h3>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor={field.name}>{field.label}</Label>
              <ExtraFieldInput field={field} value={values[field.name] ?? ""} onChange={onChange} />
              {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExtraFieldInput({
  field,
  value,
  onChange,
}: {
  field: ProcessExtraField;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  if (field.type === "select") {
    return (
      <Select value={value} onValueChange={(next) => onChange(field.name, next)}>
        <SelectTrigger id={field.name}>
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          {field.options?.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === "textarea") {
    return (
      <Textarea
        id={field.name}
        value={value}
        placeholder={field.placeholder}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    );
  }

  return (
    <Input
      id={field.name}
      type={field.type}
      value={value}
      placeholder={field.placeholder}
      onChange={(event) => onChange(field.name, event.target.value)}
    />
  );
}

function Stepper({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "process", label: "Processo" },
    { key: "details", label: "Detalhes" },
    { key: "upload", label: "Imagens" },
  ];
  const index = steps.findIndex((step) => step.key === current);
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, position) => (
        <div key={step.key} className="flex items-center gap-2 flex-1">
          <div
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium border",
              position <= index
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground",
            )}
          >
            {position + 1}
          </div>
          <span
            className={cn("text-xs", position === index ? "font-medium" : "text-muted-foreground")}
          >
            {step.label}
          </span>
          {position < steps.length - 1 && <div className="flex-1 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}
