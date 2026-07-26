export interface ExtractionProfile {
  expectedFields: readonly string[];
  criticalFields: readonly string[];
  instructions: string;
  concurrency: number;
}

const COMMON_PERSON_FIELDS = [
  "nome_falecido",
  "nome_responsavel",
  "cpf_responsavel",
  "rg_responsavel",
  "endereco_responsavel",
  "telefone_responsavel",
] as const;

const PROFILES: Record<string, ExtractionProfile> = {
  sepultamento: {
    expectedFields: [
      ...COMMON_PERSON_FIELDS,
      "nome_declarante",
      "cpf_declarante",
      "rg_declarante",
      "endereco_declarante",
      "telefone_declarante",
      "grau_parentesco_declarante",
      "numero_do",
      "inscricao_gscemi",
      "placa_identificacao",
      "data_sepultamento",
      "hora_sepultamento",
      "local_sepultamento",
      "quadra",
      "rua",
      "terreno",
      "gaveta",
      "sala_velorio",
      "inicio_velorio",
      "fim_velorio",
      "funeraria",
      "numero_contratacao",
      "tipo_contratacao",
      "padrao_funeral",
      "covid_lacrado",
    ],
    criticalFields: [
      "nome_falecido",
      "nome_declarante",
      "cpf_declarante",
      "grau_parentesco_declarante",
      "numero_do",
      "data_sepultamento",
      "hora_sepultamento",
    ],
    instructions:
      "Leia somente dados usados nos documentos de sepultamento. Na Declaração de Óbito, priorize falecido, declarante, CPF, RG, endereço, telefone, parentesco e número da DO. Na Nota de Contratação, leia número, funerária/agência, modalidade e COVID/lacrado. Em telas GSCEMI, leia inscrição e placa somente quando o rótulo estiver visível. Não procure dados fora desta lista e não invente campos ausentes.",
    concurrency: 2,
  },
  exumacao: {
    expectedFields: [
      ...COMMON_PERSON_FIELDS,
      "numero_do",
      "inscricao_gscemi",
      "placa_identificacao",
      "data_exumacao",
      "hora_agendamento",
      "local_exumacao",
      "quadra",
      "rua",
      "terreno",
      "gaveta",
      "referencia_pps",
    ],
    criticalFields: [
      "nome_falecido",
      "nome_responsavel",
      "cpf_responsavel",
      "numero_do",
      "data_exumacao",
      "hora_agendamento",
    ],
    instructions:
      "Leia somente os dados necessários à ordem de exumação. Preserve números exatamente como aparecem e deixe em branco qualquer campo sem rótulo explícito.",
    concurrency: 2,
  },
  ossario: {
    expectedFields: [
      "nome_falecido",
      "nome_concessionario",
      "cpf_concessionario",
      "endereco_concessionario",
      "telefone_concessionario",
      "inscricao_gscemi",
      "placa_identificacao",
      "numero_ossuario",
      "bloco_galeria",
      "livro",
      "folha",
      "data_aquisicao_ossuario",
      "data_renovacao_ossuario",
      "data_vencimento_ossuario",
    ],
    criticalFields: [
      "nome_falecido",
      "nome_concessionario",
      "cpf_concessionario",
      "numero_ossuario",
    ],
    instructions:
      "Leia somente os dados de aquisição ou renovação de ossuário. Não confunda inscrição GSCEMI, livro, folha, bloco e número do ossuário.",
    concurrency: 2,
  },
  translado: {
    expectedFields: [
      ...COMMON_PERSON_FIELDS,
      "origem_translado",
      "destino_translado",
      "data_falecimento",
      "numero_do",
    ],
    criticalFields: [
      "nome_falecido",
      "nome_responsavel",
      "cpf_responsavel",
      "origem_translado",
      "destino_translado",
    ],
    instructions:
      "Leia somente os dados necessários à autorização de translado. Não deduza origem ou destino quando não estiverem escritos.",
    concurrency: 2,
  },
  atualizacao_cadastral: {
    expectedFields: [
      "nome_concessionario",
      "cpf_concessionario",
      "rg_responsavel",
      "endereco_concessionario",
      "telefone_concessionario",
      "email_concessionario",
      "nome_sucessor",
      "parentesco",
      "data_nascimento",
      "inscricao_gscemi",
      "quadra",
      "terreno",
      "livro",
      "folha",
      "metragem",
    ],
    criticalFields: [
      "nome_concessionario",
      "cpf_concessionario",
      "inscricao_gscemi",
      "quadra",
      "terreno",
    ],
    instructions:
      "Leia somente os dados usados na atualização cadastral. Preserve zeros à esquerda e não misture dados do concessionário com os do sucessor.",
    concurrency: 2,
  },
};

const DEFAULT_PROFILE: ExtractionProfile = {
  expectedFields: [
    "nome_falecido",
    "nome_responsavel",
    "cpf_responsavel",
    "endereco_responsavel",
    "telefone_responsavel",
  ],
  criticalFields: ["nome_falecido", "nome_responsavel"],
  instructions:
    "Leia apenas os campos listados. Campo ausente deve permanecer ausente; nunca complete por suposição.",
  concurrency: 1,
};

export function getExtractionProfile(
  process: string | null | undefined,
  subprocess?: string | null,
): ExtractionProfile {
  const base = PROFILES[String(process ?? "").trim().toLowerCase()] ?? DEFAULT_PROFILE;

  if (process === "sepultamento" && subprocess === "quadra_geral") {
    return {
      ...base,
      expectedFields: base.expectedFields.filter(
        (field) => !["terreno", "gaveta"].includes(field),
      ),
      instructions: `${base.instructions} Para quadra geral, não transforme a expressão “Quadra Geral” em número de rua, terreno ou gaveta.`,
    };
  }

  return base;
}

export function buildExtractionContext(
  process: string | null | undefined,
  subprocess?: string | null,
): string {
  const profile = getExtractionProfile(process, subprocess);
  return `Subprocesso: ${subprocess ?? "-"}. Perfil de leitura: ${profile.instructions}`;
}
