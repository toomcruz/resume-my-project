export type OfficialProcessKey =
  | "sepultamento"
  | "exumacao"
  | "ossario"
  | "translado"
  | "atualizacao_cadastral";

export interface OfficialTemplateCatalogItem {
  id: string;
  nome: string;
  processo: string;
  arquivo: string;
  formato: "docx";
  mimeType: string;
  origem: "oficial";
  ativo: boolean;
  placeholders: string[];
  placeholderAliases: Record<string, string>;
  contextos: string[];
  tamanhoBytes: number;
  sha256: string;
  paginas: number;
}

export interface OfficialTemplateInstallVariant {
  catalogId: string;
  storageId: string;
  name: string;
  process: OfficialProcessKey;
  file: string;
  placeholders: string[];
  aliases: Record<string, string>;
  contexts: string[];
}

const CATALOG_URL = "/templates/official/catalogo-modelos.json";

export async function loadOfficialTemplateCatalog(): Promise<OfficialTemplateCatalogItem[]> {
  const response = await fetch(CATALOG_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error("Não foi possível carregar o catálogo de modelos oficiais.");
  const data = (await response.json()) as OfficialTemplateCatalogItem[];
  return data.filter((item) => item.ativo && item.formato === "docx");
}

function processFor(item: OfficialTemplateCatalogItem): OfficialProcessKey | null {
  if (item.id === "identificacao-sala-velorio" || item.id === "condolencias") {
    return "sepultamento";
  }
  if (item.id === "ordem-sepultamento") return "sepultamento";
  if (item.id === "ordem-exumacao" || item.id === "guia-exumacao-semi-intacto") {
    return "exumacao";
  }
  if (item.id === "aquisicao-renovacao-ossuario") return "ossario";
  if (item.id === "memorando-autorizacao-translado") return "translado";
  if (item.id === "atualizacao-cadastral") return "atualizacao_cadastral";
  return null;
}

function variant(
  item: OfficialTemplateCatalogItem,
  input: Omit<OfficialTemplateInstallVariant, "catalogId" | "placeholders" | "aliases">,
): OfficialTemplateInstallVariant {
  return {
    catalogId: item.id,
    placeholders: item.placeholders,
    aliases: item.placeholderAliases,
    ...input,
  };
}

export function getOfficialInstallVariants(
  item: OfficialTemplateCatalogItem,
): OfficialTemplateInstallVariant[] {
  if (item.id === "termo-compromisso-responsabilidade") {
    return [
      variant(item, {
        storageId: `${item.id}-sepultamento`,
        name: "OFICIAL · Termo de Compromisso e Responsabilidade · Sepultamento",
        process: "sepultamento",
        file: item.arquivo,
        contexts: ["jazigo"],
      }),
      variant(item, {
        storageId: `${item.id}-exumacao`,
        name: "OFICIAL · Termo de Compromisso e Responsabilidade · Exumação",
        process: "exumacao",
        file: item.arquivo,
        contexts: ["jazigo"],
      }),
    ];
  }

  if (item.id === "ordem-sepultamento") {
    return [
      variant(item, {
        storageId: item.id,
        name: "OFICIAL · Ordem de Sepultamento · Quadra geral",
        process: "sepultamento",
        file: item.arquivo,
        contexts: ["quadra_geral"],
      }),
      variant(item, {
        storageId: `${item.id}-jazigo`,
        name: "OFICIAL · Ordem de Sepultamento · Jazigo",
        process: "sepultamento",
        file: "sepultamento/ordem-sepultamento-jazigo.docx",
        contexts: ["jazigo"],
      }),
    ];
  }

  if (item.id === "ordem-exumacao") {
    return [
      variant(item, {
        storageId: item.id,
        name: "OFICIAL · Ordem de Exumação · Quadra geral",
        process: "exumacao",
        file: item.arquivo,
        contexts: ["quadra_geral"],
      }),
      variant(item, {
        storageId: `${item.id}-jazigo`,
        name: "OFICIAL · Ordem de Exumação · Jazigo",
        process: "exumacao",
        file: "exumacao/ordem-exumacao-jazigo.docx",
        contexts: ["jazigo"],
      }),
    ];
  }

  if (item.id === "aquisicao-renovacao-ossuario") {
    return [
      variant(item, {
        storageId: item.id,
        name: "OFICIAL · Ossuário · 1º aluguel / aquisição",
        process: "ossario",
        file: item.arquivo,
        contexts: ["aluguel", "aquisicao"],
      }),
      variant(item, {
        storageId: `${item.id}-renovacao`,
        name: "OFICIAL · Ossuário · Renovação",
        process: "ossario",
        file: "ossuario/renovacao-ossuario.docx",
        contexts: ["renovacao"],
      }),
    ];
  }

  const process = processFor(item);
  if (!process) return [];
  return [
    variant(item, {
      storageId: item.id,
      name: `OFICIAL · ${item.nome}`,
      process,
      file: item.arquivo,
      contexts: item.contextos,
    }),
  ];
}

export function officialStoragePath(userId: string, storageId: string): string {
  return `${userId}/official/${storageId}.docx`;
}

export function getOfficialStorageId(storagePath?: string | null): string | null {
  if (!storagePath) return null;
  const match = storagePath.match(/\/official\/([^/]+)\.docx$/i);
  return match?.[1] ?? null;
}

export function isOfficialStoragePath(storagePath?: string | null): boolean {
  return getOfficialStorageId(storagePath) !== null;
}

function normalizedText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export interface TemplateApplicabilityInput {
  process: string;
  subprocess?: string | null;
  subprocessDetails?: Record<string, unknown> | null;
  extractedData?: Record<string, unknown> | null;
}

export interface TemplateLike {
  process?: string | null;
  storage_path?: string | null;
}

export function isTemplateApplicable(
  template: TemplateLike,
  attendance: TemplateApplicabilityInput,
): boolean {
  if (template.process && template.process !== attendance.process) return false;

  const id = getOfficialStorageId(template.storage_path);
  if (!id) return true;

  if (id === "termo-compromisso-responsabilidade-sepultamento") {
    return attendance.process === "sepultamento" && attendance.subprocess === "jazigo";
  }
  if (id === "termo-compromisso-responsabilidade-exumacao") {
    return attendance.process === "exumacao" && attendance.subprocess === "jazigo";
  }
  if (id === "ordem-sepultamento") {
    return attendance.process === "sepultamento" && attendance.subprocess === "quadra_geral";
  }
  if (id === "ordem-sepultamento-jazigo") {
    return attendance.process === "sepultamento" && attendance.subprocess === "jazigo";
  }
  if (id === "ordem-exumacao") {
    return attendance.process === "exumacao" && attendance.subprocess === "quadra_geral";
  }
  if (id === "ordem-exumacao-jazigo") {
    return attendance.process === "exumacao" && attendance.subprocess === "jazigo";
  }
  if (id === "aquisicao-renovacao-ossuario") {
    return (
      attendance.process === "ossario" &&
      ["aluguel", "aquisicao"].includes(attendance.subprocess ?? "")
    );
  }
  if (id === "aquisicao-renovacao-ossuario-renovacao") {
    return attendance.process === "ossario" && attendance.subprocess === "renovacao";
  }
  if (id === "guia-exumacao-semi-intacto") {
    const values = [
      attendance.subprocessDetails?.resultado_exumacao,
      attendance.subprocessDetails?.situacao_exumacao,
      attendance.extractedData?.resultado_exumacao,
      attendance.extractedData?.situacao_exumacao,
      attendance.extractedData?.situacao,
    ].map(normalizedText);
    return values.some((value) => value.includes("semi") && value.includes("intacto"));
  }
  if (id === "identificacao-sala-velorio" || id === "condolencias") {
    const values = [
      attendance.subprocessDetails?.sala_velorio,
      attendance.subprocessDetails?.salaVelorio,
      attendance.extractedData?.sala_velorio,
      attendance.extractedData?.salaVelorio,
    ];
    return (
      attendance.process === "sepultamento" && values.some((value) => String(value ?? "").trim())
    );
  }

  return true;
}

const ALIASES: Record<string, Record<string, string>> = {
  "identificacao-sala-velorio": {
    dataEvento: "data",
    salaVelorio: "sala",
    nomeFalecido: "nomeFal",
    horarioInicioVelorio: "inicio",
    horarioFimVelorio: "fim",
  },
  condolencias: {
    nomeFalecido: "nomeFal",
    dataEvento: "data",
    salaVelorio: "sala",
  },
  "ordem-sepultamento": {
    nomeRequerente: "nomeResp",
    cpfRequerente: "cpfResp",
    enderecoRequerente: "endResp",
    telefoneRequerente: "telResp",
    parentesco: "parent",
    nomeFalecido: "nomeFal",
    numeroDO: "numDO",
    inscricaoGS: "inscrGS",
    placaIdentificacao: "placa",
    salaVelorio: "salaVelorio",
    dataSepultamento: "dataSep",
    horaSepultamento: "horaSep",
    quadraRua: "quadraRua",
    gaveta: "gaveta",
    livroObito: "livroObito",
    empresaFuneraria: "funeraria",
    numeroNotaContratacao: "nota",
    dataAtualExtenso: "dataExt",
    dataAtual: "dataAtual",
  },
  "ordem-exumacao": {
    nomeRequerente: "nomeResp",
    cpfRequerente: "cpfResp",
    enderecoRequerente: "endResp",
    telefoneRequerente: "telResp",
    parentesco: "parent",
    nomeFalecido: "nomeFal",
    numeroDO: "numDO",
    inscricaoGS: "inscrGS",
    placaIdentificacao: "placa",
    dataAgendamento: "dataAg",
    horaAgendamento: "horaAg",
    quadraRua: "quadraRua",
    sepultura: "sepultura",
    gaveta: "gaveta",
    dataAtualExtenso: "dataExt",
    dataAtual: "dataAtual",
  },
  "termo-compromisso-responsabilidade": {
    nomeRequerente: "nomeResp",
    cpfRequerente: "cpfResp",
    enderecoRequerente: "endResp",
    telefoneRequerente: "telResp",
    qualidadeRequerente: "qualid",
    localJazigo: "localJaz",
    tipoProcedimento: "tipoProcedimento",
    nomeFalecido1: "falecido1",
    nomeFalecido2: "falecido2",
    dataAtualExtenso: "dataExt",
  },
  "aquisicao-renovacao-ossuario": {
    nomeConcessionario: "nomeConc",
    cpfConcessionario: "cpfConc",
    enderecoConcessionario: "endConc",
    telefoneConcessionario: "telConc",
    nomeFalecido: "nomeFal",
    blocoGaleria: "bloco",
    numeroOssuario: "numeroOssuario",
    dataAquisicaoRenovacao: "dataAquisicao",
    dataVencimento: "dataVencimento",
    inscricaoGS: "inscrGS",
    placaIdentificacao: "placa",
    livro: "livro",
    folha: "folha",
    dataAtualExtenso: "dataExt",
  },
  "guia-exumacao-semi-intacto": {
    nomeFalecido: "nomeFal",
    nomeRequerente: "nomeResp",
    cpfRequerente: "cpfResp",
    telefoneRequerente: "telResp",
    localExumacao: "local",
    valorExumacao: "valorExumacao",
    valorReinumacao: "valorReinumacao",
    valorCessaoGaveta: "valorCessaoGaveta",
    dataTentativaExumacao: "dataTent",
    dataProximaTentativa: "dataProx",
    dataAtualExtenso: "dataExt",
  },
  "memorando-autorizacao-translado": {
    nomeRequerente: "nomeResp",
    cpfRequerente: "cpfResp",
    nomeFalecido: "nomeFal",
    origemTranslado: "origem",
    destinoTranslado: "destino",
    dataAtualExtenso: "dataExt",
  },
  "atualizacao-cadastral": {
    nomeConcessionario: "nomeConc",
    dataContratacao: "dataContr",
    quadraRua: "quadra",
    terreno: "terreno",
    metragem: "metragem",
    nomeSucessor: "nomeSuc",
    parentesco: "parent",
    rg: "rg",
    cpf: "cpf",
    dataNascimento: "nasc",
    endereco: "endereco",
    telefone: "telefone",
    email: "email",
    inscricaoGS: "inscrGS",
    livro: "livro",
    folha: "folha",
    dataAtual: "dataAt",
    quadraRecibo: "quadraRec",
    terrenoRecibo: "terrRec",
    livroRecibo: "livroRec",
    folhaRecibo: "folhaRec",
    dataRecibo: "dataRec",
    proximaRenovacao: "proxRen",
  },
};

const SYNONYMS: Record<string, string[]> = {
  nomeFalecido: ["nome_falecido", "nomeFal", "falecido"],
  nomeRequerente: ["nome_requerente", "nome_responsavel", "nomeResp"],
  cpfRequerente: ["cpf_requerente", "cpf_responsavel", "cpfResp"],
  enderecoRequerente: ["endereco_requerente", "endereco_responsavel", "endResp", "endereco"],
  telefoneRequerente: ["telefone_requerente", "telefone_responsavel", "telResp", "telefone"],
  inscricaoGS: ["inscricao_gs", "inscrGS", "numero_inscricao"],
  numeroDO: ["numero_do", "numDO"],
  dataSepultamento: ["data_sepultamento", "dataSep"],
  horaSepultamento: ["hora_sepultamento", "horaSep"],
  dataAgendamento: ["data_agendamento", "data_agendada", "dataAg"],
  horaAgendamento: ["hora_agendamento", "horario", "horaAg"],
  salaVelorio: ["sala_velorio", "sala"],
  nomeConcessionario: ["nome_concessionario", "nomeConc"],
  cpfConcessionario: ["cpf_concessionario", "cpfConc"],
  enderecoConcessionario: ["endereco_concessionario", "endConc", "endereco"],
  telefoneConcessionario: ["telefone_concessionario", "telConc", "telefone"],
  blocoGaleria: ["bloco_galeria", "bloco"],
  numeroOssuario: ["numero_ossuario"],
  dataAquisicaoRenovacao: ["data_aquisicao_ossuario", "data_renovacao_ossuario"],
  dataVencimento: ["data_vencimento_ossuario"],
  placaIdentificacao: ["placa_identificacao", "placa"],
  origemTranslado: ["origem_translado", "origem"],
  destinoTranslado: ["destino_translado", "destino"],
};

function camelToSnake(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function baseOfficialId(storageId: string): string {
  if (storageId.startsWith("termo-compromisso-responsabilidade-")) {
    return "termo-compromisso-responsabilidade";
  }
  if (storageId === "ordem-sepultamento-jazigo") return "ordem-sepultamento";
  if (storageId === "ordem-exumacao-jazigo") return "ordem-exumacao";
  if (storageId === "aquisicao-renovacao-ossuario-renovacao") {
    return "aquisicao-renovacao-ossuario";
  }
  return storageId;
}

export function applyOfficialTemplateAliases(
  input: Record<string, string>,
  storagePath?: string | null,
): Record<string, string> {
  const output = { ...input };
  const storageId = getOfficialStorageId(storagePath);
  if (!storageId) return output;
  const aliases = ALIASES[baseOfficialId(storageId)] ?? {};

  for (const [canonical, target] of Object.entries(aliases)) {
    if (String(output[target] ?? "").trim()) continue;
    const candidates = [
      canonical,
      camelToSnake(canonical),
      target,
      camelToSnake(target),
      ...(SYNONYMS[canonical] ?? []),
    ];
    const source = candidates.find((key) => String(output[key] ?? "").trim());
    if (source) output[target] = output[source];
  }

  return output;
}
