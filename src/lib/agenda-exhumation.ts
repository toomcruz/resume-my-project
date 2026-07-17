import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { AgendaEvent, AgendaStatus, AgendaType } from "@/lib/agenda";

type Row = Database["public"]["Tables"]["exhumation_appointments"]["Row"];
type Insert = Database["public"]["Tables"]["exhumation_appointments"]["Insert"];
type Update = Database["public"]["Tables"]["exhumation_appointments"]["Update"];

export const EXHUMATION_TIME_SLOTS = ["08:30", "09:00", "09:30"] as const;
export type ExhumationTimeSlot = (typeof EXHUMATION_TIME_SLOTS)[number];

export const EXHUMATION_PHASES = [
  { value: "exumacao", label: "Exumação" },
  { value: "coleta_dna", label: "Coleta de DNA" },
  { value: "reinumacao", label: "Reinumação" },
] as const;
export type ExhumationPhase = (typeof EXHUMATION_PHASES)[number]["value"];

export function isExhumationAgendaType(t: AgendaType): boolean {
  return t === "exumacao" || t === "exumacao_pss";
}

export function isValidTimeSlot(v: string): v is ExhumationTimeSlot {
  return (EXHUMATION_TIME_SLOTS as readonly string[]).includes(v);
}

export function isValidPhase(v: string): v is ExhumationPhase {
  return EXHUMATION_PHASES.some((p) => p.value === v);
}

function coerceTimeSlot(v: string | null | undefined): ExhumationTimeSlot {
  if (v && isValidTimeSlot(v.slice(0, 5))) return v.slice(0, 5) as ExhumationTimeSlot;
  return "08:30";
}

function coercePhase(v: string | null | undefined): ExhumationPhase {
  if (v && isValidPhase(v)) return v;
  return "exumacao";
}

/** Map exhumation_appointments row to the AgendaEvent shape used by the UI. */
export function rowToAgendaEvent(row: Row): AgendaEvent {
  const isPss = !!row.pss_reference;
  return {
    id: row.id,
    user_id: row.user_id,
    attendance_id: row.attendance_id,
    agenda_type: isPss ? "exumacao_pss" : "exumacao",
    event_date: row.event_date,
    start_time: row.time_slot,
    end_time: null,
    deceased_name: row.deceased_name,
    responsible_name: row.responsible_name,
    registration_number: row.registration_number,
    service: row.exhumation_phase,
    location: row.location,
    room: row.room,
    burial_time: null,
    burial_location: null,
    funeral_home: row.funeral_home,
    family_present: row.family_present,
    destination: row.destination,
    result_status: row.result_status,
    payment_date: row.payment_date,
    pss_reference: row.pss_reference,
    status: row.status as AgendaStatus,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface ExhumationSavePayload {
  user_id: string;
  agenda_type: Extract<AgendaType, "exumacao" | "exumacao_pss">;
  event_date: string;
  time_slot: string;
  exhumation_phase: string;
  deceased_name: string | null;
  responsible_name: string | null;
  registration_number: string | null;
  location: string | null;
  room: string | null;
  funeral_home: string | null;
  family_present: boolean | null;
  destination: string | null;
  result_status: string | null;
  payment_date: string | null;
  pss_reference: string | null;
  status: AgendaStatus;
  notes: string | null;
}

function toDbInsert(p: ExhumationSavePayload): Insert {
  return {
    user_id: p.user_id,
    event_date: p.event_date,
    time_slot: coerceTimeSlot(p.time_slot),
    exhumation_phase: coercePhase(p.exhumation_phase),
    deceased_name: p.deceased_name,
    responsible_name: p.responsible_name,
    registration_number: p.registration_number,
    location: p.location,
    room: p.room,
    funeral_home: p.funeral_home,
    family_present: p.family_present,
    destination: p.destination,
    result_status: p.result_status,
    payment_date: p.payment_date,
    pss_reference: p.agenda_type === "exumacao_pss" ? p.pss_reference : null,
    status: p.status,
    notes: p.notes,
  };
}

export async function fetchExhumationEvents(
  agendaType: Extract<AgendaType, "exumacao" | "exumacao_pss">,
  date: string,
): Promise<AgendaEvent[]> {
  let query = supabase
    .from("exhumation_appointments")
    .select("*")
    .eq("event_date", date)
    .order("time_slot", { ascending: true })
    .order("created_at", { ascending: true });

  if (agendaType === "exumacao_pss") {
    query = query.not("pss_reference", "is", null);
  } else {
    query = query.is("pss_reference", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(rowToAgendaEvent);
}

export async function insertExhumationEvent(payload: ExhumationSavePayload): Promise<void> {
  const { error } = await supabase.from("exhumation_appointments").insert(toDbInsert(payload));
  if (error) throw error;
}

export async function updateExhumationEvent(
  id: string,
  payload: ExhumationSavePayload,
): Promise<void> {
  const patch: Update = toDbInsert(payload);
  const { error } = await supabase.from("exhumation_appointments").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteExhumationEvent(id: string): Promise<void> {
  const { error } = await supabase.from("exhumation_appointments").delete().eq("id", id);
  if (error) throw error;
}

export async function updateExhumationStatus(id: string, status: AgendaStatus): Promise<void> {
  const { error } = await supabase
    .from("exhumation_appointments")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}
