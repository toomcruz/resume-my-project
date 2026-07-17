export type ProcessKey =
  | "sepultamento"
  | "exumacao"
  | "ossario"
  | "translado"
  | "atualizacao_cadastral";

export interface ProcessExtraField {
  name: string;
  label: string;
  type: "text" | "textarea" | "date" | "time" | "select";
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[];
  section?: string;
  showWhen?: { field: string; equals: string };
}

export interface ProcessDef {
  key: ProcessKey;
  label: string;
  description: string;
  subprocessLabel?: string;
  subprocessOptions?: { value: string; label: string }[];
  extraFields?: ProcessExtraField[];
}

export const PROCESSES: ProcessDef[] = [
  {
    key: "sepultamento",
    label: "Sepultamento",
    description: "Registro de novo sepultamento em quadra geral ou jazigo.",
    subprocessLabel: "Local",
    subprocessOptions: [
      { value: "quadra_geral", label: "Quadra geral" },
      { value: "jazigo", label: "Jazigo" },
    ],
  },
  {
    key: "exumacao",
    label: "Exumação",
    description: "Exumação em quadra geral ou jazigo.",
    subprocessLabel: "Local",
    subprocessOptions: [
      { value: "quadra_geral", label: "Quadra geral" },
      { value: "jazigo", label: "Jazigo" },
    ],
    extraFields: [
      {
        name: "tipo_agenda_exumacao",
        label: "Agenda de destino",
        type: "select",
        section: "Agenda de exumação",
        options: [
          { value: "exumacao", label: "Agenda de Exumação" },
          {
            value: "exumacao_pss",
            label: "Exumação para Pronto Sepultamento (PPS)",
          },
        ],
      },
      {
        name: "data_agendada",
        label: "Data da exumação",
        type: "date",
        section: "Agenda de exumação",
        description:
          "Ao informar a data, o atendimento será incluído automaticamente na agenda escolhida.",
      },
      {
        name: "hora_agendamento",
        label: "Horário",
        type: "time",
        section: "Agenda de exumação",
      },
      {
        name: "localizacao",
        label: "Localização",
        type: "text",
        section: "Agenda de exumação",
        placeholder: "Quadra, terreno, sepultura ou gaveta",
      },
      {
        name: "referencia_pps",
        label: "Número / referência PPS",
        type: "text",
        section: "Agenda de exumação",
        showWhen: { field: "tipo_agenda_exumacao", equals: "exumacao_pss" },
      },
    ],
  },
  {
    key: "ossario",
    label: "Ossário",
    description: "Aluguel, aquisição ou renovação de ossário.",
    subprocessLabel: "Operação",
    subprocessOptions: [
      { value: "aluguel", label: "Aluguel" },
      { value: "aquisicao", label: "Aquisição" },
      { value: "renovacao", label: "Renovação" },
    ],
  },
  {
    key: "translado",
    label: "Translado",
    description: "Translado interno ou externo com origem e destino.",
    subprocessLabel: "Tipo",
    subprocessOptions: [
      { value: "interno", label: "Interno" },
      { value: "externo", label: "Externo" },
    ],
    extraFields: [
      { name: "origem", label: "Origem", type: "text" },
      { name: "destino", label: "Destino", type: "text" },
    ],
  },
  {
    key: "atualizacao_cadastral",
    label: "Atualização cadastral",
    description: "Atualizar dados do jazigo e responsáveis.",
  },
];

export function getProcess(key: string): ProcessDef | undefined {
  return PROCESSES.find((process) => process.key === key);
}
