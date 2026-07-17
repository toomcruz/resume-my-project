/**
 * Catálogo canônico enriquecido — Fase A da reestruturação da tela
 * "Dados Extraídos".
 *
 * Diferenças em relação a `src/lib/extraction/field-catalog.ts` (legado):
 *  - Split de chaves genéricas em canônicas por processo:
 *      nome_falecido → nome_falecido_sepultamento | _exumacao | _exumacao_pps
 *      localizacao   → local_sepultamento | local_exumacao |
 *                      identificacao_jazigo | origem_translado | destino_translado
 *      inscricao_gs  → inscricao_gscemi (alias)
 *  - Cada campo declara em quais documentos oficiais é consumido.
 *  - `visibleWhen` e `requiredWhen` operam sobre `AttendanceContext`, com
 *    predicados puros — sem dependência da UI.
 *
 * Este módulo é puro: sem Supabase, sem React.
 */

import type { AttendanceContext, DocumentSlug } from "./types";

export type FieldSection =
  | "pessoas"
  | "falecido"
  | "responsavel"
  | "concessionario"
  | "jazigo"
  | "ossuario"
  | "velorio"
  | "sepultamento"
  | "exumacao"
  | "translado"
  | "dados_administrativos"
  | "outros";

export type FieldDataType =
  | "name"
  | "cpf"
  | "rg"
  | "date"
  | "time"
  | "phone"
  | "address"
  | "email"
  | "identifier"
  | "text";

export type EntityRole =
  | "falecido_sepultamento"
  | "falecido_exumacao"
  | "falecido_exumacao_pps"
  | "responsavel"
  | "concessionario"
  | "sucessor"
  | "signatario"
  | "jazigo"
  | "ossuario"
  | "atendimento";

export type FieldConditionFn = (ctx: AttendanceContext) => boolean;

export interface FieldDefinition {
  canonicalKey: string;
  label: string;
  description?: string;
  section: FieldSection;
  entityRole?: EntityRole;
  dataType: FieldDataType;
  aliases: string[];
  applicableProcesses: readonly AttendanceContext["process"][];
  applicableDocuments: readonly DocumentSlug[];
  requiredWhen?: FieldConditionFn;
  visibleWhen?: FieldConditionFn;
  priority: 1 | 2 | 3;
  sensitive: boolean;
}

// ---------- Predicados ----------

const hasWake: FieldConditionFn = (c) => c.has_wake === "sim";
const burialHere: FieldConditionFn = (c) => c.burial_here === "sim";
const isJazigo: FieldConditionFn = (c) => c.local_sepultamento_tipo === "jazigo";
const isQuadraGeral: FieldConditionFn = (c) => c.local_sepultamento_tipo === "quadra_geral";
const isPps: FieldConditionFn = (c) => isJazigo(c) && c.jazigo_possui_gaveta_disponivel === "nao";
const isPpsExum = (c: AttendanceContext) =>
  c.process === "velorio_sepultamento" && isPps(c);

const isExhumationPhase = (phase: "preparacao" | "execucao"): FieldConditionFn =>
  (c) => c.process === "exumacao" && c.exhumation_phase === phase;

// ---------- Catálogo ----------

