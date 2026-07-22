/**
 * Server fn para ler o número da placa de identificação a partir de UM
 * print/foto enviado pelo usuário. Reutiliza o mesmo gateway Gemini
 * (`extractFromImages`) para não introduzir novas dependências.
 *
 * A resposta NÃO é gravada automaticamente — a UI mostra "Placa
 * encontrada: XXXXX" e exige confirmação manual (§5 da spec).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ReadPlacaInput = z.object({
  /** data URL ou https URL da imagem. */
  imageDataUrl: z.string().refine((v) => v.startsWith("data:image/") || v.startsWith("https://"), {
    message: "Imagem inválida",
  }),
});

export const readPlacaFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => ReadPlacaInput.parse(value))
  .handler(async ({ data }) => {
    const { extractFromImages } = await import("@/lib/ai-extract.server");
    const result = await extractFromImages({
      imageDataUrls: [data.imageDataUrl],
      fields: ["placa_identificacao"],
      processLabel: "Placa de identificação",
      model: "gemini-2.5-flash-lite",
      timeoutMs: 12000,
      contextHints:
        "Extraia APENAS o número da placa de identificação do jazigo/gaveta exibido na imagem. " +
        "Se não houver um número claro, retorne string vazia. Nunca invente.",
    });
    const raw = String(result.placa_identificacao ?? "").trim();
    return { placa: raw };
  });
