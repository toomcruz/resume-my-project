// Resolvedor alias → chave canônica. Fina camada sobre o catálogo,
// exposta separadamente para uso em normalizadores e testes.

import { canonicalize } from "./field-catalog";

export function resolveAlias(input: string): string | null {
  return canonicalize(input);
}

/**
 * Reescreve um objeto plano usando chaves canônicas.
 * - Se uma chave não tem alias conhecido, é preservada como veio.
 * - Se duas chaves diferentes canonizam para a mesma chave, prevalece o primeiro valor não vazio.
 */
export function rewriteKeysToCanonical(
  input: Record<string, string>,
): { rewritten: Record<string, string>; unknown: string[] } {
  const rewritten: Record<string, string> = {};
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    const canonical = resolveAlias(key);
    if (!canonical) {
      unknown.push(key);
      if (!(key in rewritten)) rewritten[key] = value;
      continue;
    }
    const current = rewritten[canonical];
    if (!current || current.trim() === "") rewritten[canonical] = value;
  }
  return { rewritten, unknown };
}
