// Detecta divergências entre campos vindos de documentos diferentes.
import type { Divergencia, DocumentoFonte } from "./types";
import { nameKey } from "./normalizers";

/** Campos que geram divergência quando comparados entre documentos. */
const CAMPOS_COMPARAVEIS = [
  "nome_falecido",
  "cpf_falecido",
  "data_obito",
  "data_sepultamento",
  "hora_sepultamento",
  "local_sepultamento",
  "grau_parentesco",
  "nome_responsavel",
] as const;

type Campo = (typeof CAMPOS_COMPARAVEIS)[number];

/** Alguns campos precisam de normalização suave antes de comparar. */
function normalizeForCompare(campo: Campo, value: string): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (campo === "nome_falecido" || campo === "nome_responsavel") return nameKey(v);
  if (campo === "cpf_falecido") return v.replace(/\D+/g, "");
  return v.toLowerCase();
}

export function detectDiscrepancies(docs: DocumentoFonte[]): Divergencia[] {
  const result: Divergencia[] = [];
  for (const campo of CAMPOS_COMPARAVEIS) {
    const found: Array<{ doc: DocumentoFonte; value: string }> = [];
    for (const doc of docs) {
      const raw = (doc.dadosExtraidos as Record<string, unknown>)[campo];
      if (raw === undefined || raw === null || String(raw).trim() === "") continue;
      found.push({ doc, value: String(raw) });
    }
    for (let i = 0; i < found.length; i += 1) {
      for (let j = i + 1; j < found.length; j += 1) {
        const a = found[i];
        const b = found[j];
        if (normalizeForCompare(campo, a.value) !== normalizeForCompare(campo, b.value)) {
          result.push({
            campo,
            valorA: a.value,
            valorB: b.value,
            docAId: a.doc.id,
            docBId: b.doc.id,
            confianca: 0.6,
            sugestao: a.doc.tipoDocumento === "DECLARACAO_DE_OBITO" ? a.value : b.value,
            status: "PENDENTE",
          });
        }
      }
    }
  }
  return result;
}
