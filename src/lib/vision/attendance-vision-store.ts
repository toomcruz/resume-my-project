/**
 * Estado puro de sessão do assistente "Confirmar pessoas e informações".
 *
 * Implementado como reducer puro (zero dependência externa) para ser
 * consumido tanto por `useReducer` na UI quanto por testes isolados.
 *
 * Regras invioláveis:
 *
 * - Reprocessar uma imagem NÃO substitui campos com `confirmedByUser`.
 * - Remover uma imagem NÃO apaga um valor confirmado pelo usuário;
 *   apenas marca a fonte como ausente.
 * - Adicionar uma nova imagem NÃO reescreve confirmações anteriores.
 * - Conflitos exigem escolha explícita — nunca resolvidos silenciosamente.
 */
import type {
  ConfirmedField,
  ExtractedPerson,
  FieldConflict,
  ImageRecord,
  ImageStatus,
  PersonRole,
} from "@/lib/domain/vision/types";
import { consolidatePersons, mergePersonsById } from "@/lib/domain/vision/person-consolidation";
import type { ImageExtractionResponse } from "@/lib/vision/schema";

export type VisionState = {
  images: ImageRecord[];
  /** Última resposta bruta indexada por imageId (para reconsolidar). */
  rawByImage: Record<string, ImageExtractionResponse | undefined>;
  persons: ExtractedPerson[];
  /** Campos confirmados canonicamente. `confirmedByUser` sobrevive a reprocessos. */
  confirmedFields: Record<string, ConfirmedField>;
  conflicts: FieldConflict[];
};

export const initialVisionState: VisionState = {
  images: [],
  rawByImage: {},
  persons: [],
  confirmedFields: {},
  conflicts: [],
};

export type VisionAction =
  | { type: "add_image"; image: ImageRecord }
  | { type: "remove_image"; imageId: string }
  | { type: "set_image_status"; imageId: string; status: ImageStatus; error?: string }
  | { type: "ingest_extraction"; response: ImageExtractionResponse }
  | { type: "merge_persons"; keepId: string; dropId: string }
  | {
      type: "confirm_person_role";
      personId: string;
      role: PersonRole;
      confirmedByUser?: boolean;
    }
  | { type: "confirm_field"; field: ConfirmedField }
  | { type: "unconfirm_field"; key: string }
  | { type: "resolve_conflict"; key: string; chosenValue: string; sourceImageId: string }
  | { type: "reset" };

// ---------------------------------------------------------------------------

function reconsolidatePersons(state: VisionState): ExtractedPerson[] {
  const raws: Array<{ imageId: string; raw: ImageExtractionResponse["persons"][number] }> = [];
  for (const [imageId, raw] of Object.entries(state.rawByImage)) {
    if (!raw) continue;
    for (const p of raw.persons) raws.push({ imageId, raw: p });
  }
  const fresh = consolidatePersons(raws);
  // Preserva confirmações do estado anterior por CPF/RG/nome+data.
  for (const prev of state.persons) {
    if (!prev.confirmedByUser && !prev.confirmedRoles) continue;
    const match = fresh.find(
      (n) =>
        (prev.cpf && n.cpf === prev.cpf) ||
        (prev.rg && n.rg === prev.rg) ||
        (n.name === prev.name && n.birthDate === prev.birthDate),
    );
    if (match) {
      match.confirmedByUser = prev.confirmedByUser;
      match.confirmedRoles = prev.confirmedRoles;
    }
  }
  return fresh;
}

function rebuildConflicts(state: VisionState): FieldConflict[] {
  const byKey = new Map<string, FieldConflict["candidates"]>();
  for (const [imageId, raw] of Object.entries(state.rawByImage)) {
    if (!raw) continue;
    for (const f of raw.fields) {
      const value = f.value?.trim();
      if (!value) continue;
      const arr = byKey.get(f.canonicalKey) ?? [];
      arr.push({
        value,
        sourceImageId: imageId,
        documentType: raw.documentType as ConfirmedField["documentType"],
        evidence: f.evidence,
        confidence: f.confidence,
      });
      byKey.set(f.canonicalKey, arr);
    }
  }
  const out: FieldConflict[] = [];
  for (const [key, candidates] of byKey.entries()) {
    // Campo já confirmado pelo usuário não gera conflito.
    if (state.confirmedFields[key]?.confirmedByUser) continue;
    const distinct = new Set(candidates.map((c) => c.value));
    if (distinct.size > 1) out.push({ key, candidates });
  }
  return out;
}

