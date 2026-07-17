/**
 * Reduz o `VisionState` (novo pipeline de extração por imagem) a um
 * mapa plano `Record<string, string>` compatível com o `extracted_data`
 * usado pelos modelos DOCX existentes.
 *
 * Precedência (do menor para o maior):
 *   1. Melhor valor bruto por canonicalKey (maior `confidence`).
 *   2. Campos derivados de pessoas consolidadas (`nome_falecido`, etc.).
 *   3. Campos confirmados pelo usuário (`confirmedFields`).
 *
 * Também devolve metadados por chave (confiança, conflito, origem) para
 * a UI destacar campos que precisam de revisão.
 */
import type { VisionState } from "./attendance-vision-store";
import type {
  ExtractedPerson,
  PersonRole,
  DocumentType,
} from "@/lib/domain/vision/types";

export type FlatFieldMeta = {
  key: string;
  value: string;
  confidence: number;
  source?: DocumentType | string;
  sourceImageId?: string;
  confirmedByUser?: boolean;
  hasConflict?: boolean;
};

type RoleKeyMap = {
  name?: string;
  cpf?: string;
  rg?: string;
  birth?: string;
  address?: string;
  phone?: string;
  email?: string;
};

const ROLE_TO_KEYS: Partial<Record<PersonRole, RoleKeyMap>> = {
  falecido_sepultamento: {
    name: "nome_falecido",
    cpf: "cpf_falecido",
    rg: "rg_falecido",
    birth: "data_nascimento",
    address: "endereco",
  },
  falecido_exumacao: {
    name: "nome_falecido",
    cpf: "cpf_falecido",
    birth: "data_nascimento",
  },
  falecido_exumacao_pps: {
    name: "nome_falecido",
    cpf: "cpf_falecido",
    birth: "data_nascimento",
  },
  responsavel: {
    name: "nome_responsavel",
    cpf: "cpf_responsavel",
    rg: "rg_responsavel",
    address: "endereco_responsavel",
    phone: "telefone",
    email: "email",
  },
  requerente: {
    name: "nome_requerente",
    cpf: "cpf_requerente",
    phone: "telefone",
  },
  concessionario: {
    name: "nome_concessionario",
    cpf: "cpf_concessionario",
  },
  sucessor: { name: "nome_sucessor", cpf: "cpf_sucessor" },
  declarante: { name: "nome_declarante", cpf: "cpf_declarante" },
  signatario: { name: "nome_signatario", cpf: "cpf_signatario" },
  autorizado: { name: "nome_autorizado", cpf: "cpf_autorizado" },
};

function bestRoleFor(person: ExtractedPerson): PersonRole | null {
  if (person.confirmedRoles && person.confirmedRoles.length) return person.confirmedRoles[0];
  let best: { role: PersonRole; c: number } | null = null;
  for (const cand of person.roleCandidates) {
    if (!best || cand.confidence > best.c) best = { role: cand.role, c: cand.confidence };
  }
  return best?.role ?? null;
}

export type FlattenResult = {
  flat: Record<string, string>;
  meta: Record<string, FlatFieldMeta>;
};

export function flattenVisionState(state: VisionState): FlattenResult {
  const flat: Record<string, string> = {};
  const meta: Record<string, FlatFieldMeta> = {};
  const conflictKeys = new Set(state.conflicts.map((c) => c.key));

  // 1) Melhor valor bruto por canonicalKey.
  type BestRaw = {
    value: string;
    confidence: number;
    docType?: DocumentType;
    sourceImageId: string;
  };
  const bestByKey = new Map<string, BestRaw>();
  for (const [imageId, raw] of Object.entries(state.rawByImage)) {
    if (!raw) continue;
    for (const field of raw.fields) {
      const value = field.value?.trim();
      if (!value) continue;
      const current = bestByKey.get(field.canonicalKey);
      if (!current || field.confidence > current.confidence) {
        bestByKey.set(field.canonicalKey, {
          value,
          confidence: field.confidence,
          docType: raw.documentType as DocumentType,
          sourceImageId: imageId,
        });
      }
    }
  }
  for (const [key, entry] of bestByKey.entries()) {
    flat[key] = entry.value;
    meta[key] = {
      key,
      value: entry.value,
      confidence: entry.confidence,
      source: entry.docType,
      sourceImageId: entry.sourceImageId,
      hasConflict: conflictKeys.has(key),
    };
  }

  // 2) Pessoas consolidadas → chaves por papel.
  for (const person of state.persons) {
    const role = bestRoleFor(person);
    if (!role) continue;
    const map = ROLE_TO_KEYS[role];
    if (!map) continue;
    const assign = (targetKey: string | undefined, value: string | undefined): void => {
      if (!targetKey || !value) return;
      if (flat[targetKey]) return; // já veio dos campos brutos
      flat[targetKey] = value;
      meta[targetKey] = {
        key: targetKey,
        value,
        confidence: person.confirmedByUser ? 1 : 0.7,
        confirmedByUser: person.confirmedByUser,
        sourceImageId: person.sourceImageIds[0],
      };
    };
    assign(map.name, person.name);
    assign(map.cpf, person.cpf);
    assign(map.rg, person.rg);
    assign(map.birth, person.birthDate);
    assign(map.address, person.address);
    assign(map.phone, person.phone);
    assign(map.email, person.email);
  }

  // 3) Confirmações do usuário sempre vencem.
  for (const [key, cf] of Object.entries(state.confirmedFields)) {
    flat[key] = cf.value;
    meta[key] = {
      key,
      value: cf.value,
      confidence: cf.confidence,
      source: cf.documentType,
      sourceImageId: cf.sourceImageId || undefined,
      confirmedByUser: cf.confirmedByUser,
      hasConflict: false,
    };
  }

  return { flat, meta };
}
