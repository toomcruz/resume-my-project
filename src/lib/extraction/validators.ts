// Validadores determinísticos. A IA nunca decide validade; estas funções sim.
// Cada função é pura e retorna ValidationOutcome.

import type { ValidationOutcome } from "./types";

const invalid = (reason: string): ValidationOutcome => ({ ok: false, reason });
const valid = (normalized: string): ValidationOutcome => ({ ok: true, normalized });

// ---------- CPF ----------
export function validateCPF(input: string): ValidationOutcome {
  if (typeof input !== "string") return invalid("Valor não é texto");
  const digits = input.replace(/\D+/g, "");
  if (digits.length !== 11) return invalid("CPF precisa ter 11 dígitos");
  if (/^(\d)\1{10}$/.test(digits)) return invalid("CPF com dígitos repetidos");

  const calcCheck = (base: string, factor: number): number => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += Number.parseInt(base[i], 10) * (factor - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calcCheck(digits.slice(0, 9), 10);
  const d2 = calcCheck(digits.slice(0, 10), 11);
  if (d1 !== Number.parseInt(digits[9], 10) || d2 !== Number.parseInt(digits[10], 10)) {
    return invalid("Dígitos verificadores inválidos");
  }

  const formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  return valid(formatted);
}

// ---------- Datas ----------
// Aceita DD/MM/AAAA (com - ou . como separador). Devolve normalização em ISO (YYYY-MM-DD).
export function validateDateBR(input: string): ValidationOutcome {
  if (typeof input !== "string") return invalid("Valor não é texto");
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})$/);
  if (!match) return invalid("Formato esperado DD/MM/AAAA");
  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  if (month < 1 || month > 12) return invalid("Mês inválido");
  if (day < 1 || day > 31) return invalid("Dia inválido");
  if (year < 1900 || year > 2100) return invalid("Ano fora de faixa razoável");

  // valida dia real do mês (bissexto etc.) sem usar timezone
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return invalid("Data impossível");
  }

  const iso = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return valid(iso);
}

// ---------- Horários ----------
export function validateTime(input: string): ValidationOutcome {
  if (typeof input !== "string") return invalid("Valor não é texto");
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return invalid("Formato esperado HH:mm");
  const h = Number.parseInt(match[1], 10);
  const m = Number.parseInt(match[2], 10);
  if (h < 0 || h > 23) return invalid("Hora fora de 00–23");
  if (m < 0 || m > 59) return invalid("Minutos fora de 00–59");
  return valid(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
}

// ---------- CEP ----------
export function validateCEP(input: string): ValidationOutcome {
  if (typeof input !== "string") return invalid("Valor não é texto");
  const digits = input.replace(/\D+/g, "");
  if (digits.length !== 8) return invalid("CEP precisa ter 8 dígitos");
  return valid(`${digits.slice(0, 5)}-${digits.slice(5)}`);
}

// ---------- Telefone BR ----------
// Aceita 10 dígitos (fixo) ou 11 dígitos (celular). Não inventa dígito faltante.
export function validatePhoneBR(input: string): ValidationOutcome {
  if (typeof input !== "string") return invalid("Valor não é texto");
  const digits = input.replace(/\D+/g, "");
  if (digits.length !== 10 && digits.length !== 11) {
    return invalid("Telefone precisa ter 10 ou 11 dígitos");
  }
  const ddd = digits.slice(0, 2);
  if (Number.parseInt(ddd, 10) < 11) return invalid("DDD inválido");
  const rest = digits.slice(2);
  const formatted =
    rest.length === 9
      ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
      : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return valid(formatted);
}

// ---------- E-mail ----------
export function validateEmail(input: string): ValidationOutcome {
  if (typeof input !== "string") return invalid("Valor não é texto");
  const trimmed = input.trim();
  // Regex intencionalmente simples; casos edge são revisados pelo humano.
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  if (!ok) return invalid("Formato de e-mail inválido");
  return valid(trimmed.toLowerCase());
}

// ---------- Nome ----------
// Colapsa espaços internos, remove espaços nas pontas, preserva acentos e capitalização.
export function sanitizeName(input: string): ValidationOutcome {
  if (typeof input !== "string") return invalid("Valor não é texto");
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) return invalid("Nome vazio");
  return valid(normalized);
}

// ---------- Preservação de zeros à esquerda ----------
// Nunca converter para Number. Mantém string, remove espaços.
export function preserveLeadingZeros(input: string): ValidationOutcome {
  if (typeof input !== "string") return invalid("Valor não é texto");
  const normalized = input.trim();
  if (!normalized) return invalid("Valor vazio");
  return valid(normalized);
}

// ---------- Registro central (usado pelo catálogo) ----------
export type ValidatorName =
  | "cpf"
  | "date"
  | "time"
  | "cep"
  | "phone"
  | "email"
  | "name"
  | "preserve";

export const VALIDATORS: Record<ValidatorName, (v: string) => ValidationOutcome> = {
  cpf: validateCPF,
  date: validateDateBR,
  time: validateTime,
  cep: validateCEP,
  phone: validatePhoneBR,
  email: validateEmail,
  name: sanitizeName,
  preserve: preserveLeadingZeros,
};
