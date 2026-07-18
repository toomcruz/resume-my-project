import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildAgendaSyncPatch } from "@/lib/agenda-sync";
import { applyOfficialTemplateAliases } from "@/lib/official-templates";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

function firstExtractedValue(extracted: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = String(extracted[key] ?? "").trim();
    if (value) return value;
  }
  return null;
}

/** Data atual (fuso São Paulo) e "São Paulo, DD de mês de AAAA" — sempre
 *  calculadas pelo sistema, ignorando qualquer valor extraído por OCR. */
function computeSaoPauloDates(): { dataAtual: string; dataAtualExtenso: string } {
  const now = new Date();
  const tz = "America/Sao_Paulo";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const monthName = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    month: "long",
  }).format(now);
  return {
    dataAtual: `${day}/${month}/${year}`,
    dataAtualExtenso: `São Paulo, ${parseInt(day, 10)} de ${monthName} de ${year}`,
  };
}

export async function syncLinkedAgenda(
  supabaseClient: SupabaseClient<Database>,
  attendanceId: string,
  extracted: Record<string, string>,
): Promise<boolean> {
  const { data: event, error: eventError } = await supabaseClient
    .from("agenda_events")
    .select(
      "id, deceased_name, responsible_name, registration_number, location, room, start_time, end_time, burial_time, burial_location, funeral_home",
    )
    .eq("attendance_id", attendanceId)
    .maybeSingle();

  if (eventError || !event) return false;

  const candidates: Record<string, string | null> = {
    deceased_name: firstExtractedValue(extracted, [
      "nome_falecido",
      "nomeFalecido",
      "nomeFal",
      "falecido",
    ]),
    responsible_name: firstExtractedValue(extracted, [
      "nome_responsavel",
      "nome_requerente",
      "nomeResponsavel",
      "nomeRequerente",
      "nomeResp",
    ]),
    registration_number: firstExtractedValue(extracted, [
      "inscricao_gs",
      "inscricaoGS",
      "inscrGS",
      "numero_inscricao",
    ]),
    location: firstExtractedValue(extracted, [
      "localizacao",
      "local_exumacao",
      "localExumacao",
      "quadraRua",
    ]),
    room: firstExtractedValue(extracted, ["sala_velorio", "salaVelorio", "sala"]),
    start_time: firstExtractedValue(extracted, [
      "inicio_velorio",
      "horario_inicio_velorio",
      "hora_agendamento",
      "horaAg",
    ]),
    end_time: firstExtractedValue(extracted, ["fim_velorio", "horario_fim_velorio"]),
    burial_time: firstExtractedValue(extracted, [
      "hora_sepultamento",
      "horario_sepultamento",
      "horaSep",
    ]),
    burial_location: firstExtractedValue(extracted, [
      "local_sepultamento",
      "localSepultamento",
      "quadraRua",
    ]),
    funeral_home: firstExtractedValue(extracted, [
      "funeraria",
      "empresa_funeraria",
      "empresaFuneraria",
      "agencia",
    ]),
  };

  const patch = buildAgendaSyncPatch(event as Record<string, unknown>, candidates);

  if (!Object.keys(patch).length) return true;
  const { error: updateError } = await supabaseClient
    .from("agenda_events")
    .update(patch as Database["public"]["Tables"]["agenda_events"]["Update"])
    .eq("id", event.id);
  return !updateError;
}

// -------- Extract data from attendance images --------
const ExtractInput = z.object({ attendanceId: z.string().uuid() });

