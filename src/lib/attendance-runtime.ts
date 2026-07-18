/**
 * Helpers puros usados pela tela de atendimento para reduzir consumo de
 * Run Credits (polling controlado, idempotência de extração, merge de
 * campos preservando edições manuais e atualização otimista de divergências).
 *
 * São funções puras — cobertas por testes unitários — para que a lógica
 * crítica de custo seja auditável sem depender do React.
 */

export const EXTRACT_LOCK_TTL_MS = 5 * 60 * 1000;
export const POLL_INTERVAL_MS = 5_000;
export const POLL_TIMEOUT_MS = 120_000;

/**
 * Estados terminais que devem interromper imediatamente qualquer polling
 * de status do atendimento.
 */
export const TERMINAL_ATTENDANCE_STATUSES: ReadonlySet<string> = new Set([
  "done",
  "completed",
  "error",
  "cancelled",
  "reviewing",
  "draft",
]);

export interface PollDecision {
  interval: number | false;
  startedAt: number | null;
  timedOut: boolean;
}

/**
 * Decide se o polling deve continuar. Retorna:
 * - interval `false` quando o status não é "extracting" ou o timeout
 *   máximo (120s) foi atingido.
 * - interval em ms quando ainda deve seguir consultando.
 */
export function decidePollInterval(params: {
  status: string | undefined | null;
  startedAt: number | null;
  now: number;
}): PollDecision {
  if (params.status !== "extracting") {
    return { interval: false, startedAt: null, timedOut: false };
  }
  const startedAt = params.startedAt ?? params.now;
  if (params.now - startedAt > POLL_TIMEOUT_MS) {
    return { interval: false, startedAt, timedOut: true };
  }
  return { interval: POLL_INTERVAL_MS, startedAt, timedOut: false };
}

/**
 * Verifica se é seguro disparar a extração automática.
 * Combina o guard local (`extracting`) com a proteção idempotente/persistente
 * (lockTimestamp em sessionStorage).
 */
export function canStartAutoExtract(params: {
  status: string | undefined | null;
  hasExtractedData: boolean;
  extracting: boolean;
  lockTimestamp: number | null;
  now: number;
}): boolean {
  if (params.status !== "extracting") return false;
  if (params.hasExtractedData) return false;
  if (params.extracting) return false;
  if (
    params.lockTimestamp !== null &&
    params.now - params.lockTimestamp < EXTRACT_LOCK_TTL_MS
  ) {
    return false;
  }
  return true;
}

/**
 * Assinatura estável do conteúdo extraído (ignora metadados internos).
 * Usada para detectar "nova versão real da extração" sem depender de
 * updated_at genérico.
 */
export function computeExtractedSignature(
  raw: Record<string, unknown> | null | undefined,
): string {
  if (!raw) return "";
  const entries: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "string") entries.push([k, v]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}=${v}`).join("|");
}

/**
 * Merge que respeita edições manuais do usuário e reaplica overrides
 * derivados (ex.: dados da triagem) sempre por cima.
 */
export function mergeFieldsPreservingEdits(params: {
  incoming: Record<string, string>;
  current: Record<string, string>;
  userEditedKeys: ReadonlySet<string>;
  overrides: Record<string, string>;
}): Record<string, string> {
  const next: Record<string, string> = { ...params.incoming };
  for (const key of params.userEditedKeys) {
    if (params.current[key] !== undefined) next[key] = params.current[key];
  }
  return { ...next, ...params.overrides };
}

/**
 * Remove uma divergência da estrutura consolidada do processo, sem
 * exigir refetch completo.
 */
export function removeDiscrepancyOptimistically<T extends { id?: string | null }>(
  processoDados: (Record<string, unknown> & { divergencias?: T[] }) | null | undefined,
  discrepancyId: string,
): (Record<string, unknown> & { divergencias: T[] }) | null {
  if (!processoDados) return null;
  const list = processoDados.divergencias ?? [];
  return {
    ...processoDados,
    divergencias: list.filter((d) => d.id !== discrepancyId),
  };
}
