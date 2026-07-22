import { describe, expect, it, vi } from "vitest";
import { extractSingleImage } from "../extract-image.server";

function geminiResponse(
  fields: Array<{ canonicalKey: string; confidence: number }>,
  warnings: string[],
) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              imageId: "img-1",
              documentType: "tela_sistema_interno",
              documentTypeConfidence: 0.95,
              documentTypeReason: "Tela legível",
              persons: [],
              fields: fields.map((field) => ({
                ...field,
                value: "valor",
                evidence: "consta no documento",
              })),
              warnings,
            }),
          },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const input = {
  imageId: "img-1",
  imageUrl: "data:image/jpeg;base64,dGVzdGU=",
  processLabel: "sepultamento",
};

describe("extractSingleImage — caminho rápido", () => {
  it("reverifica com Pro quando há muitos avisos", async () => {
    const doFetch = vi.fn(async () =>
      geminiResponse(
        [
          { canonicalKey: "nome_falecido", confidence: 0.93 },
          { canonicalKey: "inscricao_gscemi", confidence: 0.9 },
        ],
        ["aviso 1", "aviso 2", "aviso 3"],
      ),
    );

    const result = await extractSingleImage(input, {
      fetch: doFetch as typeof fetch,
      apiKey: "test-key",
    });

    expect(result.ok).toBe(true);
    expect(doFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(doFetch.mock.calls[1][1]?.body)).model).toBe("gemini-2.5-pro");
  });

  it("mantém a verificação para identificador importante muito incerto", async () => {
    const doFetch = vi.fn(async () =>
      geminiResponse([{ canonicalKey: "cpf_falecido", confidence: 0.4 }], []),
    );

    const result = await extractSingleImage(input, {
      fetch: doFetch as typeof fetch,
      apiKey: "test-key",
    });

    expect(result.ok).toBe(true);
    expect(doFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(doFetch.mock.calls[0][1]?.body)).model).toBe("gemini-2.5-flash");
    expect(JSON.parse(String(doFetch.mock.calls[1][1]?.body)).model).toBe("gemini-2.5-pro");
  });
});
