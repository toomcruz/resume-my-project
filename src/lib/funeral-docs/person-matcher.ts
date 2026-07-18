// Deduplicação de falecido entre documentos. Puro.
import type { Falecido } from "./types";
import { nameKey } from "./normalizers";

/** Retorna true se dois falecidos aparentam ser a MESMA pessoa. */
export function sameDeceased(a: Falecido, b: Falecido): boolean {
  const cpfA = a.cpf?.normalized;
  const cpfB = b.cpf?.normalized;
  if (cpfA && cpfB) return cpfA === cpfB;

  const nomeA = a.nome?.normalized ? nameKey(a.nome.normalized) : "";
  const nomeB = b.nome?.normalized ? nameKey(b.nome.normalized) : "";
  if (!nomeA || !nomeB) return false;
  if (nomeA !== nomeB) return false;

  // Nomes iguais + qualquer confirmação extra (nascimento, óbito, mãe, DO)
  const extras: Array<[string | undefined, string | undefined]> = [
    [a.dataNascimento?.normalized, b.dataNascimento?.normalized],
    [a.dataObito?.normalized, b.dataObito?.normalized],
    [a.nomeMae?.normalized ? nameKey(a.nomeMae.normalized) : undefined,
     b.nomeMae?.normalized ? nameKey(b.nomeMae.normalized) : undefined],
    [a.numeroDO?.normalized, b.numeroDO?.normalized],
  ];
  const matches = extras.filter(([x, y]) => x && y && x === y).length;
  const conflicts = extras.filter(([x, y]) => x && y && x !== y).length;
  if (conflicts > 0) return false;
  // Nome bate + nenhum conflito → considerar a mesma pessoa (matches>=0)
  return matches >= 0;
}

/** Funde dois falecidos preservando valores preexistentes (não sobrescreve). */
export function mergeDeceased(base: Falecido, incoming: Falecido): Falecido {
  const out = { ...base } as unknown as Record<string, unknown>;
  const src = incoming as unknown as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (key === "papel" || key === "id") continue;
    if (out[key] === undefined || out[key] === null) {
      out[key] = src[key];
    }
  }
  return out as unknown as Falecido;
}
