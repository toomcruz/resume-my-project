import { describe, it, expect } from "vitest";
import { extractImageBatch } from "../extract-batch.server";
import type { ExtractImageInput, ExtractImageOutcome } from "../extract-image.server";

function mkInput(id: string): ExtractImageInput {
  return { imageId: id, imageUrl: `https://x/${id}.jpg`, processLabel: "teste" };
}

describe("extractImageBatch — teste 5 e 6", () => {
  it("teste 5 — imagens são processadas independentemente", async () => {
    const seen: string[] = [];
    const results = await extractImageBatch(
      [mkInput("a"), mkInput("b"), mkInput("c")],
      {
        concurrency: 2,
        extract: async (input): Promise<ExtractImageOutcome> => {
          seen.push(input.imageId);
          return {
            ok: true,
            durationMs: 1,
            data: {
              imageId: input.imageId,
              documentType: "rg",
              documentTypeConfidence: 0.9,
              documentTypeReason: "",
              persons: [],
              fields: [],
              warnings: [],
            },
          };
        },
      },
    );
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(new Set(seen)).toEqual(new Set(["a", "b", "c"]));
  });

  it("teste 6 — erro em uma imagem não bloqueia as outras", async () => {
    const results = await extractImageBatch(
      [mkInput("ok1"), mkInput("bad"), mkInput("ok2")],
      {
        concurrency: 2,
        extract: async (input): Promise<ExtractImageOutcome> => {
          if (input.imageId === "bad") {
            return { ok: false, durationMs: 1, error: "boom" };
          }
          return {
            ok: true,
            durationMs: 1,
            data: {
              imageId: input.imageId,
              documentType: "cpf",
              documentTypeConfidence: 0.8,
              documentTypeReason: "",
              persons: [],
              fields: [],
              warnings: [],
            },
          };
        },
      },
    );
    const byId = Object.fromEntries(results.map((r) => [r.imageId, r]));
    expect(byId.ok1.ok).toBe(true);
    expect(byId.ok2.ok).toBe(true);
    expect(byId.bad.ok).toBe(false);
  });

  it("captura throw síncrono do extractor sem derrubar o lote", async () => {
    const results = await extractImageBatch([mkInput("a"), mkInput("b")], {
      concurrency: 2,
      extract: async (input) => {
        if (input.imageId === "a") throw new Error("crash");
        return {
          ok: true,
          durationMs: 1,
          data: {
            imageId: input.imageId,
            documentType: "rg",
            documentTypeConfidence: 0.5,
            documentTypeReason: "",
            persons: [],
            fields: [],
            warnings: [],
          },
        };
      },
    });
    expect(results[0].ok).toBe(false);
    expect(results[1].ok).toBe(true);
  });
});
