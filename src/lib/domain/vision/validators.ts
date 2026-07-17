/**
 * Validações determinísticas puras. Nenhuma delas altera o valor original
 * — todas retornam objetos com `valid`, `normalized` (formato canônico) e
 * `display` (formato brasileiro/humano). Nunca convertem string
 * administrativa para number (preservam zeros à esquerda).
 */

// ---------------- CPF ----------------

export type CpfValidation = {
  valid: boolean;
  normalized: string; // 11 dígitos, sem pontuação
  display: string; // 000.000.000-00
};

export function validateCpf(input: string | null | undefined): CpfValidation {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return { valid: false, normalized: digits, display: digits };
  if (/^(\d)\1{10}$/.test(digits)) {
    return { valid: false, normalized: digits, display: formatCpfDisplay(digits) };
  }

  const calcCheck = (base: string): number => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * (base.length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const d1 = calcCheck(digits.slice(0, 9));
  const d2 = calcCheck(digits.slice(0, 10));
  const valid = d1 === Number(digits[9]) && d2 === Number(digits[10]);
  return { valid, normalized: digits, display: formatCpfDisplay(digits) };
}

function formatCpfDisplay(d: string): string {
  if (d.length !== 11) return d;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// ---------------- Data ----------------

export type DateValidation = {
  valid: boolean;
  isoDate: string; // YYYY-MM-DD
  display: string; // DD/MM/YYYY
};

export function validateDate(input: string | null | undefined): DateValidation {
  const raw = String(input ?? "").trim();
  if (!raw) return { valid: false, isoDate: "", display: "" };

  // Aceita DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
  let year = 0;
  let month = 0;
  let day = 0;

  const brMatch = raw.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (brMatch) {
    day = Number(brMatch[1]);
    month = Number(brMatch[2]);
    year = Number(brMatch[3]);
  } else if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else {
    return { valid: false, isoDate: "", display: raw };
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  const valid =
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day;
  const iso = valid
    ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : "";
  const display = valid
    ? `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${String(year).padStart(4, "0")}`
    : raw;
  return { valid, isoDate: iso, display };
}

// ---------------- Telefone ----------------

export type PhoneValidation = {
  valid: boolean;
  normalized: string; // só dígitos
  display: string;
};

export function validatePhone(input: string | null | undefined): PhoneValidation {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length !== 10 && digits.length !== 11) {
    return { valid: false, normalized: digits, display: digits };
  }
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  const middle = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
  const suffix = rest.length === 9 ? rest.slice(5) : rest.slice(4);
  return {
    valid: true,
    normalized: digits,
    display: `(${ddd}) ${middle}-${suffix}`,
  };
}

// ---------------- CEP ----------------

export function validateCep(input: string | null | undefined): {
  valid: boolean;
  normalized: string;
  display: string;
} {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return { valid: false, normalized: digits, display: digits };
  return {
    valid: true,
    normalized: digits,
    display: `${digits.slice(0, 5)}-${digits.slice(5)}`,
  };
}

// ---------------- E-mail ----------------

export function validateEmail(input: string | null | undefined): {
  valid: boolean;
  normalized: string;
} {
  const raw = String(input ?? "").trim();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
  return { valid: ok, normalized: raw.toLowerCase() };
}

// ---------------- Horário ----------------

export function validateTime(input: string | null | undefined): {
  valid: boolean;
  normalized: string; // HH:mm
} {
  const raw = String(input ?? "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { valid: false, normalized: raw };
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) {
    return { valid: false, normalized: raw };
  }
  return { valid: true, normalized: `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}` };
}

// ---------------- Nome ----------------

export function normalizeName(input: string | null | undefined): string {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------- Identificadores administrativos ----------------

/**
 * Preserva zeros à esquerda. Nunca converte para number.
 * Aceita somente dígitos (livro, folha, inscrição). Se receber
 * caracteres não numéricos e `allowAlphanumeric` = false, invalida.
 */
export function normalizeAdministrativeId(
  input: string | null | undefined,
  { allowAlphanumeric = false }: { allowAlphanumeric?: boolean } = {},
): { valid: boolean; normalized: string } {
  const raw = String(input ?? "").trim();
  if (!raw) return { valid: false, normalized: "" };
  if (allowAlphanumeric) {
    return { valid: /^[A-Za-z0-9\-\/]+$/.test(raw), normalized: raw };
  }
  const onlyDigits = raw.replace(/\s+/g, "");
  return { valid: /^\d+$/.test(onlyDigits), normalized: onlyDigits };
}
