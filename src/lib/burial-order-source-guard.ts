type VisionFieldLike = {
  canonicalKey?: string;
  value?: string;
  evidence?: string;
};

type VisionImageLike = {
  documentType?: string;
  fields?: VisionFieldLike[];
};

type VisionStateLike = {
  rawByImage?: Record<string, VisionImageLike | null | undefined>;
};

type VisionMetaLike = {
  sourceImageId?: string;
  confirmedByUser?: boolean;
};

type ProtectedFieldRule = {
  target: string;
  keys: string[];
  canonicalKeys: string[];
  legacyEvidenceKey: string;
  allowedDocumentTypes: string[];
  hasExpectedLabel: (normalizedEvidence: string) => boolean;
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, "_");
}

function normalizeComparable(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function stringRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function visionMeta(input: Record<string, unknown>): Record<string, VisionMetaLike> {
  return stringRecord(input._visionMeta) as Record<string, VisionMetaLike>;
}

function visionState(input: Record<string, unknown>): VisionStateLike {
  return stringRecord(input._vision) as VisionStateLike;
}

function evidenceContainsValue(evidence: string, value: string): boolean {
  const expected = normalizeComparable(value);
  if (!expected) return false;
  return normalizeComparable(evidence).includes(expected);
}

function supportsRuleEvidence(rule: ProtectedFieldRule, evidence: string, value: string): boolean {
  return Boolean(evidence.trim()) && rule.hasExpectedLabel(normalizeText(evidence)) && evidenceContainsValue(evidence, value);
}

function isConfirmedByUser(
  rule: ProtectedFieldRule,
  meta: Record<string, VisionMetaLike>,
): boolean {
  return rule.keys.some((key) => meta[key]?.confirmedByUser === true);
}

function sourceImageIds(
  rule: ProtectedFieldRule,
  meta: Record<string, VisionMetaLike>,
): string[] {
  return Array.from(
    new Set(
      rule.keys
        .map((key) => meta[key]?.sourceImageId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function hasVisionEvidence(
  rule: ProtectedFieldRule,
  value: string,
  input: Record<string, unknown>,
): boolean {
  const state = visionState(input);
  const rawByImage = state.rawByImage ?? {};
  const meta = visionMeta(input);
  const preferredIds = sourceImageIds(rule, meta);
  const entries = preferredIds.length
    ? preferredIds.map((id) => [id, rawByImage[id]] as const)
    : Object.entries(rawByImage);
  const allowedKeys = new Set(rule.canonicalKeys.map(normalizeKey));

  for (const [, raw] of entries) {
    if (!raw) continue;
    if (!rule.allowedDocumentTypes.includes(String(raw.documentType ?? ""))) continue;
    for (const field of raw.fields ?? []) {
      if (!allowedKeys.has(normalizeKey(field.canonicalKey))) continue;
      if (normalizeComparable(field.value) !== normalizeComparable(value)) continue;
      if (supportsRuleEvidence(rule, String(field.evidence ?? ""), value)) return true;
    }
  }
  return false;
}

const PROTECTED_FIELDS: ProtectedFieldRule[] = [
  {
    target: "inscrGS",
    keys: [
      "inscrGS",
      "inscricao_gscemi",
      "inscricao_gs",
      "inscricaoGS",
      "inscr_gs",
      "numero_inscricao",
    ],
    canonicalKeys: ["inscricao_gscemi", "inscricao_gs"],
    legacyEvidenceKey: "__evidence_inscricao_gscemi",
    allowedDocumentTypes: [
      "cadastro_jazigo",
      "registro_jazigo",
      "tela_sistema_interno",
      "documento_sepultamento",
    ],
    hasExpectedLabel: (evidence) =>
      evidence.includes("inscricao") &&
      (evidence.includes("gscemi") || /(^| )gs( |$)/.test(evidence)),
  },
  {
    target: "numDO",
    keys: ["numDO", "numero_declaracao_obito", "numero_do", "numeroDO"],
    canonicalKeys: ["numero_declaracao_obito", "numero_do"],
    legacyEvidenceKey: "__evidence_numero_declaracao_obito",
    allowedDocumentTypes: [
      "declaracao_obito",
      "certidao_obito",
      "tela_sistema_interno",
      "documento_sepultamento",
    ],
    hasExpectedLabel: (evidence) =>
      (evidence.includes("declaracao") && evidence.includes("obito")) ||
      /(^| )(n|no|numero) (da )?do( |$)/.test(evidence),
  },
  {
    target: "livroObito",
    keys: ["livroObito", "livro_obito"],
    canonicalKeys: ["livro_obito"],
    legacyEvidenceKey: "__evidence_livro_obito",
    allowedDocumentTypes: [
      "declaracao_obito",
      "certidao_obito",
      "livro_registro",
      "tela_sistema_interno",
      "documento_sepultamento",
    ],
    hasExpectedLabel: (evidence) => evidence.includes("livro") && evidence.includes("obito"),
  },
  {
    target: "placa",
    keys: ["placa", "placa_identificacao", "placaIdentificacao"],
    canonicalKeys: ["placa_identificacao", "termo_numero_controle"],
    legacyEvidenceKey: "__evidence_placa_identificacao",
    allowedDocumentTypes: [
      "cadastro_jazigo",
      "registro_jazigo",
      "tela_sistema_interno",
      "documento_sepultamento",
    ],
    hasExpectedLabel: (evidence) =>
      (evidence.includes("placa") && evidence.includes("identificacao")) ||
      (evidence.includes("termo") && evidence.includes("controle")),
  },
];

/**
 * Identificadores administrativos só entram na Ordem de Sepultamento quando
 * existe prova literal do rótulo e do valor na imagem de origem, ou quando o
 * operador confirmou o campo manualmente. Sem prova, o documento fica em branco.
 */
export function guardBurialOrderSourceFields(
  rawInput: Record<string, unknown>,
  aliasedOutput: Record<string, string>,
): Record<string, string> {
  const output = { ...aliasedOutput };
  const meta = visionMeta(rawInput);

  for (const rule of PROTECTED_FIELDS) {
    const value = String(output[rule.target] ?? "").trim();
    if (!value) continue;

    const manuallyConfirmed = isConfirmedByUser(rule, meta);
    const legacyEvidence = String(rawInput[rule.legacyEvidenceKey] ?? "");
    const supported =
      manuallyConfirmed ||
      supportsRuleEvidence(rule, legacyEvidence, value) ||
      hasVisionEvidence(rule, value, rawInput);

    if (!supported) output[rule.target] = "";
  }

  // "Quadra geral" descreve o tipo do sepultamento, não é número/nome de Rua.
  const location = normalizeText(output.quadraRua);
  if (location === "quadra geral" || location === "geral") output.quadraRua = "";

  return output;
}
