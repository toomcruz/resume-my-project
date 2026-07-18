// Server function: classifica e extrai documentos de um atendimento.
// Reutiliza `extractFromImages` do gateway de IA e persiste no processo
// em `funeral_processes` + `funeral_documents`.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyDocument } from "./document-classifier";
import { mergeProcess } from "./process-merger";
import { logSafe } from "./logger";
import type { DocumentoFonte, TipoDocumento, TipoProcesso } from "./types";

const Input = z.object({
  attendanceId: z.string().uuid(),
  tipoProcesso: z.enum(["sepultamento", "exumacao"]).default("sepultamento"),
  exumadoDocId: z.string().uuid().optional(),
});

const FIELDS = [
  "nome_falecido",
  "cpf_falecido",
  "rg_falecido",
  "sexo",
  "data_nascimento",
  "data_obito",
  "hora_obito",
  "nome_mae",
  "nome_pai",
  "causa_mortis",
  "numero_do",
  "pro_aim",
  "local_falecimento",
  "nome_declarante",
  "cpf_declarante",
  "rg_declarante",
  "grau_parentesco_declarante",
  "telefone_declarante",
  "email_declarante",
  "endereco_declarante",
  "cemiterio",
  "data_sepultamento",
  "hora_sepultamento",
  "local_sepultamento",
  "quadra",
  "rua",
  "terreno",
  "gaveta",
  "concessao",
  "numero_contratacao",
  "tipo_contratacao",
  "agencia",
  "emissao",
  "nome_contratante",
  "cpf_contratante",
  "rg_contratante",
  "grau_parentesco_contratante",
  "telefone_contratante",
  "email_contratante",
  "endereco_contratante",
  "local_velorio",
  "sala_velorio",
  "inicio_velorio",
  "fim_velorio",
  "itens",
  "ordens_servico",
  "pagamento",
];

export const classifyAndExtractProcess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => Input.parse(value))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Carrega imagens do atendimento
    const { data: images, error: imgErr } = await supabase
      .from("attendance_images")
      .select("id, storage_path, mime_type")
      .eq("attendance_id", data.attendanceId);
    if (imgErr) throw new Error(imgErr.message);
    if (!images?.length) throw new Error("Nenhuma imagem enviada");

    // 2) Baixa e converte em data URLs
    const items: Array<{ imageId: string; dataUrl: string }> = [];
    for (const image of images) {
      const { data: blob, error } = await supabase.storage
        .from("attendance-images")
        .download(image.storage_path);
      if (error || !blob) continue;
      const buffer = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buffer.length; i += 1) binary += String.fromCharCode(buffer[i]);
      const base64 = btoa(binary);
      items.push({
        imageId: image.id,
        dataUrl: `data:${image.mime_type || "image/jpeg"};base64,${base64}`,
      });
    }
    if (!items.length) throw new Error("Não foi possível ler as imagens enviadas");

    // 3) Para cada imagem: extrai campos + classifica pelo próprio conteúdo lido
    const { extractFromImages } = await import("@/lib/ai-extract.server");
    const documentos: DocumentoFonte[] = [];

    for (const item of items) {
      let extracted: Record<string, string> = {};
      try {
        extracted = await extractFromImages({
          imageDataUrls: [item.dataUrl],
          fields: FIELDS,
          processLabel: data.tipoProcesso,
          timeoutMs: 20000,
          contextHints:
            "Documento pode ser Declaração de Óbito ou Nota de Contratação Funeral. Extraia apenas o que for legível; nunca invente.",
        });
      } catch (err) {
        logSafe("extração falhou", { imageId: item.imageId, error: (err as Error).message });
        continue;
      }
      const cls = classifyDocument({
        ocrText: Object.values(extracted).join(" "),
        extractedFields: extracted,
      });
      documentos.push({
        id: item.imageId,
        attendanceImageId: item.imageId,
        tipoDocumento: cls.tipo as TipoDocumento,
        classificacaoConfianca: cls.confianca,
        dadosExtraidos: extracted,
      });
    }

    // 4) Funde num único processo
    const processo = mergeProcess(documentos, {
      tipoProcesso: data.tipoProcesso as TipoProcesso,
      exumadoDocId: data.exumadoDocId,
    });

    // 5) Upsert em funeral_processes vinculado ao atendimento
    const { data: existing } = await supabase
      .from("funeral_processes")
      .select("id")
      .eq("attendance_id", data.attendanceId)
      .eq("user_id", userId)
      .maybeSingle();

    const dadosJson = JSON.parse(JSON.stringify(processo)) as never;
    let processId = existing?.id as string | undefined;
    if (processId) {
      const { error } = await supabase
        .from("funeral_processes")
        .update({ tipo_processo: data.tipoProcesso, dados: dadosJson, status: "em_analise" })
        .eq("id", processId);
      if (error) throw new Error(error.message);
      await supabase.from("funeral_documents").delete().eq("process_id", processId);
      await supabase.from("funeral_discrepancies").delete().eq("process_id", processId);
    } else {
      const { data: inserted, error } = await supabase
        .from("funeral_processes")
        .insert({
          user_id: userId,
          attendance_id: data.attendanceId,
          tipo_processo: data.tipoProcesso,
          status: "em_analise",
          dados: dadosJson,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      processId = inserted.id;
    }

    if (documentos.length) {
      const rows = documentos.map((d) => ({
        process_id: processId!,
        attendance_image_id: d.attendanceImageId ?? null,
        tipo_documento: d.tipoDocumento,
        classificacao_confianca: d.classificacaoConfianca,
        dados_extraidos: JSON.parse(JSON.stringify(d.dadosExtraidos)) as never,
      }));
      await supabase.from("funeral_documents").insert(rows);
    }
    if (processo.divergencias.length) {
      const rows = processo.divergencias.map((d) => ({
        process_id: processId!,
        campo: d.campo,
        valor_a: d.valorA,
        valor_b: d.valorB,
        confianca: d.confianca,
        sugestao: d.sugestao ?? null,
        status: d.status,
      }));
      await supabase.from("funeral_discrepancies").insert(rows);
    }

    // 7) Auditoria mascarada
    await supabase.from("funeral_audit_log").insert({
      user_id: userId,
      process_id: processId!,
      acao: "classify_and_extract",
      payload: {
        docs: documentos.length,
        divergencias: processo.divergencias.length,
        pendentes: processo.camposPendentes.length,
      },
    });

    return { processId: processId!, processoJson: JSON.stringify(processo) };
  });

