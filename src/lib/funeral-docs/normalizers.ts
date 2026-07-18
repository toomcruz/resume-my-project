// Normalizadores puros. Guardam original + normalized; nunca sobrescrevem.

export interface Normalized<T = string> {
  original: string;
  normalized: T;
  confianca: number;
}

const wrap = <T>(original: string, normalized: T, confianca = 1): Normalized<T> => ({
  original,
  normalized,
  confianca,
});

export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function normalizeName(input: string): Normalized {
  const cleaned = normalizeWhitespace(input)
    .replace(/[^\p{L}\s'.-]/gu, "")
    .toUpperCase();
  return wrap(input, cleaned, cleaned ? 1 : 0);
}

export function nameKey(input: string): string {
  return normalizeWhitespace(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeCpf(input: string): Normalized {
  const digits = (input || "").replace(/\D+/g, "");
  if (digits.length !== 11) return wrap(input, "", 0);
  const formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  return wrap(input, formatted, 1);
}

export function maskCpf(cpf: string): string {
  const digits = (cpf || "").replace(/\D+/g, "");
  if (digits.length !== 11) return "***";
  return `***.***.***-${digits.slice(9, 11)}`;
}

export function normalizeRg(input: string): Normalized {
  const cleaned = (input || "").replace(/\s+/g, "").toUpperCase();
  return wrap(input, cleaned, cleaned ? 0.9 : 0);
}

export function maskRg(rg: string): string {
  const cleaned = (rg || "").replace(/\s+/g, "");
  if (cleaned.length < 3) return "***";
  return `***${cleaned.slice(-3)}`;
}

export function normalizePhone(input: string): Normalized {
  const digits = (input || "").replace(/\D+/g, "");
  if (digits.length < 10 || digits.length > 11) return wrap(input, digits, 0.4);
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  const formatted =
    rest.length === 9 ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}` : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return wrap(input, formatted, 1);
}

export function normalizeDate(input: string): Normalized {
  const s = (input || "").trim();
  const brMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (brMatch) {
    const d = brMatch[1].padStart(2, "0");
    const m = brMatch[2].padStart(2, "0");
    let y = brMatch[3];
    if (y.length === 2) y = Number(y) > 30 ? `19${y}` : `20${y}`;
    return wrap(input, `${d}/${m}/${y}`, 1);
  }
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return wrap(input, `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`, 1);
  return wrap(input, "", 0);
}

export function normalizeTime(input: string): Normalized {
  const s = (input || "").trim();
  const m = s.match(/^(\d{1,2})[h:](\d{2})/i);
  if (!m) return wrap(input, "", 0);
  const h = m[1].padStart(2, "0");
  return wrap(input, `${h}:${m[2]}`, 1);
}

export function normalizeMoney(input: string): Normalized<number> {
  const s = (input || "").replace(/[^\d,.-]/g, "").trim();
  if (!s) return { original: input, normalized: 0, confianca: 0 };
  // BR: usa vírgula como decimal
  const usesComma = s.lastIndexOf(",") > s.lastIndexOf(".");
  const cleaned = usesComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { original: input, normalized: 0, confianca: 0 };
  return { original: input, normalized: value, confianca: 1 };
}

const parentescoMap: Record<string, string> = {
  filha: "FILHA",
  filho: "FILHO",
  esposa: "ESPOSA",
  esposo: "ESPOSO",
  marido: "ESPOSO",
  mae: "MAE",
  mãe: "MAE",
  pai: "PAI",
  irma: "IRMA",
  irmã: "IRMA",
  irmao: "IRMAO",
  irmão: "IRMAO",
  neta: "NETA",
  neto: "NETO",
  sobrinha: "SOBRINHA",
  sobrinho: "SOBRINHO",
  cunhada: "CUNHADA",
  cunhado: "CUNHADO",
  tia: "TIA",
  tio: "TIO",
  prima: "PRIMA",
  primo: "PRIMO",
  companheira: "COMPANHEIRA",
  companheiro: "COMPANHEIRO",
};

export function normalizeParentesco(input: string): Normalized {
  const key = nameKey(input);
  const found = parentescoMap[key];
  return wrap(input, found ?? key.toUpperCase(), found ? 1 : 0.4);
}
