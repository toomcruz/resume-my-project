import type {
  DocumentType,
  ExtractedPerson,
  PersonRole,
  ProcessKind,
  RoleCandidate,
} from "./types";
import { expectedRolesForProcess, processHasJazigo } from "./document-types";

/**
 * Regras determinísticas de inferência de papéis. As regras
 * *sugerem* candidatos com confiança calculada, mas nunca atribuem
 * automaticamente. A confirmação final vem do usuário.
 *
 * Regras estritas:
 *
 * - Titular de certidão/declaração de óbito → candidato forte a
 *   `falecido_sepultamento` (ou `_exumacao` conforme processo).
 * - Declarante da certidão de óbito NÃO vira responsável.
 * - Concessionário exige evidência específica de concessão (cadastro
 *   de jazigo, campo "Concessionário", "Permissionário", "Titular
 *   da concessão"). Responsável pelo atendimento não vira
 *   concessionário automaticamente.
 * - No fluxo PPS mantém dois falecidos distintos:
 *   `falecido_sepultamento` e `falecido_exumacao_pps`.
 */

const CONCESSIONARIO_EVIDENCE_TOKENS = [
  "concessionário",
  "concessionario",
  "permissionário",
  "permissionario",
  "titular da concessão",
  "titular da concessao",
  "titular do jazigo",
  "cadastro de jazigo",
  "cadastro do jazigo",
  "sucessor cadastrado",
];

const RESPONSAVEL_EVIDENCE_TOKENS = [
  "responsável",
  "responsavel",
  "requerente",
  "solicitante",
  "pessoa autorizada",
  "autorizado",
];

const FALECIDO_EVIDENCE_TOKENS = [
  "nome do falecido",
  "falecido",
  "despojos de",
  "titular da certidão",
  "titular da declaração",
  "sepultado",
  "exumado",
];

const DECLARANTE_TOKENS = ["declarante"];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function hasToken(haystack: string, tokens: string[]): boolean {
  const n = normalize(haystack);
  return tokens.some((t) => n.includes(normalize(t)));
}

/**
 * Filtra candidatos de papéis aplicando as regras de negócio. Não
 * altera a pessoa; devolve os candidatos que devem ser SUGERIDOS
 * (com confiança já ajustada).
 */
export function filterRoleCandidates(
  candidates: RoleCandidate[],
  ctx: {
    documentTypeById?: Record<string, DocumentType | undefined>;
    process?: ProcessKind;
  } = {},
): RoleCandidate[] {
  const process = ctx.process;
  const allowed = process ? new Set<PersonRole>(expectedRolesForProcess(process)) : null;
  const jazigo = process ? processHasJazigo(process) : true;

  return candidates
    .map((c) => {
      const doc = ctx.documentTypeById?.[c.sourceImageId];

      // Regra: declarante NUNCA vira automaticamente responsável.
      if (c.role === "responsavel" && hasToken(c.evidence, DECLARANTE_TOKENS)) {
        return null;
      }

      // Regra: concessionário exige evidência específica.
      if (c.role === "concessionario") {
        if (!jazigo) return null;
        const strong =
          hasToken(c.evidence, CONCESSIONARIO_EVIDENCE_TOKENS) ||
          doc === "cadastro_jazigo" ||
          doc === "registro_jazigo";
        if (!strong) return null;
      }

      // Regra: responsável exige evidência de responsabilidade.
      if (c.role === "responsavel") {
        const strong = hasToken(c.evidence, RESPONSAVEL_EVIDENCE_TOKENS);
        if (!strong) {
          // rebaixa a confiança
          return { ...c, confidence: Math.min(c.confidence, 0.6) };
        }
      }

      // Regra: falecido — titular de certidão/declaração é forte.
      if (
        c.role === "falecido_sepultamento" ||
        c.role === "falecido_exumacao" ||
        c.role === "falecido_exumacao_pps"
      ) {
        const strong =
          hasToken(c.evidence, FALECIDO_EVIDENCE_TOKENS) ||
          doc === "certidao_obito" ||
          doc === "declaracao_obito" ||
          doc === "documento_sepultamento" ||
          doc === "documento_exumacao";
        if (!strong) {
          return { ...c, confidence: Math.min(c.confidence, 0.5) };
        }
      }

      return c;
    })
    .filter((c): c is RoleCandidate => c !== null)
    .filter((c) => (allowed ? allowed.has(c.role) : true));
}

/**
 * Para cada pessoa, devolve o(s) papel(is) que deve(m) ser sugerido(s)
 * com maior confiança, respeitando o processo.
 */
export function suggestedRolesForPerson(
  person: ExtractedPerson,
  ctx: {
    documentTypeById?: Record<string, DocumentType | undefined>;
    process?: ProcessKind;
  } = {},
): PersonRole[] {
  const filtered = filterRoleCandidates(person.roleCandidates, ctx);
  const byRole = new Map<PersonRole, number>();
  for (const c of filtered) {
    byRole.set(c.role, Math.max(byRole.get(c.role) ?? 0, c.confidence));
  }
  return [...byRole.entries()]
    .filter(([, conf]) => conf >= 0.75)
    .sort((a, b) => b[1] - a[1])
    .map(([role]) => role);
}
