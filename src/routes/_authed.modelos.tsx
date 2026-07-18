import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileCheck2,
  FileStack,
  Loader2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { PROCESSES } from "@/lib/processes";
import { getErrorMessage } from "@/lib/error-message";
import { analyzeTemplate } from "@/lib/attendances.functions";
import {
  getOfficialInstallVariants,
  isOfficialStoragePath,
  loadOfficialTemplateCatalog,
  officialStoragePath,
} from "@/lib/official-templates";

export const Route = createFileRoute("/_authed/modelos")({
  component: Templates,
});

function Templates() {
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzeTemplate);
  const [name, setName] = useState("");
  const [processKey, setProcessKey] = useState<string>("any");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [installingOfficial, setInstallingOfficial] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: officialCatalog, isLoading: officialLoading } = useQuery({
    queryKey: ["official-template-catalog"],
    queryFn: loadOfficialTemplateCatalog,
  });

  const officialVariants = useMemo(
    () => (officialCatalog ?? []).flatMap(getOfficialInstallVariants),
    [officialCatalog],
  );

  const installedOfficialPaths = useMemo(
    () =>
      new Set(
        (templates ?? [])
          .map((template) => template.storage_path)
          .filter((path): path is string => isOfficialStoragePath(path)),
      ),
    [templates],
  );

  const installedOfficialCount = officialVariants.filter((variant) =>
    [...installedOfficialPaths].some((path) =>
      path.endsWith(`/official/${variant.storageId}.docx`),
    ),
  ).length;

  async function upload() {
    if (!file || !name) return toast.error("Nome e arquivo obrigatórios");
    if (!file.name.toLowerCase().endsWith(".docx")) {
      return toast.error("Envie um arquivo .docx");
    }
    setSubmitting(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Sessão expirada");
      const path = `${userId}/${crypto.randomUUID()}.docx`;
      const { error: upErr } = await supabase.storage
        .from("document-templates")
        .upload(path, file, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
      if (upErr) throw upErr;

      const { placeholders } = await analyzeFn({ data: { storagePath: path } });

      const { error: insErr } = await supabase.from("document_templates").insert({
        user_id: userId,
        name,
        process: processKey === "any" ? null : processKey,
        storage_path: path,
        placeholders,
      });
      if (insErr) throw insErr;

      toast.success(`Modelo salvo. ${placeholders.length} campos detectados.`);
      setName("");
      setFile(null);
      setProcessKey("any");
      qc.invalidateQueries({ queryKey: ["templates-all"] });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao enviar modelo"));
    } finally {
      setSubmitting(false);
    }
  }

  async function installOfficialTemplates() {
    if (!officialVariants.length) {
      return toast.error("O catálogo de modelos oficiais não está disponível.");
    }

    setInstallingOfficial(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      const existingByPath = new Map(
        (templates ?? []).flatMap((template) =>
          template.storage_path ? ([[template.storage_path, template]] as const) : [],
        ),
      );
      const fileCache = new Map<string, Blob>();
      let installed = 0;
      let updated = 0;

      for (const variant of officialVariants) {
        const storagePath = officialStoragePath(userId, variant.storageId);
        const existingTemplate = existingByPath.get(storagePath);

        let blob = fileCache.get(variant.file);
        if (!blob) {
          const response = await fetch(`/templates/official/${variant.file}`);
          if (!response.ok) {
            throw new Error(`Arquivo oficial ausente: ${variant.file}`);
          }
          blob = await response.blob();
          fileCache.set(variant.file, blob);
        }

        const { error: uploadError } = await supabase.storage
          .from("document-templates")
          .upload(storagePath, blob, {
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            upsert: true,
          });
        if (uploadError) throw uploadError;

        if (existingTemplate) {
          const { error: updateError } = await supabase
            .from("document_templates")
            .update({
              name: variant.name,
              process: variant.process,
              placeholders: variant.placeholders,
            })
            .eq("id", existingTemplate.id);
          if (updateError) throw updateError;
          updated += 1;
          continue;
        }

        const { error: insertError } = await supabase.from("document_templates").insert({
          user_id: userId,
          name: variant.name,
          process: variant.process,
          storage_path: storagePath,
          placeholders: variant.placeholders,
        });

        if (insertError) {
          await supabase.storage.from("document-templates").remove([storagePath]);
          throw insertError;
        }

        installed += 1;
      }

      await qc.invalidateQueries({ queryKey: ["templates-all"] });
      const result = [
        installed ? `${installed} modelo(s) instalado(s)` : "",
        updated ? `${updated} modelo(s) atualizado(s)` : "",
      ].filter(Boolean);
      toast.success(
        result.length ? `${result.join(" · ")}.` : "Os modelos oficiais já estavam atualizados.",
      );
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao instalar modelos oficiais"));
    } finally {
      setInstallingOfficial(false);
    }
  }

  async function remove(id: string, path: string) {
    if (isOfficialStoragePath(path)) {
      return toast.error(
        "Modelos oficiais são protegidos e não podem ser excluídos por esta tela.",
      );
    }
    if (!confirm("Excluir modelo?")) return;
    await supabase.storage.from("document-templates").remove([path]);
    await supabase.from("document_templates").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["templates-all"] });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Modelos de documento</h1>
        <p className="text-sm text-muted-foreground">
          Instale os modelos oficiais ou envie um DOCX próprio com marcadores como{" "}
          <code className="text-xs bg-muted px-1 rounded">{"{nome_falecido}"}</code>.
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/[0.025]">
        <CardHeader className="sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle>Modelos oficiais</CardTitle>
            </div>
            <CardDescription className="mt-1">
              Arquivos originais preservados, com fonte, margens e estrutura oficiais.
            </CardDescription>
          </div>
          <Button
            onClick={installOfficialTemplates}
            disabled={installingOfficial || officialLoading || !officialVariants.length}
            className="shrink-0"
          >
            {installingOfficial ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : installedOfficialCount === officialVariants.length &&
              officialVariants.length > 0 ? (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            ) : (
              <FileCheck2 className="h-4 w-4 mr-2" />
            )}
            {installedOfficialCount === officialVariants.length && officialVariants.length > 0
              ? "Atualizar modelos oficiais"
              : "Instalar modelos oficiais"}
          </Button>
        </CardHeader>
        <CardContent>
          {officialLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando catálogo…
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {officialVariants.map((variant) => {
                const installed = [...installedOfficialPaths].some((path) =>
                  path.endsWith(`/official/${variant.storageId}.docx`),
                );
                return (
                  <div
                    key={variant.storageId}
                    className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{variant.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {variant.placeholders.length} campos ·{" "}
                        {PROCESSES.find((process) => process.key === variant.process)?.label}
                      </div>
                    </div>
                    <Badge variant={installed ? "secondary" : "outline"} className="shrink-0">
                      {installed ? "Instalado" : "Disponível"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Novo modelo personalizado</CardTitle>
          <CardDescription>Somente arquivos .docx são suportados.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Nome</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Autorização de sepultamento"
            />
          </div>
          <div className="space-y-2">
            <Label>Processo</Label>
            <Select value={processKey} onValueChange={setProcessKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Todos os processos</SelectItem>
                {PROCESSES.map((process) => (
                  <SelectItem key={process.key} value={process.key}>
                    {process.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="tpl-file">Arquivo</Label>
            <label
              htmlFor="tpl-file"
              className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-accent"
            >
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{file?.name ?? "Escolher .docx"}</span>
              <input
                id="tpl-file"
                type="file"
                accept=".docx"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="sm:col-span-2">
            <Button onClick={upload} disabled={submitting || !file || !name}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enviar modelo
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="font-medium">Modelos instalados ({templates?.length ?? 0})</h2>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : !templates?.length ? (
          <Card className="border-dashed">
            <CardContent className="py-10 flex flex-col items-center text-center gap-2">
              <FileStack className="h-6 w-6 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">Nenhum modelo instalado ainda.</div>
            </CardContent>
          </Card>
        ) : (
          templates.map((template) => {
            const official = isOfficialStoragePath(template.storage_path);
            return (
              <Card key={template.id}>
                <CardContent className="py-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{template.name}</span>
                      {official && <Badge variant="secondary">Oficial</Badge>}
                      <Badge variant="outline" className="text-xs">
                        {template.process
                          ? (PROCESSES.find((process) => process.key === template.process)?.label ??
                            template.process)
                          : "Todos"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {(template.placeholders as string[])?.length ?? 0} campos:{" "}
                      {(template.placeholders as string[])?.slice(0, 8).join(", ")}
                      {(template.placeholders as string[])?.length > 8 ? "…" : ""}
                    </div>
                  </div>
                  {!official && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(template.id, template.storage_path)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