export const extractAttendanceData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => ExtractInput.parse(value))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: attendance, error: attendanceError } = await supabase
      .from("attendances")
      .select("id, process, subprocess, subprocess_details")
      .eq("id", data.attendanceId)
      .single();
    if (attendanceError || !attendance) throw new Error("Atendimento não encontrado");

    const { data: images, error: imageError } = await supabase
      .from("attendance_images")
      .select("storage_path, mime_type")
      .eq("attendance_id", data.attendanceId);
    if (imageError) throw new Error(imageError.message);
    if (!images?.length) throw new Error("Nenhuma imagem enviada");

    const { data: templates } = await supabase
      .from("document_templates")
      .select("placeholders, process")
      .eq("user_id", userId);
    const fieldSet = new Set<string>();
    for (const template of templates ?? []) {
      if (!template.process || template.process === attendance.process) {
        for (const placeholder of (template.placeholders as string[]) ?? []) {
          fieldSet.add(placeholder);
        }
      }
    }

    for (const field of [
      "nome_falecido",
      "cpf_falecido",
      "data_nascimento",
      "data_falecimento",
      "data_sepultamento",
      "hora_sepultamento",
      "local_sepultamento",
      "sala_velorio",
      "inicio_velorio",
      "fim_velorio",
      "nome_responsavel",
      "cpf_responsavel",
      "inscricao_gs",
      "hora_agendamento",
      "localizacao",
      "endereco",
      "telefone",
    ]) {
      fieldSet.add(field);
    }

    const imageDataUrls: string[] = [];
    for (const image of images) {
      const { data: blob, error } = await supabase.storage
        .from("attendance-images")
        .download(image.storage_path);
      if (error || !blob) continue;
      const buffer = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let index = 0; index < buffer.length; index += 1) {
        binary += String.fromCharCode(buffer[index]);
      }
      const base64 = btoa(binary);
      const mime = image.mime_type || "image/jpeg";
      imageDataUrls.push(`data:${mime};base64,${base64}`);
    }

    if (!imageDataUrls.length) throw new Error("Não foi possível ler as imagens enviadas");

    const { extractFromImages } = await import("./ai-extract.server");
    const extracted = await extractFromImages({
      imageDataUrls,
      fields: Array.from(fieldSet),
      processLabel: attendance.process,
      contextHints: `Subprocesso: ${attendance.subprocess ?? "-"}. Detalhes: ${JSON.stringify(attendance.subprocess_details)}`,
    });

    if (!Object.keys(extracted).length) {
      await supabase.from("attendances").update({ status: "error" }).eq("id", data.attendanceId);
      throw new Error("A IA não devolveu dados válidos. Tente novamente.");
    }

    let finalExtracted = extracted;
    if (attendance.process === "sepultamento") {
      const { buildTriagemOverrides } = await import("./triagem-sepultamento");
      const details = (attendance.subprocess_details as Record<string, string>) ?? {};
      finalExtracted = {
        ...extracted,
        ...buildTriagemOverrides({
          subprocess: attendance.subprocess ?? undefined,
          data_agendada: details.data_agendada,
          hora_sepultamento: details.hora_sepultamento,
          tem_velorio: (details.tem_velorio as "SIM" | "NAO" | "") || "",
          sala_velorio: details.sala_velorio,
          inicio_velorio: details.inicio_velorio,
          fim_velorio: details.fim_velorio,
          local_sepultamento: details.local_sepultamento,
          funeraria: details.funeraria,
          sem_velorio: (details.sem_velorio as "SIM" | "") || "",
          placa_identificacao: details.placa_identificacao,
          placa_confirmada: (details.placa_confirmada as "SIM" | "") || "",
        }),
      };
    }

    const { error: saveError } = await supabase
      .from("attendances")
      .update({ extracted_data: finalExtracted, status: "reviewing" })
      .eq("id", data.attendanceId);
    if (saveError) throw new Error(saveError.message);

    const agendaSynced = await syncLinkedAgenda(supabase, data.attendanceId, finalExtracted);

    return { data: finalExtracted, agendaSynced };
  });

// -------- Generate a filled document --------
const GenerateInput = z.object({
  attendanceId: z.string().uuid(),
  templateId: z.string().uuid(),
});

