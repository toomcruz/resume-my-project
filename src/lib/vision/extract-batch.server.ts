/**
 * Processa múltiplas imagens de forma independente e paralela com
 * limite de concorrência. Um erro em uma imagem NÃO bloqueia as
 * outras — cada imagem tem seu próprio outcome.
 *
 * Server-only.
 */
import {
  extractSingleImage,
  type ExtractImageInput,
  type ExtractImageOutcome,
} from "@/lib/vision/extract-image.server";

export type BatchItemResult = ExtractImageOutcome & { imageId: string };

export type ExtractBatchOptions = {
  concurrency?: number;
  /** Injetável para testes. */
  extract?: (input: ExtractImageInput) => Promise<ExtractImageOutcome>;
};

/**
 * Processa uma lista de imagens. Ordem de saída == ordem de entrada.
 * Isola erros por imagem.
 */
export async function extractImageBatch(
  items: ExtractImageInput[],
  opts: ExtractBatchOptions = {},
): Promise<BatchItemResult[]> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 8));
  const run = opts.extract ?? extractSingleImage;
  const results: BatchItemResult[] = new Array(items.length);

  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i];
      try {
        const outcome = await run(item);
        results[i] = { ...outcome, imageId: item.imageId };
      } catch (e) {
        results[i] = {
          ok: false,
          imageId: item.imageId,
          error: e instanceof Error ? e.message : "erro desconhecido",
          durationMs: 0,
        };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
