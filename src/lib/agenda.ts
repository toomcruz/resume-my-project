export type AgendaType = "exumacao" | "velorio_sepultamento" | "exumacao_pss";

export type AgendaStatus =
  | "agendado"
  | "confirmado"
  | "em_andamento"
  | "concluido"
  | "cancelado"
  | "pendente";

export interface AgendaEvent {
  id: string;
  user_id: string;
  attendance_id: string | null;
  agenda_type: AgendaType;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  deceased_name: string | null;
  responsible_name: string | null;
  registration_number: string | null;
  service: string | null;
  location: string | null;
  room: string | null;
  burial_time: string | null;
  burial_location: string | null;
  funeral_home: string | null;
  family_present: boolean | null;
  destination: string | null;
  result_status: string | null;
  payment_date: string | null;
  pss_reference: string | null;
  status: AgendaStatus;
  notes: string | null;
  quadra_rua: string | null;
  terreno: string | null;
  gaveta: string | null;
  arrival_time: string | null;
  driver_name: string | null;
  vehicle_plate: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgendaEventDraft {
  agenda_type: AgendaType;
  event_date: string;
  start_time: string;
  end_time: string;
  deceased_name: string;
  responsible_name: string;
  registration_number: string;
  service: string;
  location: string;
  room: string;
  burial_time: string;
  burial_location: string;
  funeral_home: string;
  family_present: "" | "sim" | "nao";
  destination: string;
  result_status: string;
  payment_date: string;
  pss_reference: string;
  status: AgendaStatus;
  notes: string;
  quadra_rua: string;
  terreno: string;
  gaveta: string;
  arrival_time: string;
  driver_name: string;
  vehicle_plate: string;
}

export const AGENDA_TYPES: Array<{
  value: AgendaType;
  label: string;
  description: string;
}> = [
  {
    value: "exumacao",
    label: "Agenda de Exumação",
    description: "Agendamentos, localização, destino e situação da exumação.",
  },
  {
    value: "velorio_sepultamento",
    label: "Velório e Sepultamento",
    description: "Sala, horários do velório e horário/local do sepultamento.",
  },
  {
    value: "exumacao_pss",
    label: "Exumação PPS",
    description: "Exumação para Pronto Sepultamento (PPS) — agenda separada com horários fixos.",
  },
];

export const AGENDA_STATUSES: Array<{ value: AgendaStatus; label: string }> = [
  { value: "agendado", label: "Agendado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluído" },
  { value: "pendente", label: "Pendente" },
  { value: "cancelado", label: "Cancelado" },
];

export const EXUMATION_DESTINATIONS = [
  "Mesmo local",
  "Ossuário individual",
  "Ossuário geral",
  "Crematório",
  "Transladado",
  "Outro",
] as const;

export const EXUMATION_RESULTS = [
  "Pendente",
  "Exumado",
  "Semi-intacto",
  "Reinumado",
  "Transladado",
  "Cancelado",
] as const;

export function emptyAgendaDraft(agendaType: AgendaType, eventDate: string): AgendaEventDraft {
  return {
    agenda_type: agendaType,
    event_date: eventDate,
    start_time: "",
    end_time: "",
    deceased_name: "",
    responsible_name: "",
    registration_number: "",
    service: "",
    location: "",
    room: "",
    burial_time: "",
    burial_location: "",
    funeral_home: "",
    family_present: "",
    destination: "",
    result_status: "",
    payment_date: "",
    pss_reference: "",
    status: "agendado",
    notes: "",
    quadra_rua: "",
    terreno: "",
    gaveta: "",
    arrival_time: "",
    driver_name: "",
    vehicle_plate: "",
  };
}

export function eventToDraft(event: AgendaEvent): AgendaEventDraft {
  return {
    agenda_type: event.agenda_type,
    event_date: event.event_date,
    start_time: trimTime(event.start_time),
    end_time: trimTime(event.end_time),
    deceased_name: event.deceased_name ?? "",
    responsible_name: event.responsible_name ?? "",
    registration_number: event.registration_number ?? "",
    service: event.service ?? "",
    location: event.location ?? "",
    room: event.room ?? "",
    burial_time: trimTime(event.burial_time),
    burial_location: event.burial_location ?? "",
    funeral_home: event.funeral_home ?? "",
    family_present:
      event.family_present === true ? "sim" : event.family_present === false ? "nao" : "",
    destination: event.destination ?? "",
    result_status: event.result_status ?? "",
    payment_date: event.payment_date ?? "",
    pss_reference: event.pss_reference ?? "",
    status: event.status,
    notes: event.notes ?? "",
    quadra_rua: event.quadra_rua ?? "",
    terreno: event.terreno ?? "",
    gaveta: event.gaveta ?? "",
    arrival_time: trimTime(event.arrival_time),
    driver_name: event.driver_name ?? "",
    vehicle_plate: event.vehicle_plate ?? "",
  };
}

export function trimTime(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 5);
}

export function formatAgendaDate(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function statusLabel(status: AgendaStatus): string {
  return AGENDA_STATUSES.find((item) => item.value === status)?.label ?? status;
}

export function toNullable(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}