export const generateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => GenerateInput.parse(value))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: attendance } = await supabase
      .from("attendances")
      .select("id, extracted_data, process, subprocess, subprocess_details")
      .eq("id", data.attendanceId)
      .single();
    if (!attendance) throw new Error("Atendimento não encontrado");

    const { data: template } = await supabase
      .from("document_templates")
      .select("id, name, storage_path")
      .eq("id", data.templateId)
      .single();
    if (!template) throw new Error("Modelo não encontrado");

    const { data: blob, error: downloadError } = await supabase.storage
      .from("document-templates")
      .download(template.storage_path);
    if (downloadError || !blob) throw new Error("Falha ao baixar modelo");

    const buffer = await blob.arrayBuffer();
    const { fillDocx } = await import("./docx.server");
    const extracted = (attendance.extracted_data as Record<string, string>) ?? {};
    // Triagem rápida (Sepultamento): valores selecionados via botões são a
    // fonte de verdade e sobrescrevem `extracted_data` para os campos que a
    // triagem controla. Ver spec §8 e src/lib/triagem-sepultamento.ts.
    let merged: Record<string, string> = extracted;
    if (attendance.process === "sepultamento") {
      const { buildTriagemOverrides } = await import("./triagem-sepultamento");
      const details = (attendance.subprocess_details as Record<string, string>) ?? {};
      const overrides = buildTriagemOverrides({
        subprocess: attendance.subprocess ?? undefined,
        data_agendada: details.data_agendada,
        hora_sepultamento: details.hora_sepultamento,
        tem_velorio: (details.tem_velorio as "SIM" | "NAO" | "") || "",
        sala_velorio: details.sala_velorio,
        inicio_velorio: details.inicio_velorio,
        fim_velorio: details.fim_velorio,
        local_sepultamento: details.local_sepultamento,
        funeraria: details.funeraria,
        sem_velorio: (details.sem_velorio as "SIM" | "") || "",
        placa_identificacao: details.placa_identificacao,
        placa_confirmada: (details.placa_confirmada as "SIM" | "") || "",
      });
      merged = { ...extracted, ...overrides };
    }
    const autoDates = computeSaoPauloDates();
    merged = {
      ...merged,
      data_atual: autoDates.dataAtual,
      data_atual_extenso: autoDates.dataAtualExtenso,
    };

    // Puxa campos operacionais da agenda (quadra/rua, terreno, gaveta e demais
    // dados preenchidos no dia) para o payload do documento, dando precedência
    // aos valores da agenda quando o campo do atendimento estiver vazio.
    const { data: linkedEvent } = await supabase
      .from("agenda_events")
      .select(
        "quadra_rua, terreno, gaveta, burial_location, burial_time, room, start_time, end_time, funeral_home, vehicle_plate, driver_name, arrival_time, destination",
      )
      .eq("attendance_id", data.attendanceId)
      .maybeSingle();

    if (linkedEvent) {
      const agendaMap: Record<string, string | null> = {
        quadra_rua: linkedEvent.quadra_rua,
        quadraRua: linkedEvent.quadra_rua,
        rua: linkedEvent.quadra_rua,
        terreno: linkedEvent.terreno,
        sepultura: linkedEvent.terreno,
        numero_sepultura: linkedEvent.terreno,
        gaveta: linkedEvent.gaveta,
        numero_gaveta: linkedEvent.gaveta,
        local_sepultamento: linkedEvent.burial_location,
        localSepultamento: linkedEvent.burial_location,
        hora_sepultamento: linkedEvent.burial_time,
        horaSep: linkedEvent.burial_time,
        sala_velorio: linkedEvent.room,
        salaVelorio: linkedEvent.room,
        inicio_velorio: linkedEvent.start_time,
        fim_velorio: linkedEvent.end_time,
        funeraria: linkedEvent.funeral_home,
        placa_veiculo: linkedEvent.vehicle_plate,
        nome_motorista: linkedEvent.driver_name,
        hora_chegada: linkedEvent.arrival_time,
        destino: linkedEvent.destination,
      };
      const withAgenda: Record<string, string> = { ...merged };
      for (const [key, value] of Object.entries(agendaMap)) {
        const v = String(value ?? "").trim();
        if (!v) continue;
        const current = String(withAgenda[key] ?? "").trim();
        if (!current) withAgenda[key] = v;
      }
      merged = withAgenda;
    }

    const values = applyOfficialTemplateAliases(merged, template.storage_path);
    const filled = fillDocx(buffer, values);
    // Wrap Uint8Array in a Blob so supabase-js uploads raw binary bytes.
    // Uploading a bare Uint8Array on the edge runtime can be serialized as
    // JSON/text and produce a corrupted .docx that Word refuses to open.
    const docxBlob = new Blob([filled.buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const safeName = template.name.replace(/[^\w.-]+/g, "_");
    const outputPath = `${userId}/${data.attendanceId}/${Date.now()}_${safeName}.docx`;
    const { error: uploadError } = await supabase.storage
      .from("generated-documents")
      .upload(outputPath, docxBlob, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: record, error: recordError } = await supabase
      .from("generated_documents")
      .insert({
        attendance_id: data.attendanceId,
        template_id: data.templateId,
        user_id: userId,
        name: template.name,
        storage_path: outputPath,
      })
      .select("id, name, storage_path, created_at")
      .single();
    if (recordError) throw new Error(recordError.message);

    return record;
  });

// -------- Detect template placeholders on upload --------
const TemplateInput = z.object({ storagePath: z.string() });

export const analyzeTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => TemplateInput.parse(value))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: blob, error } = await supabase.storage
      .from("document-templates")
      .download(data.storagePath);
    if (error || !blob) throw new Error("Não foi possível ler o modelo");
    const buffer = await blob.arrayBuffer();
    const { detectPlaceholders } = await import("./docx.server");
    const placeholders = detectPlaceholders(buffer);
    return { placeholders };
  });

// -------- Signed URL for generated document download --------
const SignedInput = z.object({
  bucket: z.string(),
  path: z.string(),
  filename: z.string().optional(),
});

export const getSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => SignedInput.parse(value))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Force Content-Disposition: attachment so the browser downloads the
    // .docx as a file instead of rendering it in an in-browser viewer
    // (Chrome/Google Docs preview) that distorts fonts and layout.
    const { data: signed, error } = await supabase.storage
      .from(data.bucket)
      .createSignedUrl(data.path, 300, {
        download: data.filename ?? true,
      });
    if (error || !signed) throw new Error(error?.message || "Falha ao gerar URL");
    return { url: signed.signedUrl };
  });