// -------- Confirmar/corrigir um campo específico --------
const ConfirmInput = z.object({
  processId: z.string().uuid(),
  campoPath: z.string(),
  valorCorreto: z.string(),
  valorExtraido: z.string().optional(),
  tipoDocumento: z.enum(["DECLARACAO_DE_OBITO", "NOTA_DE_CONTRATACAO_FUNERAL", "DOCUMENTO_DESCONHECIDO"]).default("DOCUMENTO_DESCONHECIDO"),
});

export const confirmProcessField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ConfirmInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("funeral_processes")
      .select("id, dados")
      .eq("id", data.processId)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("Processo não encontrado");

    const { applyManualCorrection } = await import("./process-merger");
    const updated = applyManualCorrection(row.dados as never, data.campoPath, data.valorCorreto);

    await supabase.from("funeral_processes").update({ dados: JSON.parse(JSON.stringify(updated)) as never }).eq("id", data.processId);
    await supabase.from("funeral_field_feedback").insert({
      user_id: userId,
      process_id: data.processId,
      tipo_documento: data.tipoDocumento,
      campo: data.campoPath,
      valor_extraido: data.valorExtraido ?? null,
      valor_correto: data.valorCorreto,
    });
    return { ok: true, processoJson: JSON.stringify(updated) };
  });

// -------- Resolver divergência --------
const ResolveInput = z.object({
  discrepancyId: z.string().uuid(),
  status: z.enum(["CONFIRMADO", "DESCARTADO"]),
  valorFinal: z.string().optional(),
});

export const resolveDiscrepancy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ResolveInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("funeral_discrepancies")
      .update({
        status: data.status,
        valor_final: data.valorFinal ?? null,
        resolvido_por: userId,
        resolvido_em: new Date().toISOString(),
      })
      .eq("id", data.discrepancyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Ler processo consolidado --------
const GetInput = z.object({ attendanceId: z.string().uuid() });

export const getFuneralProcess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => GetInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("funeral_processes")
      .select("id, tipo_processo, status, dados, created_at, updated_at")
      .eq("attendance_id", data.attendanceId)
      .eq("user_id", userId)
      .maybeSingle();
    return row ?? null;
  });
