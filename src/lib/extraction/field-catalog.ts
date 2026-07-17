// Catálogo canônico de campos. Fonte única de verdade para chaves, aliases,
// entidade responsável, validador e escopo de processo.
// Fase 1: apenas dados + helpers. Consumidores serão migrados nas fases seguintes.

import type { ApplicableProcess, EntityType, FieldValueType } from "./types";
import type { ValidatorName } from "./validators";

export interface FieldDefinition {
  key: string;
  label: string;
  entity: EntityType;
  aliases: string[];
  type: FieldValueType;
  processes: readonly ApplicableProcess[];
  validator?: ValidatorName;
  format?: string;
  priority: 1 | 2 | 3;
  sensitive: boolean;
}

// Prioridade: 1 = crítica, 2 = importante, 3 = complementar.
export const FIELD_CATALOG: readonly FieldDefinition[] = [
  // ----- Falecido -----
  {
    key: "nome_falecido",
    label: "Nome do falecido",
    entity: "falecido",
    aliases: ["nomefalecido", "nomefal", "falecido", "nome_do_falecido"],
    type: "name",
    processes: ["sepultamento", "exumacao", "translado", "ossario"],
    validator: "name",
    priority: 1,
    sensitive: true,
  },
  {
    key: "cpf_falecido",
    label: "CPF do falecido",
    entity: "falecido",
    aliases: ["cpffalecido", "cpf_do_falecido"],
    type: "cpf",
    processes: ["sepultamento", "exumacao", "translado"],
    validator: "cpf",
    priority: 2,
    sensitive: true,
  },
  {
    key: "data_nascimento",
    label: "Data de nascimento",
    entity: "falecido",
    aliases: ["datanascimento", "nascimento", "dt_nascimento"],
    type: "date",
    processes: ["*"],
    validator: "date",
    priority: 2,
    sensitive: true,
  },
  {
    key: "data_falecimento",
    label: "Data de falecimento",
    entity: "falecido",
    aliases: ["datafalecimento", "falecimento", "dt_falecimento", "obito", "data_obito"],
    type: "date",
    processes: ["sepultamento", "exumacao", "translado"],
    validator: "date",
    priority: 1,
    sensitive: true,
  },

  // ----- Responsável / Requerente -----
  {
    key: "nome_responsavel",
    label: "Nome do responsável",
    entity: "responsavel",
    aliases: [
      "nomeresponsavel",
      "nomerequerente",
      "nomeresp",
      "responsavel",
      "requerente",
      "nome_requerente",
    ],
    type: "name",
    processes: ["*"],
    validator: "name",
    priority: 1,
    sensitive: true,
  },
  {
    key: "cpf_responsavel",
    label: "CPF do responsável",
    entity: "responsavel",
    aliases: ["cpfresponsavel", "cpfrequerente", "cpfresp", "cpf_requerente"],
    type: "cpf",
    processes: ["*"],
    validator: "cpf",
    priority: 1,
    sensitive: true,
  },
  {
    key: "endereco",
    label: "Endereço",
    entity: "responsavel",
    aliases: ["endereco_responsavel", "logradouro"],
    type: "text",
    processes: ["*"],
    priority: 3,
    sensitive: true,
  },
  {
    key: "telefone",
    label: "Telefone",
    entity: "responsavel",
    aliases: ["telefone_responsavel", "celular", "fone"],
    type: "phone",
    processes: ["*"],
    validator: "phone",
    priority: 3,
    sensitive: true,
  },
  {
    key: "cep",
    label: "CEP",
    entity: "responsavel",
    aliases: [],
    type: "cep",
    processes: ["*"],
    validator: "cep",
    priority: 3,
    sensitive: true,
  },
  {
    key: "email",
    label: "E-mail",
    entity: "responsavel",
    aliases: ["e_mail"],
    type: "email",
    processes: ["*"],
    validator: "email",
    priority: 3,
    sensitive: true,
  },

  // ----- Atendimento / Sistema interno -----
  {
    key: "inscricao_gs",
    label: "Inscrição GS",
    entity: "atendimento",
    aliases: ["inscricaogs", "inscrgs", "inscrGS", "numero_inscricao", "numerogs"],
    type: "text",
    processes: ["*"],
    validator: "preserve",
    priority: 1,
    sensitive: false,
  },

  // ----- Jazigo / Localização -----
  {
    key: "localizacao",
    label: "Localização",
    entity: "jazigo",
    aliases: ["local_exumacao", "localexumacao", "quadrarua"],
    type: "text",
    processes: ["sepultamento", "exumacao"],
    priority: 2,
    sensitive: false,
  },
  {
    key: "quadra",
    label: "Quadra",
    entity: "jazigo",
    aliases: [],
    type: "text",
    processes: ["sepultamento", "exumacao"],
    validator: "preserve",
    priority: 2,
    sensitive: false,
  },
  {
    key: "terreno",
    label: "Terreno / Sepultura",
    entity: "jazigo",
    aliases: ["sepultura"],
    type: "text",
    processes: ["sepultamento", "exumacao"],
    validator: "preserve",
    priority: 2,
    sensitive: false,
  },
  {
    key: "gaveta",
    label: "Gaveta",
    entity: "jazigo",
    aliases: [],
    type: "text",
    processes: ["sepultamento", "exumacao"],
    validator: "preserve",
    priority: 2,
    sensitive: false,
  },

  // ----- Velório / Sepultamento -----
  {
    key: "sala_velorio",
    label: "Sala de velório",
    entity: "atendimento",
    aliases: ["salavelorio", "sala", "sala_do_velorio"],
    type: "text",
    processes: ["sepultamento"],
    priority: 2,
    sensitive: false,
  },
  {
    key: "inicio_velorio",
    label: "Início do velório",
    entity: "atendimento",
    aliases: ["horainiciovelorio", "horario_inicio_velorio"],
    type: "time",
    processes: ["sepultamento"],
    validator: "time",
    priority: 2,
    sensitive: false,
  },
  {
    key: "fim_velorio",
    label: "Fim do velório",
    entity: "atendimento",
    aliases: ["horafimvelorio", "horario_fim_velorio"],
    type: "time",
    processes: ["sepultamento"],
    validator: "time",
    priority: 2,
    sensitive: false,
  },
  {
    key: "hora_sepultamento",
    label: "Horário do sepultamento",
    entity: "atendimento",
    aliases: ["horasep", "horaSep", "horario_sepultamento"],
    type: "time",
    processes: ["sepultamento"],
    validator: "time",
    priority: 1,
    sensitive: false,
  },
  {
    key: "local_sepultamento",
    label: "Local do sepultamento",
    entity: "jazigo",
    aliases: ["localsepultamento"],
    type: "text",
    processes: ["sepultamento"],
    priority: 1,
    sensitive: false,
  },
  {
    key: "data_sepultamento",
    label: "Data do sepultamento",
    entity: "atendimento",
    aliases: ["datasepultamento", "dt_sepultamento"],
    type: "date",
    processes: ["sepultamento"],
    validator: "date",
    priority: 1,
    sensitive: false,
  },
  {
    key: "funeraria",
    label: "Funerária / Agência",
    entity: "funeraria",
    aliases: ["empresa_funeraria", "empresafuneraria", "agencia"],
    type: "text",
    processes: ["sepultamento"],
    priority: 3,
    sensitive: false,
  },

  // ----- Exumação -----
  {
    key: "hora_agendamento",
    label: "Horário do agendamento",
    entity: "atendimento",
    aliases: ["horaag"],
    type: "time",
    processes: ["exumacao"],
    validator: "time",
    priority: 2,
    sensitive: false,
  },
  {
    key: "data_exumacao",
    label: "Data da exumação",
    entity: "atendimento",
    aliases: ["dataexumacao", "dt_exumacao"],
    type: "date",
    processes: ["exumacao"],
    validator: "date",
    priority: 1,
    sensitive: false,
  },
  {
    key: "referencia_pps",
    label: "Referência PPS",
    entity: "atendimento",
    // PPS = Exumação para Pronto Sepultamento. Mantém aliases PSS para leitura de dados legados.
    aliases: ["referencia_pss", "referenciapps", "referenciapss", "num_pps", "num_pss", "numero_pps", "numero_pss"],
    type: "text",
    processes: ["exumacao"],
    validator: "preserve",
    priority: 2,
    sensitive: false,
  },
];

// ---------- Helpers ----------
function normalizeAliasKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const ALIAS_INDEX: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const field of FIELD_CATALOG) {
    map.set(normalizeAliasKey(field.key), field.key);
    for (const alias of field.aliases) {
      const normalized = normalizeAliasKey(alias);
      if (!map.has(normalized)) map.set(normalized, field.key);
    }
  }
  return map;
})();

export function canonicalize(rawKey: string): string | null {
  if (typeof rawKey !== "string" || !rawKey) return null;
  return ALIAS_INDEX.get(normalizeAliasKey(rawKey)) ?? null;
}

export function getFieldByKey(key: string): FieldDefinition | undefined {
  return FIELD_CATALOG.find((field) => field.key === key);
}

export function getFieldByAlias(alias: string): FieldDefinition | undefined {
  const canonical = canonicalize(alias);
  return canonical ? getFieldByKey(canonical) : undefined;
}

export function getFieldsForProcess(process: string): FieldDefinition[] {
  return FIELD_CATALOG.filter(
    (field) => field.processes.includes("*") || field.processes.includes(process as ApplicableProcess),
  );
}
