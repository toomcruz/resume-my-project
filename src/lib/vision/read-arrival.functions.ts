/**
 * Server fn que lê um print de mensagem (ex.: grupo do WhatsApp) e extrai
 * horário de chegada do corpo, nome do motorista e placa do veículo.
 * Reutiliza o gateway de IA existente (`extractFromImages`).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ReadArrivalInput = z.object({
  imageDataUrl: z
    .string()
    .refine((v) => v.startsWith("data:image/") || v.startsWith("https://"), {
      message: "Imagem inválida",
    }),
});

export interface ArrivalInfo {
  arrival_time: string; // HH:MM (24h)
  driver_name: string;
  vehicle_plate: string; // AAA0A00 ou AAA-0000
}

function normalizeTime(raw: string): string {
  const m = raw.match(/(\d{1,2})[:hH](\d{2})/);
  if (!m) return "";
  const hh = String(Math.min(23, parseInt(m[1], 10))).padStart(2, "0");
  const mm = String(Math.min(59, parseInt(m[2], 10))).padStart(2, "0");
  return `${hh}:${mm}`;
}

function normalizePlate(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Mercosul: AAA0A00 / antiga: AAA0000
  if (/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(cleaned)) return cleaned;
  return cleaned; // devolve o que houver — usuário confirma
}

export const readArrivalFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => ReadArrivalInput.parse(value))
  .handler(async ({ data }): Promise<ArrivalInfo> => {
    const { extractFromImages } = await import("@/lib/ai-extract.server");
    const result = await extractFromImages({
      imageDataUrls: [data.imageDataUrl],
      fields: ["arrival_time", "driver_name", "vehicle_plate"],
      processLabel: "Chegada do corpo (print de mensagem)",
      contextHints:
        "A imagem é um print de conversa/mensagem informando a chegada de um corpo ao cemitério. " +
        "Extraia: `arrival_time` no formato HH:MM 24h (converta '9h30', '09:30hs', '9:30 da manhã'); " +
        "`driver_name` é o nome do motorista (após 'motorista:', 'com o', ou similar); " +
        "`vehicle_plate` é a placa do veículo (padrão Mercosul AAA0A00 ou antiga AAA-0000). " +
        "Se algum não estiver presente, retorne string vazia. Nunca invente.",
    });
    return {
      arrival_time: normalizeTime(String(result.arrival_time ?? "")),
      driver_name: String(result.driver_name ?? "").trim(),
      vehicle_plate: normalizePlate(String(result.vehicle_plate ?? "")),
    };
  });
