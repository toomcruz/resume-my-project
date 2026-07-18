import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  AGENDA_STATUSES,
  AGENDA_TYPES,
  EXUMATION_DESTINATIONS,
  EXUMATION_RESULTS,
  emptyAgendaDraft,
  eventToDraft,
  formatAgendaDate,
  statusLabel,
  toNullable,
  trimTime,
  type AgendaEvent,
  type AgendaEventDraft,
  type AgendaStatus,
  type AgendaType,
} from "@/lib/agenda";
import { computeExhumationSlotUsage } from "@/lib/agenda-slots";
import {
  EXHUMATION_PHASES,
  EXHUMATION_TIME_SLOTS,
  deleteExhumationEvent,
  fetchExhumationEvents,
  insertExhumationEvent,
  isExhumationAgendaType,
  updateExhumationEvent,
  updateExhumationStatus,
} from "@/lib/agenda-exhumation";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { readArrivalFromImage, type ArrivalInfo } from "@/lib/vision/read-arrival.functions";
import { Camera } from "lucide-react";
import { useRef } from "react";


export const Route = createFileRoute("/_authed/agenda")({
  component: OperationalAgenda,
});

const db = supabase;

function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function shiftDate(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function OperationalAgenda() {
  const qc = useQueryClient();
  const [agendaType, setAgendaType] = useState<AgendaType>("exumacao");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState<"todos" | AgendaStatus>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgendaEventDraft>(() =>
    emptyAgendaDraft("exumacao", todayIso()),
  );
  const [saving, setSaving] = useState(false);

  const { data: events, isLoading } = useQuery({
    queryKey: ["agenda-events", agendaType, selectedDate],
    queryFn: async () => {
      if (agendaType === "exumacao" || agendaType === "exumacao_pss") {
        return fetchExhumationEvents(agendaType, selectedDate);
      }
      const { data, error } = await db
        .from("agenda_events")
        .select("*")
        .eq("agenda_type", agendaType)
        .eq("event_date", selectedDate)
        .order("start_time", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgendaEvent[];
    },
  });

  const filteredEvents = useMemo(
    () =>
      (events ?? []).filter((event) => statusFilter === "todos" || event.status === statusFilter),
    [events, statusFilter],
  );

  const counters = useMemo(() => {
    const list = events ?? [];
    return {
      total: list.length,
      pending: list.filter((event) => ["agendado", "pendente"].includes(event.status)).length,
      completed: list.filter((event) => event.status === "concluido").length,
    };
  }, [events]);

  const exhumationSlots = useMemo(
    () =>
      agendaType === "exumacao" || agendaType === "exumacao_pss"
        ? computeExhumationSlotUsage(events ?? [])
        : null,
    [events, agendaType],
  );

  function changeType(value: string) {
    const next = value as AgendaType;
    setAgendaType(next);
    setStatusFilter("todos");
    setDraft(emptyAgendaDraft(next, selectedDate));
  }

  function openNew() {
    setEditingId(null);
    setDraft(emptyAgendaDraft(agendaType, selectedDate));
    setDialogOpen(true);
  }

  function openEdit(event: AgendaEvent) {
    setEditingId(event.id);
    setDraft(eventToDraft(event));
    setDialogOpen(true);
  }

  function updateDraft<K extends keyof AgendaEventDraft>(key: K, value: AgendaEventDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveEvent() {
    if (!draft.event_date) return toast.error("Informe a data do agendamento.");
    if (!draft.deceased_name.trim()) return toast.error("Informe o nome da pessoa falecida.");
    const isExhumation = draft.agenda_type === "exumacao" || draft.agenda_type === "exumacao_pss";
    if (isExhumation && !draft.start_time) {
      return toast.error("Selecione um horário (08:30, 09:00 ou 09:30).");
    }
    if (isExhumation && !draft.service) {
      return toast.error("Selecione a fase da exumação.");
    }

    setSaving(true);
    try {
      const { data: userResult } = await supabase.auth.getUser();
      const userId = userResult.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      const familyPresent =
        draft.family_present === "sim" ? true : draft.family_present === "nao" ? false : null;

      if (isExhumation) {
        const payload = {
          user_id: userId,
          agenda_type: draft.agenda_type as "exumacao" | "exumacao_pss",
          event_date: draft.event_date,
          time_slot: draft.start_time,
          exhumation_phase: draft.service,
          deceased_name: toNullable(draft.deceased_name),
          responsible_name: toNullable(draft.responsible_name),
          registration_number: toNullable(draft.registration_number),
          location: toNullable(draft.location),
          room: toNullable(draft.room),
          funeral_home: toNullable(draft.funeral_home),
          family_present: familyPresent,
          destination: toNullable(draft.destination),
          result_status: toNullable(draft.result_status),
          payment_date: toNullable(draft.payment_date),
          pss_reference: toNullable(draft.pss_reference),
          status: draft.status,
          notes: toNullable(draft.notes),
        };
        if (editingId) {
          await updateExhumationEvent(editingId, payload);
          toast.success("Agendamento atualizado.");
        } else {
          await insertExhumationEvent(payload);
          toast.success("Agendamento criado.");
        }
      } else {
        const payload = {
          user_id: userId,
          agenda_type: draft.agenda_type,
          event_date: draft.event_date,
          start_time: toNullable(draft.start_time),
          end_time: toNullable(draft.end_time),
          deceased_name: toNullable(draft.deceased_name),
          responsible_name: toNullable(draft.responsible_name),
          registration_number: toNullable(draft.registration_number),
          service: toNullable(draft.service),
          location: toNullable(draft.location),
          room: toNullable(draft.room),
          burial_time: toNullable(draft.burial_time),
          burial_location: toNullable(draft.burial_location),
          funeral_home: toNullable(draft.funeral_home),
          family_present: familyPresent,
          destination: toNullable(draft.destination),
          result_status: toNullable(draft.result_status),
          payment_date: toNullable(draft.payment_date),
          pss_reference: toNullable(draft.pss_reference),
          status: draft.status,
          notes: toNullable(draft.notes),
          quadra_rua: toNullable(draft.quadra_rua),
          terreno: toNullable(draft.terreno),
          gaveta: toNullable(draft.gaveta),
          arrival_time: toNullable(draft.arrival_time),
          driver_name: toNullable(draft.driver_name),
          vehicle_plate: toNullable(draft.vehicle_plate),
        };

        if (editingId) {
          const { error } = await db.from("agenda_events").update(payload).eq("id", editingId);
          if (error) throw error;
          toast.success("Agendamento atualizado.");
        } else {
          const { error } = await db.from("agenda_events").insert(payload);
          if (error) throw error;
          toast.success("Agendamento criado.");
        }
      }

      setSelectedDate(draft.event_date);
      setAgendaType(draft.agenda_type);
      setDialogOpen(false);
      await qc.invalidateQueries({ queryKey: ["agenda-events"] });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Não foi possível salvar o agendamento."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(event: AgendaEvent) {
    if (!confirm(`Excluir o agendamento de ${event.deceased_name ?? "esta pessoa"}?`)) return;
    try {
      if (event.agenda_type === "exumacao" || event.agenda_type === "exumacao_pss") {
        await deleteExhumationEvent(event.id);
      } else {
        const { error } = await db.from("agenda_events").delete().eq("id", event.id);
        if (error) throw error;
      }
      toast.success("Agendamento excluído.");
      qc.invalidateQueries({ queryKey: ["agenda-events"] });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Não foi possível excluir."));
    }
  }

  async function quickStatus(event: AgendaEvent, status: AgendaStatus) {
    try {
      if (event.agenda_type === "exumacao" || event.agenda_type === "exumacao_pss") {
        await updateExhumationStatus(event.id, status);
      } else {
        const { error } = await db.from("agenda_events").update({ status }).eq("id", event.id);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["agenda-events"] });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Não foi possível atualizar."));
    }
  }

  const currentType = AGENDA_TYPES.find((item) => item.value === agendaType)!;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda operacional</h1>
          <p className="text-sm text-muted-foreground">
            Exumação, velório, sepultamento e PPS em um único módulo, sem criar cadastro de família.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Novo agendamento
        </Button>
      </div>

      <Tabs value={agendaType} onValueChange={changeType}>
        <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3">
          {AGENDA_TYPES.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="py-2.5">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{currentType.label}</CardTitle>
          <CardDescription>{currentType.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSelectedDate((date) => shiftDate(date, -1))}
                aria-label="Dia anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="w-auto"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSelectedDate((date) => shiftDate(date, 1))}
                aria-label="Próximo dia"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => setSelectedDate(todayIso())}>
                Hoje
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="status-filter" className="whitespace-nowrap text-sm">
                Situação
              </Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as "todos" | AgendaStatus)}
              >
                <SelectTrigger id="status-filter" className="w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {AGENDA_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="Agendamentos" value={counters.total} />
            <SummaryCard label="Pendentes" value={counters.pending} />
            <SummaryCard label="Concluídos" value={counters.completed} />
          </div>

          {exhumationSlots && (
            <div className="rounded-lg border bg-muted/25 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                Vagas do dia (segunda a sexta · 08:30 / 09:00 / 09:30)
              </div>
              <div className="grid grid-cols-3 gap-2">
                {exhumationSlots.map((slot) => (
                  <div
                    key={slot.slot}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm",
                      slot.occupied
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-emerald-300 bg-emerald-50 text-emerald-900",
                    )}
                  >
                    <div className="font-semibold">{slot.slot}</div>
                    <div className="text-xs">
                      {slot.occupied ? `Ocupado (${slot.events.length})` : "Livre"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-sm">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{formatAgendaDate(selectedDate)}</span>
        <span className="text-muted-foreground">
          · {filteredEvents.length} registro(s) exibido(s)
        </span>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando agenda…
          </CardContent>
        </Card>
      ) : filteredEvents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <div>
              <div className="font-medium">Nenhum agendamento neste dia</div>
              <div className="text-sm text-muted-foreground">
                Crie manualmente ou informe data e horário durante um atendimento.
              </div>
            </div>
            <Button variant="outline" onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((event) => (
            <AgendaEventCard
              key={event.id}
              event={event}
              onEdit={() => openEdit(event)}
              onDelete={() => deleteEvent(event)}
              onStatus={(status) => quickStatus(event, status)}
            />
          ))}
        </div>
      )}

      <AgendaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        editing={!!editingId}
        saving={saving}
        onChange={updateDraft}
        onSave={saveEvent}
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/25 px-3 py-3">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function statusClass(status: AgendaStatus): string {
  if (status === "concluido") return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
  if (status === "cancelado") return "bg-red-100 text-red-800 hover:bg-red-100";
  if (status === "pendente") return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  if (status === "em_andamento") return "bg-blue-100 text-blue-800 hover:bg-blue-100";
  return "";
}

function AgendaEventCard({
  event,
  onEdit,
  onDelete,
  onStatus,
}: {
  event: AgendaEvent;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (status: AgendaStatus) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{event.deceased_name ?? "Sem nome"}</span>
              <Badge className={statusClass(event.status)} variant="secondary">
                {statusLabel(event.status)}
              </Badge>
              {event.attendance_id && <Badge variant="outline">Vinculado ao atendimento</Badge>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                {trimTime(event.start_time) || "Horário não informado"}
                {event.end_time ? `–${trimTime(event.end_time)}` : ""}
              </span>
              {event.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {event.location}
                </span>
              )}
              {event.responsible_name && (
                <span className="inline-flex items-center gap-1">
                  <UserRound className="h-3.5 w-3.5" /> {event.responsible_name}
                </span>
              )}
            </div>
            <div className="grid gap-1 text-sm sm:grid-cols-2">
              {event.registration_number && (
                <div>
                  <span className="text-muted-foreground">Inscrição:</span>{" "}
                  {event.registration_number}
                </div>
              )}
              {event.room && (
                <div>
                  <span className="text-muted-foreground">Sala:</span> {event.room}
                </div>
              )}
              {event.burial_time && (
                <div>
                  <span className="text-muted-foreground">Sepultamento:</span>{" "}
                  {trimTime(event.burial_time)}
                </div>
              )}
              {event.destination && (
                <div>
                  <span className="text-muted-foreground">Destino:</span> {event.destination}
                </div>
              )}
              {event.result_status && (
                <div>
                  <span className="text-muted-foreground">Resultado:</span> {event.result_status}
                </div>
              )}
              {event.pss_reference && (
                <div>
                  <span className="text-muted-foreground">Referência PPS:</span>{" "}
                  {event.pss_reference}
                </div>
              )}
            </div>
            {event.notes && <p className="text-sm text-muted-foreground">{event.notes}</p>}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {event.status !== "concluido" && event.status !== "cancelado" && (
              <Button variant="outline" size="sm" onClick={() => onStatus("concluido")}>
                Concluir
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Editar">
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
              aria-label="Excluir"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgendaDialog({
  open,
  onOpenChange,
  draft,
  editing,
  saving,
  onChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: AgendaEventDraft;
  editing: boolean;
  saving: boolean;
  onChange: <K extends keyof AgendaEventDraft>(key: K, value: AgendaEventDraft[K]) => void;
  onSave: () => void;
}) {
  const exumation = draft.agenda_type === "exumacao" || draft.agenda_type === "exumacao_pss";
  const wake = draft.agenda_type === "velorio_sepultamento";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
          <DialogDescription>
            Os dados pertencem apenas a este registro de agenda e podem ser vinculados ao
            atendimento.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field label="Agenda">
            <Select
              value={draft.agenda_type}
              onValueChange={(value) => onChange("agenda_type", value as AgendaType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENDA_TYPES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Situação">
            <Select
              value={draft.status}
              onValueChange={(value) => onChange("status", value as AgendaStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENDA_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Data">
            <Input
              type="date"
              value={draft.event_date}
              onChange={(event) => onChange("event_date", event.target.value)}
            />
          </Field>
          <Field label={exumation ? "Horário (slot)" : wake ? "Início do velório" : "Horário"}>
            {exumation ? (
              <Select
                value={draft.start_time || undefined}
                onValueChange={(value) => onChange("start_time", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o slot" />
                </SelectTrigger>
                <SelectContent>
                  {EXHUMATION_TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                type="time"
                value={draft.start_time}
                onChange={(event) => onChange("start_time", event.target.value)}
              />
            )}
          </Field>
          {!exumation && (
            <Field label={wake ? "Fim do velório" : "Horário final (opcional)"}>
              <Input
                type="time"
                value={draft.end_time}
                onChange={(event) => onChange("end_time", event.target.value)}
              />
            </Field>
          )}
          <Field label="Nome da pessoa falecida" className="sm:col-span-2">
            <Input
              value={draft.deceased_name}
              onChange={(event) => onChange("deceased_name", event.target.value)}
            />
          </Field>
          <Field label="Responsável / requerente">
            <Input
              value={draft.responsible_name}
              onChange={(event) => onChange("responsible_name", event.target.value)}
            />
          </Field>
          <Field label="Nº de inscrição">
            <Input
              value={draft.registration_number}
              onChange={(event) => onChange("registration_number", event.target.value)}
            />
          </Field>
          <Field label={exumation ? "Fase da exumação" : "Serviço"}>
            {exumation ? (
              <Select
                value={draft.service || undefined}
                onValueChange={(value) => onChange("service", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a fase" />
                </SelectTrigger>
                <SelectContent>
                  {EXHUMATION_PHASES.map((phase) => (
                    <SelectItem key={phase.value} value={phase.value}>
                      {phase.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={draft.service}
                onChange={(event) => onChange("service", event.target.value)}
              />
            )}
          </Field>
          <Field label="Localização">
            <Input
              value={draft.location}
              onChange={(event) => onChange("location", event.target.value)}
              placeholder="Quadra, terreno, gaveta ou outra referência"
            />
          </Field>

          {wake && (
            <>
              <Field label="Sala de velório">
                <Input
                  value={draft.room}
                  onChange={(event) => onChange("room", event.target.value)}
                />
              </Field>
              <Field label="Horário do sepultamento">
                <Input
                  type="time"
                  value={draft.burial_time}
                  onChange={(event) => onChange("burial_time", event.target.value)}
                />
              </Field>
              <Field label="Local do sepultamento">
                <Input
                  value={draft.burial_location}
                  onChange={(event) => onChange("burial_location", event.target.value)}
                />
              </Field>
              <Field label="Funerária / agência">
                <Input
                  value={draft.funeral_home}
                  onChange={(event) => onChange("funeral_home", event.target.value)}
                />
              </Field>
              <Field label="Quadra / Rua">
                <Input
                  value={draft.quadra_rua}
                  onChange={(event) => onChange("quadra_rua", event.target.value)}
                />
              </Field>
              <Field label="Terreno">
                <Input
                  value={draft.terreno}
                  onChange={(event) => onChange("terreno", event.target.value)}
                />
              </Field>
              <Field label="Gaveta">
                <Input
                  value={draft.gaveta}
                  onChange={(event) => onChange("gaveta", event.target.value)}
                />
              </Field>

              <div className="sm:col-span-2 mt-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Chegada do corpo</p>
                    <p className="text-xs text-muted-foreground">
                      Envie o print da mensagem do grupo e o sistema preenche horário, motorista e placa.
                    </p>
                  </div>
                  <ArrivalPhotoButton
                    onExtracted={(info) => {
                      if (info.arrival_time) onChange("arrival_time", info.arrival_time);
                      if (info.driver_name) onChange("driver_name", info.driver_name);
                      if (info.vehicle_plate) onChange("vehicle_plate", info.vehicle_plate);
                    }}
                  />
                </div>
              </div>

              <Field label="Horário de chegada do corpo">
                <Input
                  type="time"
                  value={draft.arrival_time}
                  onChange={(event) => onChange("arrival_time", event.target.value)}
                />
              </Field>
              <Field label="Motorista">
                <Input
                  value={draft.driver_name}
                  onChange={(event) => onChange("driver_name", event.target.value)}
                />
              </Field>
              <Field label="Placa do veículo">
                <Input
                  value={draft.vehicle_plate}
                  onChange={(event) => onChange("vehicle_plate", event.target.value.toUpperCase())}
                  placeholder="AAA0A00"
                />
              </Field>
            </>
          )}


          {exumation && (
            <>
              <Field label="Família presente">
                <Select
                  value={draft.family_present || "nao_informado"}
                  onValueChange={(value) =>
                    onChange(
                      "family_present",
                      value === "nao_informado" ? "" : (value as "sim" | "nao"),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao_informado">Não informado</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Destino dos despojos">
                <Select
                  value={draft.destination || "nao_informado"}
                  onValueChange={(value) =>
                    onChange("destination", value === "nao_informado" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao_informado">Não informado</SelectItem>
                    {EXUMATION_DESTINATIONS.map((destination) => (
                      <SelectItem key={destination} value={destination}>
                        {destination}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Resultado / situação">
                <Select
                  value={draft.result_status || "nao_informado"}
                  onValueChange={(value) =>
                    onChange("result_status", value === "nao_informado" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao_informado">Não informado</SelectItem>
                    {EXUMATION_RESULTS.map((result) => (
                      <SelectItem key={result} value={result}>
                        {result}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Data de pagamento">
                <Input
                  type="date"
                  value={draft.payment_date}
                  onChange={(event) => onChange("payment_date", event.target.value)}
                />
              </Field>
            </>
          )}

          {draft.agenda_type === "exumacao_pss" && (
            <Field label="Número / referência PPS" className="sm:col-span-2">
              <Input
                value={draft.pss_reference}
                onChange={(event) => onChange("pss_reference", event.target.value)}
                placeholder="Preencher conforme a identificação usada no setor"
              />
            </Field>
          )}

          <Field label="Observações" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={draft.notes}
              onChange={(event) => onChange("notes", event.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Salvar alterações" : "Criar agendamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ArrivalPhotoButton({ onExtracted }: { onExtracted: (info: ArrivalInfo) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const readArrival = useServerFn(readArrivalFromImage);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Envie uma imagem (print/foto).");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o arquivo"));
        reader.readAsDataURL(file);
      });
      const info = await readArrival({ data: { imageDataUrl: dataUrl } });
      onExtracted(info);
      const parts: string[] = [];
      if (info.arrival_time) parts.push(`chegada ${info.arrival_time}`);
      if (info.driver_name) parts.push(info.driver_name);
      if (info.vehicle_plate) parts.push(info.vehicle_plate);
      toast.success(parts.length ? `Extraído: ${parts.join(" · ")}` : "Nada identificado na imagem.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível ler a imagem."));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
        {busy ? "Lendo..." : "Enviar print"}
      </Button>
    </>
  );

}
