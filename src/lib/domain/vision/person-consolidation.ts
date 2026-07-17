import type { ExtractedPerson, ExtractedPersonRaw, RoleCandidate } from "./types";
import { normalizeName, validateCpf } from "./validators";

/**
 * Consolidação de pessoas extraídas em múltiplas imagens em um único
 * conjunto sem duplicatas.
 *
 * Nunca funde só por semelhança de nome. A fusão só acontece quando há
 * uma evidência forte de identidade:
 *
 *   1. CPF idêntico e válido;
 *   2. RG idêntico;
 *   3. Nome exato + data de nascimento;
 *   4. Nome exato + telefone;
 *   5. Nome exato + endereço.
 *
 * Nomes semelhantes sem outra evidência são mantidos separados. O
 * usuário pode uni-los explicitamente através da UI.
 */

export type RawPersonWithImage = {
  imageId: string;
  raw: ExtractedPersonRaw;
};

function normalizeCpf(cpf: string | undefined): string | undefined {
  if (!cpf) return undefined;
  const v = validateCpf(cpf);
  return v.normalized.length === 11 ? v.normalized : undefined;
}

function normalizeRg(rg: string | undefined): string | undefined {
  if (!rg) return undefined;
  const n = String(rg).replace(/\W/g, "").toUpperCase();
  return n.length >= 5 ? n : undefined;
}

function normalizeNameKey(name: string): string {
  return normalizeName(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function samePerson(a: ExtractedPerson, b: ExtractedPersonRaw): boolean {
  const aCpf = normalizeCpf(a.cpf);
  const bCpf = normalizeCpf(b.cpf);
  if (aCpf && bCpf) return aCpf === bCpf;

  const aRg = normalizeRg(a.rg);
  const bRg = normalizeRg(b.rg);
  if (aRg && bRg && aRg === bRg) return true;

  const aName = normalizeNameKey(a.name);
  const bName = normalizeNameKey(b.name);
  if (!aName || !bName || aName !== bName) return false;

  if (a.birthDate && b.birthDate && a.birthDate === b.birthDate) return true;
  if (a.phone && b.phone && a.phone.replace(/\D/g, "") === b.phone.replace(/\D/g, "")) {
    return true;
  }
  if (
    a.address &&
    b.address &&
    normalizeName(a.address).toLowerCase() === normalizeName(b.address).toLowerCase()
  ) {
    return true;
  }
  return false;
}

function mergePreferring<T>(a: T | undefined, b: T | undefined): T | undefined {
  return a ?? b;
}

/**
 * Recebe todas as pessoas extraídas (uma lista por imagem, achatada em
 * pares `{imageId, raw}`) e devolve a lista consolidada.
 */
export function consolidatePersons(
  input: RawPersonWithImage[],
  makeId: () => string = () => cryptoRandomId(),
): ExtractedPerson[] {
  const out: ExtractedPerson[] = [];

  for (const item of input) {
    const raw = item.raw;
    const existing = out.find((p) => samePerson(p, raw));
    const roleCandidates: RoleCandidate[] = raw.roleCandidates.map((c) => ({
      role: c.role,
      confidence: c.confidence,
      evidence: c.evidence,
      sourceImageId: item.imageId,
    }));

    if (existing) {
      existing.cpf = mergePreferring(existing.cpf, raw.cpf);
      existing.rg = mergePreferring(existing.rg, raw.rg);
      existing.birthDate = mergePreferring(existing.birthDate, raw.birthDate);
      existing.address = mergePreferring(existing.address, raw.address);
      existing.phone = mergePreferring(existing.phone, raw.phone);
      existing.email = mergePreferring(existing.email, raw.email);
      existing.roleCandidates.push(...roleCandidates);
      if (!existing.sourceImageIds.includes(item.imageId)) {
        existing.sourceImageIds.push(item.imageId);
      }
    } else {
      out.push({
        id: makeId(),
        name: normalizeName(raw.name),
        cpf: raw.cpf,
        rg: raw.rg,
        birthDate: raw.birthDate,
        address: raw.address,
        phone: raw.phone,
        email: raw.email,
        roleCandidates,
        sourceImageIds: [item.imageId],
      });
    }
  }

  return out;
}

/** União manual de duas pessoas (respostas a "é a mesma pessoa?"). */
export function mergePersonsById(
  persons: ExtractedPerson[],
  keepId: string,
  dropId: string,
): ExtractedPerson[] {
  const keep = persons.find((p) => p.id === keepId);
  const drop = persons.find((p) => p.id === dropId);
  if (!keep || !drop || keep === drop) return persons;

  keep.cpf = mergePreferring(keep.cpf, drop.cpf);
  keep.rg = mergePreferring(keep.rg, drop.rg);
  keep.birthDate = mergePreferring(keep.birthDate, drop.birthDate);
  keep.address = mergePreferring(keep.address, drop.address);
  keep.phone = mergePreferring(keep.phone, drop.phone);
  keep.email = mergePreferring(keep.email, drop.email);
  keep.roleCandidates.push(...drop.roleCandidates);
  for (const id of drop.sourceImageIds) {
    if (!keep.sourceImageIds.includes(id)) keep.sourceImageIds.push(id);
  }
  if (drop.confirmedByUser) keep.confirmedByUser = true;
  if (drop.confirmedRoles) {
    keep.confirmedRoles = Array.from(
      new Set([...(keep.confirmedRoles ?? []), ...drop.confirmedRoles]),
    );
  }
  return persons.filter((p) => p.id !== dropId);
}

function cryptoRandomId(): string {
  // Fallback simples para ambientes sem crypto.randomUUID (Node antigo).
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
