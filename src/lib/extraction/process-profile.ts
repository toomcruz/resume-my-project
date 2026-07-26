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
    // Campos de data, horário, sala e local não são lidos das fotos. Eles vêm
    // exclusivamente da triagem do atendimento, evitando que endereço ou número
    // de apartamento sejam transformados em sala de velório.
    expectedFields: [
      "nome_falecido",
      "nome_declarante",
      "cpf_declarante",
      "rg_declarante",
      "endereco_declarante",
      "cep_declarante",
      "telefone_declarante",
      "profissao_declarante",
      "grau_parentesco_declarante",
      "numero_do",
      "inscricao_gscemi",
      "placa_identificacao",
      "livro_obito",
      "folha_obito",
      "numero_nota_contratacao",
      "tipo_contratacao",
      "padrao_funeral",
      "covid_lacrado",
      "empresa_agencia",
      "familia_presente",
    ],
    criticalFields: [
      "nome_falecido",
      "nome_declarante",
      "cpf_declarante",
      "grau_parentesco_declarante",
      "numero_do",
    ],
    instructions:
      "Leia somente dados presentes nos documentos. Na Declaração de Óbito, o DECLARANTE é a fonte exclusiva para nome, CPF, RG, endereço, CEP, telefone, profissão e parentesco usados na Ordem de Sepultamento. Na Nota de Contratação, leia somente número da nota, Empresa/Bloco/Agência, modalidade do funeral e COVID/Lacrado. Em telas GSCEMI, leia inscrição, placa, livro e folha apenas quando o rótulo correspondente estiver visível. Não extraia sala, data, horário ou local do sepultamento das imagens: esses campos vêm da triagem. Não invente campos ausentes e não misture declarante, contratante, concessionário ou falecido.",
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
  const normalizedProcess = String(process ?? "").trim().toLowerCase();
  const normalizedSubprocess = String(subprocess ?? "").trim().toLowerCase();
  const base = PROFILES[normalizedProcess] ?? DEFAULT_PROFILE;

  if (normalizedProcess === "sepultamento" && normalizedSubprocess === "quadra_geral") {
    return {
      ...base,
      instructions: `${base.instructions} Para quadra geral, a expressão “Quadra Geral” é apenas o tipo do atendimento e nunca deve ser copiada para Rua, terreno, gaveta ou outro identificador.`,
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