// ---------------------------------------------------------------------------

export function visionReducer(state: VisionState, action: VisionAction): VisionState {
  switch (action.type) {
    case "reset":
      return initialVisionState;

    case "add_image": {
      if (state.images.some((i) => i.imageId === action.image.imageId)) return state;
      return { ...state, images: [...state.images, action.image] };
    }

    case "remove_image": {
      const nextImages = state.images.filter((i) => i.imageId !== action.imageId);
      const nextRaw = { ...state.rawByImage };
      delete nextRaw[action.imageId];
      const staged: VisionState = { ...state, images: nextImages, rawByImage: nextRaw };
      staged.persons = reconsolidatePersons(staged);
      staged.conflicts = rebuildConflicts(staged);
      // Valores confirmados sobrevivem — apenas marca fonte ausente.
      const nextConfirmed: Record<string, ConfirmedField> = {};
      for (const [k, cf] of Object.entries(state.confirmedFields)) {
        nextConfirmed[k] =
          cf.sourceImageId === action.imageId
            ? { ...cf, sourceImageId: "" } // fonte removida, valor mantido
            : cf;
      }
      staged.confirmedFields = nextConfirmed;
      return staged;
    }

    case "set_image_status": {
      return {
        ...state,
        images: state.images.map((i) =>
          i.imageId === action.imageId
            ? {
                ...i,
                status: action.status,
                errors: action.error ? [action.error] : i.errors,
                processedAt:
                  action.status === "concluida" || action.status === "erro"
                    ? new Date().toISOString()
                    : i.processedAt,
              }
            : i,
        ),
      };
    }

    case "ingest_extraction": {
      const { response } = action;
      const nextRaw = { ...state.rawByImage, [response.imageId]: response };
      const nextImages = state.images.map((i) =>
        i.imageId === response.imageId
          ? {
              ...i,
              status: "concluida" as ImageStatus,
              documentType: response.documentType as ImageRecord["documentType"],
              classificationConfidence: response.documentTypeConfidence,
              processedAt: new Date().toISOString(),
            }
          : i,
      );
      const staged: VisionState = { ...state, rawByImage: nextRaw, images: nextImages };
      staged.persons = reconsolidatePersons(staged);
      staged.conflicts = rebuildConflicts(staged);
      return staged;
    }

    case "merge_persons": {
      return {
        ...state,
        persons: mergePersonsById(state.persons, action.keepId, action.dropId),
      };
    }

    case "confirm_person_role": {
      return {
        ...state,
        persons: state.persons.map((p) =>
          p.id === action.personId
            ? {
                ...p,
                confirmedByUser: action.confirmedByUser ?? true,
                confirmedRoles: Array.from(
                  new Set([...(p.confirmedRoles ?? []), action.role]),
                ),
              }
            : p,
        ),
      };
    }

    case "confirm_field": {
      const next = {
        ...state,
        confirmedFields: {
          ...state.confirmedFields,
          [action.field.key]: { ...action.field, confirmedByUser: true },
        },
      };
      next.conflicts = rebuildConflicts(next);
      return next;
    }

    case "unconfirm_field": {
      const nextConfirmed = { ...state.confirmedFields };
      delete nextConfirmed[action.key];
      const staged: VisionState = { ...state, confirmedFields: nextConfirmed };
      staged.conflicts = rebuildConflicts(staged);
      return staged;
    }

    case "resolve_conflict": {
      const cands = state.conflicts.find((c) => c.key === action.key);
      const evidence = cands?.candidates.find((x) => x.value === action.chosenValue)?.evidence ?? "";
      const docType = (cands?.candidates[0]?.documentType ??
        "desconhecido") as ConfirmedField["documentType"];
      return visionReducer(state, {
        type: "confirm_field",
        field: {
          key: action.key,
          value: action.chosenValue,
          sourceImageId: action.sourceImageId,
          documentType: docType,
          evidence,
          confidence: 1,
          rawValue: action.chosenValue,
          normalizedValue: action.chosenValue,
          confirmedByUser: true,
        },
      });
    }

    default:
      return state;
  }
}
