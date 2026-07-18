import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildTemplatePayload,
  getCanonicalKeysForDocument,
} from "@/lib/domain/template-payload";
import type { DocumentSlug } from "@/lib/domain/types";

describe("buildTemplatePayload", () => {
  describe("happy paths", () => {
    it("maps canonical data to declared placeholders for a document", () => {
      const { payload, missing } = buildTemplatePayload({
        documentSlug: "identificacao-sala-velorio",
        canonicalData: {
          nome_falecido_sepultamento: "João da Silva",
          sala_velorio: "Sala 2",
          inicio_velorio: "08:00",
          fim_velorio: "12:00",
          data_sepultamento: "01/01/2026",
        },
      });
      expect(payload).toEqual({
        nomeFal: "João da Silva",
        sala: "Sala 2",
        inicio: "08:00",
        fim: "12:00",
        data: "01/01/2026",
      });
      expect(missing).toEqual([]);
    });

    it("preserves leading zeros (strings, never coerces to number)", () => {
      const { payload } = buildTemplatePayload({
        documentSlug: "ordem-sepultamento",
        canonicalData: {
          inscricao_gscemi: "0001234",
          livro_obito: "007",
          nome_falecido_sepultamento: "X",
        },
      });
      expect(payload.inscrGS).toBe("0001234");
      expect(payload.livroObito).toBe("007");
    });

    it("routes exumacao name to PPS canonical key when ppsExumacao=true", () => {
      const { payload } = buildTemplatePayload({
        documentSlug: "ordem-exumacao",
        canonicalData: {
          nome_falecido_exumacao: "regular",
          nome_falecido_exumacao_pps: "pps-name",
        },
        confirmedRoles: { ppsExumacao: true },
      });
      expect(payload.nomeFal).toBe("pps-name");
    });

    it("uses non-pps canonical key when ppsExumacao is false/absent", () => {
      const { payload } = buildTemplatePayload({
        documentSlug: "ordem-exumacao",
        canonicalData: {
          nome_falecido_exumacao: "regular",
          nome_falecido_exumacao_pps: "pps-name",
        },
      });
      expect(payload.nomeFal).toBe("regular");
    });
  });

  describe("auto date fallback", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // 15 July 2026 12:00 UTC → 09:00 São Paulo (UTC-3)
      vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("fills data_atual and data_atual_extenso automatically when missing", () => {
      const { payload, missing } = buildTemplatePayload({
        documentSlug: "ordem-sepultamento",
        canonicalData: {
          nome_falecido_sepultamento: "X",
        },
      });
      expect(payload.dataAtual).toBe("15/07/2026");
      expect(payload.dataExt).toMatch(/^São Paulo, 15 de julho de 2026$/);
      expect(missing).not.toContain("dataAtual");
      expect(missing).not.toContain("dataExt");
    });

    it("always overrides data_atual with the automatic value, ignoring extracted input", () => {
      const { payload } = buildTemplatePayload({
        documentSlug: "ordem-sepultamento",
        canonicalData: {
          data_atual: "31/12/1999",
          data_atual_extenso: "custom",
        },
      });
      expect(payload.dataAtual).toBe("15/07/2026");
      expect(payload.dataExt).toMatch(/^São Paulo, 15 de julho de 2026$/);
    });
  });

  describe("edge cases", () => {
    it("returns empty payload/missing for an unknown documentSlug", () => {
      const result = buildTemplatePayload({
        documentSlug: "does-not-exist" as unknown as DocumentSlug,
        canonicalData: {},
      });
      expect(result).toEqual({ payload: {}, missing: [] });
    });

    it("lists all placeholders as missing when canonical data is empty", () => {
      const { payload, missing } = buildTemplatePayload({
        documentSlug: "condolencias",
        canonicalData: {},
      });
      expect(payload).toEqual({});
      expect(missing.sort()).toEqual(["data", "nomeFal", "sala"].sort());
    });

    it("treats empty-string canonical values as missing", () => {
      const { payload, missing } = buildTemplatePayload({
        documentSlug: "condolencias",
        canonicalData: {
          nome_falecido_sepultamento: "",
          sala_velorio: "  ok  ",
          data_sepultamento: "",
        },
      });
      expect(payload.sala).toBe("  ok  "); // does not trim; preservation is intentional
      expect(missing).toContain("nomeFal");
      expect(missing).toContain("data");
      expect(missing).not.toContain("sala");
    });

    it("ignores canonical keys not referenced by the document map", () => {
      const { payload } = buildTemplatePayload({
        documentSlug: "condolencias",
        canonicalData: {
          nome_falecido_sepultamento: "X",
          sala_velorio: "S",
          data_sepultamento: "D",
          totally_unrelated: "leak?",
        },
      });
      expect(payload).not.toHaveProperty("totally_unrelated");
    });
  });
});

describe("getCanonicalKeysForDocument", () => {
  it("returns the deduplicated list of canonical keys used by a document", () => {
    const keys = getCanonicalKeysForDocument("atualizacao-cadastral");
    // "quadra"/"terreno"/"livro"/"folha" appear twice in the map → must dedupe
    const counts = keys.reduce<Record<string, number>>((acc, k) => {
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    for (const c of Object.values(counts)) expect(c).toBe(1);
    expect(keys).toContain("quadra");
    expect(keys).toContain("data_atual");
  });

  it("returns a stable set of keys for every known document", () => {
    const slugs: DocumentSlug[] = [
      "identificacao-sala-velorio",
      "condolencias",
      "ordem-sepultamento",
      "ordem-exumacao",
      "termo-compromisso-responsabilidade",
      "aquisicao-renovacao-ossuario",
      "guia-exumacao-semi-intacto",
      "memorando-autorizacao-translado",
      "atualizacao-cadastral",
    ];
    for (const slug of slugs) {
      const keys = getCanonicalKeysForDocument(slug);
      expect(Array.isArray(keys)).toBe(true);
      expect(keys.length).toBeGreaterThan(0);
    }
  });

  it("returns empty array for an unknown documentSlug", () => {
    expect(
      getCanonicalKeysForDocument("nope" as unknown as DocumentSlug),
    ).toEqual([]);
  });
});