export const FIELD_CATALOG: readonly FieldDefinition[] = [
  // ---------- Falecido (3 papéis distintos) ----------
  {
    canonicalKey: "nome_falecido_sepultamento",
    label: "Falecido que será sepultado",
    section: "falecido",
    entityRole: "falecido_sepultamento",
    dataType: "name",
    aliases: ["nome_falecido", "nomefal", "nomefalecido", "falecido"],
    applicableProcesses: ["velorio_sepultamento"],
    applicableDocuments: [
      "identificacao-sala-velorio",
      "condolencias",
      "ordem-sepultamento",
    ],
    requiredWhen: (c) => c.process === "velorio_sepultamento" && (hasWake(c) || burialHere(c)),
    visibleWhen: (c) => c.process === "velorio_sepultamento",
    priority: 1,
    sensitive: true,
  },
  {
    canonicalKey: "nome_falecido_exumacao",
    label: "Falecido que será exumado",
    section: "falecido",
    entityRole: "falecido_exumacao",
    dataType: "name",
    aliases: [],
    applicableProcesses: ["exumacao"],
    applicableDocuments: [
      "ordem-exumacao",
      "guia-exumacao-semi-intacto",
      "aquisicao-renovacao-ossuario",
      "memorando-autorizacao-translado",
    ],
    requiredWhen: (c) => c.process === "exumacao",
    visibleWhen: (c) => c.process === "exumacao",
    priority: 1,
    sensitive: true,
  },
  {
    canonicalKey: "nome_falecido_exumacao_pps",
    label: "Falecido que será exumado para liberar a vaga",
    description: "Exumação subordinada a um sepultamento em jazigo sem gaveta disponível.",
    section: "falecido",
    entityRole: "falecido_exumacao_pps",
    dataType: "name",
    aliases: [],
    applicableProcesses: ["velorio_sepultamento"],
    applicableDocuments: ["ordem-exumacao", "termo-compromisso-responsabilidade"],
    requiredWhen: isPpsExum,
    visibleWhen: isPpsExum,
    priority: 1,
    sensitive: true,
  },
  {
    canonicalKey: "cpf_falecido",
    label: "CPF do falecido",
    section: "falecido",
    dataType: "cpf",
    aliases: ["cpffalecido", "cpf_do_falecido"],
    applicableProcesses: [],
    applicableDocuments: [],
    // Só aparece se algum documento aplicável ou regra externa exigir. Fase A:
    // não há documento oficial que consome, então fica oculto por padrão.
    visibleWhen: () => false,
    priority: 3,
    sensitive: true,
  },
  {
    canonicalKey: "data_nascimento",
    label: "Data de nascimento",
    section: "falecido",
    dataType: "date",
    aliases: ["nasc", "datanascimento"],
    applicableProcesses: ["atualizacao_cadastral"],
    applicableDocuments: ["atualizacao-cadastral"],
    visibleWhen: (c) => c.process === "atualizacao_cadastral",
    priority: 2,
    sensitive: true,
  },
  {
    canonicalKey: "numero_declaracao_obito",
    label: "Número da declaração de óbito",
    section: "falecido",
    dataType: "identifier",
    aliases: ["numdo", "numero_do", "declaracao_obito"],
    applicableProcesses: ["velorio_sepultamento", "exumacao"],
    applicableDocuments: ["ordem-sepultamento", "ordem-exumacao"],
    requiredWhen: (c) =>
      (c.process === "velorio_sepultamento" && burialHere(c)) || c.process === "exumacao",
    priority: 1,
    sensitive: false,
  },

  // ---------- Responsável ----------
  {
    canonicalKey: "nome_responsavel",
    label: "Nome do responsável",
    section: "responsavel",
    entityRole: "responsavel",
    dataType: "name",
    aliases: ["nomeresp", "nomerequerente", "requerente"],
    applicableProcesses: [
      "velorio_sepultamento",
      "exumacao",
      "ossario",
      "translado",
      "atualizacao_cadastral",
    ],
    applicableDocuments: [
      "ordem-sepultamento",
      "ordem-exumacao",
      "termo-compromisso-responsabilidade",
      "guia-exumacao-semi-intacto",
      "memorando-autorizacao-translado",
    ],
    requiredWhen: (c) => c.process !== "relacao_registros_jazigo",
    priority: 1,
    sensitive: true,
  },
  {
    canonicalKey: "cpf_responsavel",
    label: "CPF do responsável",
    section: "responsavel",
    entityRole: "responsavel",
    dataType: "cpf",
    aliases: ["cpfresp", "cpfrequerente"],
    applicableProcesses: [
      "velorio_sepultamento",
      "exumacao",
      "translado",
      "atualizacao_cadastral",
    ],
    applicableDocuments: [
      "ordem-sepultamento",
      "ordem-exumacao",
      "termo-compromisso-responsabilidade",
      "guia-exumacao-semi-intacto",
      "memorando-autorizacao-translado",
    ],
    priority: 1,
    sensitive: true,
  },
  {
    canonicalKey: "rg_responsavel",
    label: "RG do responsável",
    section: "responsavel",
    entityRole: "responsavel",
    dataType: "rg",
    aliases: ["rgresp", "rgrequerente"],
    applicableProcesses: ["velorio_sepultamento", "exumacao"],
    applicableDocuments: ["ordem-sepultamento", "ordem-exumacao"],
    priority: 2,
    sensitive: true,
  },
  {
    canonicalKey: "endereco_responsavel",
    label: "Endereço do responsável",
    section: "responsavel",
    entityRole: "responsavel",
    dataType: "address",
    aliases: ["endresp", "endereco"],
    applicableProcesses: ["velorio_sepultamento", "exumacao", "translado"],
    applicableDocuments: [
      "ordem-sepultamento",
      "ordem-exumacao",
      "termo-compromisso-responsabilidade",
      "guia-exumacao-semi-intacto",
      "memorando-autorizacao-translado",
    ],
    priority: 2,
    sensitive: true,
  },
  {
    canonicalKey: "telefone_responsavel",
    label: "Telefone do responsável",
    section: "responsavel",
    entityRole: "responsavel",
    dataType: "phone",
    aliases: ["telresp", "telefone"],
    applicableProcesses: ["velorio_sepultamento", "exumacao", "translado"],
    applicableDocuments: [
      "ordem-sepultamento",
      "ordem-exumacao",
      "termo-compromisso-responsabilidade",
      "guia-exumacao-semi-intacto",
      "memorando-autorizacao-translado",
    ],
    priority: 3,
    sensitive: true,
  },
  {
    canonicalKey: "parentesco_qualidade",
    label: "Parentesco / qualidade",
    section: "responsavel",
    entityRole: "responsavel",
    dataType: "text",
    aliases: ["parent", "parentesco"],
    applicableProcesses: ["velorio_sepultamento", "exumacao"],
    applicableDocuments: ["ordem-sepultamento", "ordem-exumacao"],
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "qualidade_signatario",
    label: "Qualidade do signatário",
    section: "responsavel",
    entityRole: "signatario",
    dataType: "text",
    aliases: ["qualid"],
    applicableProcesses: ["velorio_sepultamento", "exumacao"],
    applicableDocuments: ["termo-compromisso-responsabilidade"],
    priority: 2,
    sensitive: false,
  },

  // ---------- Concessionário ----------
  {
    canonicalKey: "nome_concessionario",
    label: "Nome do concessionário",
    section: "concessionario",
    entityRole: "concessionario",
    dataType: "name",
    aliases: ["nomeconc"],
    applicableProcesses: ["ossario", "atualizacao_cadastral"],
    applicableDocuments: ["aquisicao-renovacao-ossuario", "atualizacao-cadastral"],
    priority: 1,
    sensitive: true,
  },
  {
    canonicalKey: "cpf_concessionario",
    label: "CPF do concessionário",
    section: "concessionario",
    entityRole: "concessionario",
    dataType: "cpf",
    aliases: ["cpfconc", "cpf"],
    applicableProcesses: ["ossario", "atualizacao_cadastral"],
    applicableDocuments: ["aquisicao-renovacao-ossuario", "atualizacao-cadastral"],
    priority: 1,
    sensitive: true,
  },
  {
    canonicalKey: "endereco_concessionario",
    label: "Endereço do concessionário",
    section: "concessionario",
    entityRole: "concessionario",
    dataType: "address",
    aliases: ["endconc"],
    applicableProcesses: ["ossario", "atualizacao_cadastral"],
    applicableDocuments: ["aquisicao-renovacao-ossuario", "atualizacao-cadastral"],
    priority: 2,
    sensitive: true,
  },
  {
    canonicalKey: "telefone_concessionario",
    label: "Telefone do concessionário",
    section: "concessionario",
    entityRole: "concessionario",
    dataType: "phone",
    aliases: ["telconc"],
    applicableProcesses: ["ossario", "atualizacao_cadastral"],
    applicableDocuments: ["aquisicao-renovacao-ossuario", "atualizacao-cadastral"],
    priority: 3,
    sensitive: true,
  },
  {
    canonicalKey: "nome_sucessor",
    label: "Nome do sucessor",
    section: "concessionario",
    entityRole: "sucessor",
    dataType: "name",
    aliases: ["nomesuc"],
    applicableProcesses: ["atualizacao_cadastral"],
    applicableDocuments: ["atualizacao-cadastral"],
    priority: 2,
    sensitive: true,
  },

  // ---------- Jazigo ----------
  {
    canonicalKey: "inscricao_gscemi",
    label: "Inscrição GSCEMI",
    section: "jazigo",
    entityRole: "jazigo",
    dataType: "identifier",
    aliases: ["inscricao_gs", "inscrgs", "inscr_gs", "inscrgscemi", "inscr_gscemi", "numero_inscricao", "inscricao_g_s"],
    applicableProcesses: [
      "velorio_sepultamento",
      "exumacao",
      "ossario",
      "atualizacao_cadastral",
    ],
    applicableDocuments: [
      "ordem-sepultamento",
      "ordem-exumacao",
      "aquisicao-renovacao-ossuario",
      "atualizacao-cadastral",
    ],
    priority: 1,
    sensitive: false,
  },
  {
    canonicalKey: "quadra",
    label: "Quadra",
    section: "jazigo",
    entityRole: "jazigo",
    dataType: "text",
    aliases: [],
    applicableProcesses: [
      "velorio_sepultamento",
      "exumacao",
      "atualizacao_cadastral",
    ],
    applicableDocuments: ["atualizacao-cadastral"],
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "rua",
    label: "Rua",
    section: "jazigo",
    entityRole: "jazigo",
    dataType: "text",
    aliases: [],
    applicableProcesses: ["velorio_sepultamento", "exumacao"],
    applicableDocuments: [],
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "quadra_rua",
    label: "Quadra / Rua",
    description: "Composição usada nos documentos legados.",
    section: "jazigo",
    entityRole: "jazigo",
    dataType: "text",
    aliases: ["quadrarua"],
    applicableProcesses: ["velorio_sepultamento", "exumacao"],
    applicableDocuments: ["ordem-sepultamento", "ordem-exumacao"],
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "terreno",
    label: "Terreno / Sepultura",
    section: "jazigo",
    entityRole: "jazigo",
    dataType: "text",
    aliases: ["sepultura", "terrRec"],
    applicableProcesses: ["velorio_sepultamento", "exumacao", "atualizacao_cadastral"],
    applicableDocuments: ["ordem-exumacao", "atualizacao-cadastral"],
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "gaveta",
    label: "Gaveta",
    section: "jazigo",
    entityRole: "jazigo",
    dataType: "text",
    aliases: [],
    applicableProcesses: ["velorio_sepultamento", "exumacao"],
    applicableDocuments: ["ordem-sepultamento", "ordem-exumacao"],
    visibleWhen: (c) => isJazigo(c) || c.process === "exumacao",
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "livro",
    label: "Livro",
    section: "jazigo",
    entityRole: "jazigo",
    dataType: "identifier",
    aliases: [],
    applicableProcesses: ["atualizacao_cadastral"],
    applicableDocuments: ["atualizacao-cadastral"],
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "folha",
    label: "Folha",
    section: "jazigo",
    entityRole: "jazigo",
    dataType: "identifier",
    aliases: [],
    applicableProcesses: ["atualizacao_cadastral"],
    applicableDocuments: ["atualizacao-cadastral"],
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "livro_obito",
    label: "Livro de óbito",
    section: "sepultamento",
    dataType: "identifier",
    aliases: ["livroobito"],
    applicableProcesses: ["velorio_sepultamento"],
    applicableDocuments: ["ordem-sepultamento"],
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "placa_identificacao",
    label: "Placa de identificação",
    section: "jazigo",
    entityRole: "jazigo",
    dataType: "text",
    aliases: ["placa"],
    applicableProcesses: ["velorio_sepultamento", "exumacao"],
    applicableDocuments: ["ordem-sepultamento", "ordem-exumacao"],
    priority: 3,
    sensitive: false,
  },
  {
    canonicalKey: "local_jazigo",
    label: "Identificação do jazigo (termo)",
    section: "jazigo",
    entityRole: "jazigo",
    dataType: "text",
    aliases: ["localjaz"],
    applicableProcesses: ["velorio_sepultamento", "exumacao"],
    applicableDocuments: ["termo-compromisso-responsabilidade"],
    visibleWhen: (c) => isJazigo(c) || c.process === "exumacao",
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "metragem",
    label: "Metragem",
    section: "jazigo",
    entityRole: "jazigo",
    dataType: "text",
    aliases: [],
    applicableProcesses: ["atualizacao_cadastral"],
    applicableDocuments: ["atualizacao-cadastral"],
    priority: 3,
    sensitive: false,
  },

  // ---------- Velório ----------
  {
    canonicalKey: "sala_velorio",
    label: "Sala de velório",
    section: "velorio",
    dataType: "text",
    aliases: ["sala"],
    applicableProcesses: ["velorio_sepultamento"],
    applicableDocuments: [
      "identificacao-sala-velorio",
      "condolencias",
      "ordem-sepultamento",
    ],
    requiredWhen: hasWake,
    visibleWhen: hasWake,
    priority: 1,
    sensitive: false,
  },
  {
    canonicalKey: "inicio_velorio",
    label: "Início do velório",
    section: "velorio",
    dataType: "time",
    aliases: ["inicio"],
    applicableProcesses: ["velorio_sepultamento"],
    applicableDocuments: ["identificacao-sala-velorio"],
    requiredWhen: hasWake,
    visibleWhen: hasWake,
    priority: 1,
    sensitive: false,
  },
  {
    canonicalKey: "fim_velorio",
    label: "Término do velório",
    section: "velorio",
    dataType: "time",
    aliases: ["fim"],
    applicableProcesses: ["velorio_sepultamento"],
    applicableDocuments: ["identificacao-sala-velorio"],
    requiredWhen: hasWake,
    visibleWhen: hasWake,
    priority: 1,
    sensitive: false,
  },

  // ---------- Sepultamento ----------
  {
    canonicalKey: "data_sepultamento",
    label: "Data do sepultamento",
    section: "sepultamento",
    dataType: "date",
    aliases: ["datasep"],
    applicableProcesses: ["velorio_sepultamento"],
    applicableDocuments: ["ordem-sepultamento"],
    requiredWhen: burialHere,
    visibleWhen: burialHere,
    priority: 1,
    sensitive: false,
  },
  {
    canonicalKey: "horario_sepultamento",
    label: "Horário do sepultamento",
    section: "sepultamento",
    dataType: "time",
    aliases: ["horasep"],
    applicableProcesses: ["velorio_sepultamento"],
    applicableDocuments: ["ordem-sepultamento"],
    requiredWhen: burialHere,
    visibleWhen: burialHere,
    priority: 1,
    sensitive: false,
  },
  {
    canonicalKey: "local_sepultamento",
    label: "Local do sepultamento",
    section: "sepultamento",
    dataType: "text",
    aliases: ["localsepultamento"],
    applicableProcesses: ["velorio_sepultamento"],
    applicableDocuments: [],
    visibleWhen: (c) => burialHere(c) && isQuadraGeral(c),
    priority: 1,
    sensitive: false,
  },
  {
    canonicalKey: "empresa_funeraria",
    label: "Funerária / agência",
    section: "sepultamento",
    dataType: "text",
    aliases: ["funeraria"],
    applicableProcesses: ["velorio_sepultamento"],
    applicableDocuments: ["ordem-sepultamento"],
    visibleWhen: burialHere,
    priority: 3,
    sensitive: false,
  },
  {
    canonicalKey: "numero_nota_contratacao",
    label: "Nº da nota de contratação",
    section: "sepultamento",
    dataType: "identifier",
    aliases: ["nota"],
    applicableProcesses: ["velorio_sepultamento"],
    applicableDocuments: ["ordem-sepultamento"],
    visibleWhen: burialHere,
    priority: 2,
    sensitive: false,
  },

  // ---------- Exumação ----------
  {
    canonicalKey: "data_exumacao",
    label: "Data da exumação",
    section: "exumacao",
    dataType: "date",
    aliases: ["dataag", "dataexumacao"],
    applicableProcesses: ["exumacao", "velorio_sepultamento"],
    applicableDocuments: ["ordem-exumacao"],
    priority: 1,
    sensitive: false,
  },
  {
    canonicalKey: "hora_agendamento",
    label: "Horário do agendamento",
    section: "exumacao",
    dataType: "time",
    aliases: ["horaag"],
    applicableProcesses: ["exumacao", "velorio_sepultamento"],
    applicableDocuments: ["ordem-exumacao"],
    visibleWhen: (c) => c.exhumation_scheduling_mode === "agenda" || c.process === "velorio_sepultamento",
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "local_exumacao",
    label: "Local da exumação",
    section: "exumacao",
    dataType: "text",
    aliases: ["localexumacao"],
    applicableProcesses: ["exumacao"],
    applicableDocuments: ["guia-exumacao-semi-intacto"],
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "resultado_exumacao",
    label: "Resultado da exumação",
    section: "exumacao",
    dataType: "text",
    aliases: [],
    applicableProcesses: ["exumacao"],
    applicableDocuments: [],
    visibleWhen: isExhumationPhase("execucao"),
    priority: 1,
    sensitive: false,
  },
  {
    canonicalKey: "referencia_pps",
    label: "Referência PPS",
    section: "exumacao",
    dataType: "identifier",
    // PPS = Exumação para Pronto Sepultamento. Aliases legados PSS
    // preservados para dados já salvos em atendimentos antigos.
    aliases: ["referencia_pss", "numeropps", "numeropss", "referenciapps", "referenciapss", "numero_pps", "numero_pss"],
    applicableProcesses: ["exumacao"],
    applicableDocuments: [],
    visibleWhen: (c) => c.process === "exumacao",
    priority: 3,
    sensitive: false,
  },
  {
    canonicalKey: "valor_exumacao",
    label: "Valor da exumação",
    section: "exumacao",
    dataType: "text",
    aliases: ["valorexumacao"],
    applicableProcesses: ["exumacao"],
    applicableDocuments: ["guia-exumacao-semi-intacto"],
    priority: 3,
    sensitive: false,
  },
  {
    canonicalKey: "valor_reinumacao",
    label: "Valor da reinumação",
    section: "exumacao",
    dataType: "text",
    aliases: ["valorreinumacao"],
    applicableProcesses: ["exumacao"],
    applicableDocuments: ["guia-exumacao-semi-intacto"],
    priority: 3,
    sensitive: false,
  },
  {
    canonicalKey: "valor_cessao_gaveta",
    label: "Valor da cessão de gaveta",
    section: "exumacao",
    dataType: "text",
    aliases: ["valorcessaogaveta"],
    applicableProcesses: ["exumacao"],
    applicableDocuments: ["guia-exumacao-semi-intacto"],
    priority: 3,
    sensitive: false,
  },
  {
    canonicalKey: "data_tentativa",
    label: "Data da tentativa",
    section: "exumacao",
    dataType: "date",
    aliases: ["datatent"],
    applicableProcesses: ["exumacao"],
    applicableDocuments: ["guia-exumacao-semi-intacto"],
    priority: 3,
    sensitive: false,
  },
  {
    canonicalKey: "data_proxima_tentativa",
    label: "Data da próxima tentativa",
    section: "exumacao",
    dataType: "date",
    aliases: ["dataprox"],
    applicableProcesses: ["exumacao"],
    applicableDocuments: ["guia-exumacao-semi-intacto"],
    priority: 3,
    sensitive: false,
  },
  {
    canonicalKey: "tipo_procedimento",
    label: "Tipo de procedimento (termo)",
    section: "exumacao",
    dataType: "text",
    aliases: ["tipoprocedimento"],
    applicableProcesses: ["velorio_sepultamento", "exumacao"],
    applicableDocuments: ["termo-compromisso-responsabilidade"],
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "falecido1_termo",
    label: "Falecido 1 (termo)",
    section: "exumacao",
    dataType: "name",
    aliases: ["falecido1"],
    applicableProcesses: ["velorio_sepultamento", "exumacao"],
    applicableDocuments: ["termo-compromisso-responsabilidade"],
    priority: 2,
    sensitive: true,
  },
  {
    canonicalKey: "falecido2_termo",
    label: "Falecido 2 (termo)",
    section: "exumacao",
    dataType: "name",
    aliases: ["falecido2"],
    applicableProcesses: ["velorio_sepultamento", "exumacao"],
    applicableDocuments: ["termo-compromisso-responsabilidade"],
    visibleWhen: isPpsExum,
    priority: 2,
    sensitive: true,
  },

  // ---------- Ossuário ----------
  {
    canonicalKey: "numero_ossuario",
    label: "Número do ossuário",
    section: "ossuario",
    entityRole: "ossuario",
    dataType: "identifier",
    aliases: ["numeroossuario"],
    applicableProcesses: ["ossario", "exumacao"],
    applicableDocuments: ["aquisicao-renovacao-ossuario"],
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "bloco_ossuario",
    label: "Bloco do ossuário",
    section: "ossuario",
    entityRole: "ossuario",
    dataType: "text",
    aliases: ["bloco"],
    applicableProcesses: ["ossario", "exumacao"],
    applicableDocuments: ["aquisicao-renovacao-ossuario"],
    priority: 3,
    sensitive: false,
  },
  {
    canonicalKey: "data_aquisicao_ossuario",
    label: "Data de aquisição do ossuário",
    section: "ossuario",
    entityRole: "ossuario",
    dataType: "date",
    aliases: ["dataaquisicao"],
    applicableProcesses: ["ossario", "exumacao"],
    applicableDocuments: ["aquisicao-renovacao-ossuario"],
    priority: 3,
    sensitive: false,
  },
  {
    canonicalKey: "data_vencimento_ossuario",
    label: "Data de vencimento do ossuário",
    section: "ossuario",
    entityRole: "ossuario",
    dataType: "date",
    aliases: ["datavencimento"],
    applicableProcesses: ["ossario", "exumacao"],
    applicableDocuments: ["aquisicao-renovacao-ossuario"],
    priority: 3,
    sensitive: false,
  },

  // ---------- Translado ----------
  {
    canonicalKey: "origem_translado",
    label: "Origem do translado",
    section: "translado",
    dataType: "text",
    aliases: ["origem"],
    applicableProcesses: ["translado", "exumacao"],
    applicableDocuments: ["memorando-autorizacao-translado"],
    priority: 2,
    sensitive: false,
  },
  {
    canonicalKey: "destino_translado",
    label: "Destino do translado",
    section: "translado",
    dataType: "text",
    aliases: ["destino"],
    applicableProcesses: ["translado", "exumacao"],
    applicableDocuments: ["memorando-autorizacao-translado"],
    priority: 2,
    sensitive: false,
  },

  // ---------- Administrativos ----------
  {
    canonicalKey: "data_atual",
    label: "Data atual",
    section: "dados_administrativos",
    dataType: "date",
    aliases: ["dataatual", "dataat"],
    applicableProcesses: [
      "velorio_sepultamento",
      "exumacao",
      "ossario",
      "translado",
      "atualizacao_cadastral",
    ],
    applicableDocuments: [
      "ordem-sepultamento",
      "ordem-exumacao",
      "atualizacao-cadastral",
    ],
    priority: 3,
    sensitive: false,
  },
  {
    canonicalKey: "data_atual_extenso",
    label: "Data atual por extenso",
    section: "dados_administrativos",
    dataType: "text",
    aliases: ["dataext"],
    applicableProcesses: [
      "velorio_sepultamento",
      "exumacao",
      "ossario",
      "translado",
      "atualizacao_cadastral",
    ],
    applicableDocuments: [
      "ordem-sepultamento",
      "ordem-exumacao",
      "termo-compromisso-responsabilidade",
      "aquisicao-renovacao-ossuario",
      "guia-exumacao-semi-intacto",
      "memorando-autorizacao-translado",
      "atualizacao-cadastral",
    ],
    priority: 3,
    sensitive: false,
  },
];

// ---------- Helpers de acesso ----------

export function getFieldByKey(key: string): FieldDefinition | undefined {
  return FIELD_CATALOG.find((field) => field.canonicalKey === key);
}

/** Data type de um campo canônico. Preserva zeros à esquerda para identifiers/text. */
export function shouldPreserveRawValue(field: FieldDefinition): boolean {
  return (
    field.dataType === "identifier" ||
    field.dataType === "text" ||
    field.dataType === "cpf" ||
    field.dataType === "rg" ||
    field.dataType === "phone"
  );
}
