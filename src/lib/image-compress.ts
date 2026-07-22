/**
 * Compressão client-side de imagens antes do envio à IA.
 * Reduz o maior lado a `maxSide` px e re-encoda como JPEG (`quality`),
 * cortando drasticamente o tempo de upload + inferência. Se a imagem
 * já for menor que o alvo, apenas re-encoda para eliminar peso extra.
 * Cai graciosamente pro FileReader original se algo falhar.
 */
export interface CompressOptions {
  maxSide?: number; // default 1600
  quality?: number; // 0..1, default 0.85
  mimeType?: string; // default image/jpeg
}

async function compressImageBlob(file: File, opts: CompressOptions = {}): Promise<Blob> {
  const maxSide = opts.maxSide ?? 1600;
  const quality = opts.quality ?? 0.85;
  const mimeType = opts.mimeType ?? "image/jpeg";

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(targetW, targetH)
        : Object.assign(document.createElement("canvas"), {
            width: targetW,
            height: targetH,
          });
    const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext("2d") as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error("canvas 2d indisponível");
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const blob: Blob | null =
      "convertToBlob" in canvas
        ? await (canvas as OffscreenCanvas).convertToBlob({ type: mimeType, quality })
        : await new Promise<Blob | null>((resolve) =>
            (canvas as HTMLCanvasElement).toBlob(resolve, mimeType, quality),
          );
    if (!blob) throw new Error("falha ao gerar blob");
    return blob;
  } catch {
    // Formatos que o navegador não consegue decodificar continuam sendo
    // enviados no original em vez de bloquear o atendimento.
    return file;
  }
}

/**
 * Prepara uma imagem para Storage/IA, preservando o nome original para a UI
 * e usando uma extensão coerente com o conteúdo reencodado.
 */
export async function compressImageForUpload(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const blob = await compressImageBlob(file, opts);
  if (blob === file) return file;

  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "") || "imagem";
  return new File([blob], `${baseName}.${extension}`, {
    type: blob.type,
    lastModified: file.lastModified,
  });
}

export async function compressImageToDataUrl(
  file: File,
  opts: CompressOptions = {},
): Promise<string> {
  return await blobToDataUrl(await compressImageBlob(file, opts));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("falha ao ler arquivo"));
    reader.readAsDataURL(blob);
  });
}
