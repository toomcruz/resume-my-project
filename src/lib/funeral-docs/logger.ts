// Logger seguro: mascara CPF, RG e strings longas antes de imprimir.
import { maskCpf, maskRg } from "./normalizers";

const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const RG_RE = /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dxX]\b/g;

export function mask(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return value.replace(CPF_RE, (m) => maskCpf(m)).replace(RG_RE, (m) => maskRg(m));
  }
  if (Array.isArray(value)) return value.map(mask);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = mask(v);
    }
    return out;
  }
  return value;
}

export function logSafe(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.log(`[funeral-docs] ${message}`);
    return;
  }
  console.log(`[funeral-docs] ${message}`, mask(payload));
}
