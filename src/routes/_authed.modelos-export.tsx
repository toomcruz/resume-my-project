import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import PizZip from "pizzip";
import { Download, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/error-message";

export const Route = createFileRoute("/_authed/modelos-export")({
  component: ExportTemplates,
});

function sanitizeFileName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function uniqueFileName(name: string, usedNames: Set<string>): string {
  const base = sanitizeFileName(name) || "modelo";
  let candidate = `${base}.docx`;
  let suffix = 2;

  while (usedNames.has(candidate)) {
    candidate = `${base}-${suffix}.docx`;
    suffix += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ExportTemplates() {
  const [exporting, setExporting] = useState(false);

  async function exportAllTemplates() {
    setExporting(true);
    try {
      const { data: userResult } = await supabase.auth.getUser();
      if (!userResult.user) throw new Error("Sessão expirada");

      const { data: templates, error: templatesError } = await supabase
        .from("document_templates")
        .select("id, name, storage_path, process, placeholders")
        .order("name", { ascending: true });

      if (templatesError) throw templatesError;
      if (!templates?.length) throw new Error("Nenhum modelo instalado");

      const zip = new PizZip();
      const usedNames = new Set<string>();
      const manifest: Array<Record<string, unknown>> = [];
      const failures: string[] = [];

      for (const template of templates) {
        const { data: fileBlob, error: downloadError } = await supabase.storage
          .from("document-templates")
          .download(template.storage_path);

        if (downloadError || !fileBlob) {
          failures.push(template.name);
          continue;
        }

        const fileName = uniqueFileName(template.name, usedNames);
        zip.file(fileName, await fileBlob.arrayBuffer(), { binary: true });
        manifest.push({
          id: template.id,
          nome: template.name,
          arquivo: fileName,
          processo: template.process,
          caminho_storage: template.storage_path,
          campos: template.placeholders,
        });
      }

      if (!manifest.length) throw new Error("Não foi possível baixar nenhum modelo");

      zip.file(
        "manifesto-modelos.json",
        JSON.stringify(
          {
            exportado_em: new Date().toISOString(),
            quantidade: manifest.length,
            falhas: failures,
            modelos: manifest,
          },
          null,
          2,
        ),
      );

      const zipBlob = zip.generate({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      triggerDownload(zipBlob, `scanne-modelos-${new Date().toISOString().slice(0, 10)}.zip`);

      if (failures.length) {
        toast.warning(`${manifest.length} modelos exportados; ${failures.length} falharam.`);
      } else {
        toast.success(`${manifest.length} modelos exportados em um único ZIP.`);
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao exportar modelos"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>Exportar modelos para conferência</CardTitle>
          </div>
          <CardDescription>
            Baixa todos os DOCX acessíveis à sua conta diretamente do bucket privado e reúne os
            arquivos em um único ZIP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            O pacote também inclui um manifesto com o nome, processo, caminho e campos de cada
            modelo. Nenhum arquivo torna-se público durante a exportação.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={exportAllTemplates} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Baixar todos os modelos
            </Button>
            <Button variant="outline" asChild>
              <Link to="/modelos">Voltar aos modelos</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
