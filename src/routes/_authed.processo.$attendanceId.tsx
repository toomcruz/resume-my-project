import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, FileText, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { removeDiscrepancyOptimistically } from "@/lib/attendance-runtime";
import {
  classifyAndExtractProcess,
  confirmProcessField,
  getFuneralProcess,
  resolveDiscrepancy,
} from "@/lib/funeral-docs/funeral-docs.functions";
import type { ProcessoFunerario, ValorRastreado } from "@/lib/funeral-docs/types";

export const Route = createFileRoute("/_authed/processo/$attendanceId")({
  component: ProcessoPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6 space-y-3">
        <p className="text-destructive">Erro: {error.message}</p>
        <Button onClick={() => { reset(); router.invalidate(); }}>Tentar novamente</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Processo não encontrado</div>,
});

function statusColor(v?: ValorRastreado): "verde" | "amarelo" | "vermelho" | "cinza" {
  if (!v || !v.normalized) return "vermelho";
  if (v.confianca >= 0.85) return "verde";
  if (v.confianca >= 0.5) return "amarelo";
  return "vermelho";
}

const statusClass: Record<string, string> = {
  verde: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  amarelo: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  vermelho: "bg-destructive/15 text-destructive border-destructive/30",
  cinza: "bg-muted text-muted-foreground border-border",
};

function FieldRow(props: {
  label: string;
  path: string;
  value?: ValorRastreado;
  onSave: (path: string, value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.value?.normalized ?? "");
  useEffect(() => setDraft(props.value?.normalized ?? ""), [props.value?.normalized]);
  const color = statusColor(props.value);
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-none">
      <span className="text-xs text-muted-foreground w-40 shrink-0">{props.label}</span>
      {editing ? (
        <div className="flex-1 flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8" autoFocus />
          <Button size="sm" onClick={() => { props.onSave(props.path, draft); setEditing(false); }}>Salvar</Button>
        </div>
      ) : (
        <>
          <span className={`flex-1 text-sm px-2 py-1 rounded border ${statusClass[color]}`}>
            {props.value?.normalized || <em className="opacity-60">—</em>}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Editar</Button>
        </>
      )}
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="py-3"><CardTitle className="text-base">{props.title}</CardTitle></CardHeader>
      <CardContent className="pt-0">{props.children}</CardContent>
    </Card>
  );
}

function ProcessoPage() {
  const { attendanceId } = Route.useParams();
  const router = useRouter();
  const getProc = useServerFn(getFuneralProcess);
  const runExtract = useServerFn(classifyAndExtractProcess);
  const confirmField = useServerFn(confirmProcessField);
  const resolveDisc = useServerFn(resolveDiscrepancy);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["funeral-process", attendanceId],
    queryFn: () => getProc({ data: { attendanceId } }),
  });

  const runMut = useMutation({
    mutationFn: async () => runExtract({ data: { attendanceId, tipoProcesso: "sepultamento" } }),
    onSuccess: () => { toast.success("Documentos classificados e extraídos"); refetch(); router.invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: async (vars: { path: string; value: string }) =>
      confirmField({ data: { processId: (data as { id: string }).id, campoPath: vars.path, valorCorreto: vars.value } }),
    onSuccess: () => { toast.success("Correção registrada"); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const processo = (data as { dados?: unknown } | null)?.dados as ProcessoFunerario | undefined;

  const onSave = (path: string, value: string) => saveMut.mutate({ path, value });

  const pendentes = useMemo(() => processo?.camposPendentes ?? [], [processo]);
  const divergencias = useMemo(() => processo?.divergencias ?? [], [processo]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Processo funerário</h1>
          <p className="text-sm text-muted-foreground">Conferência inteligente de documentos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCcw className="w-4 h-4 mr-1" /> Recarregar
          </Button>
          <Button size="sm" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
            {runMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileText className="w-4 h-4 mr-1" />}
            Classificar & extrair
          </Button>
        </div>
      </div>

      {!processo ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          Nenhum processo consolidado ainda. Envie as imagens no atendimento e clique em "Classificar & extrair".
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline">{processo.tipoProcesso}</Badge>
              <Badge variant="secondary">{processo.documentos.length} documento(s)</Badge>
              {pendentes.length ? (
                <Badge className="bg-destructive/15 text-destructive border-destructive/30">
                  <AlertTriangle className="w-3 h-3 mr-1" /> {pendentes.length} pendente(s)
                </Badge>
              ) : (
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> completo
                </Badge>
              )}
            </div>

            <Section title="Falecido(s)">
              {processo.falecidos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum identificado.</p>}
              {processo.falecidos.map((f, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="text-xs uppercase text-muted-foreground mt-2">{f.papel}</div>
                  <FieldRow label="Nome" path={`falecidos.${idx}.nome`} value={f.nome} onSave={onSave} />
                  <FieldRow label="CPF" path={`falecidos.${idx}.cpf`} value={f.cpf} onSave={onSave} />
                  <FieldRow label="Data óbito" path={`falecidos.${idx}.dataObito`} value={f.dataObito} onSave={onSave} />
                  <FieldRow label="Nº DO" path={`falecidos.${idx}.numeroDO`} value={f.numeroDO} onSave={onSave} />
                  <FieldRow label="Nome da mãe" path={`falecidos.${idx}.nomeMae`} value={f.nomeMae} onSave={onSave} />
                </div>
              ))}
            </Section>

            <Section title="Responsável / Declarante">
              <FieldRow label="Nome" path="responsavelPrincipal.nome" value={processo.responsavelPrincipal?.nome} onSave={onSave} />
              <FieldRow label="CPF" path="responsavelPrincipal.cpf" value={processo.responsavelPrincipal?.cpf} onSave={onSave} />
              <FieldRow label="Parentesco" path="responsavelPrincipal.grauParentesco" value={processo.responsavelPrincipal?.grauParentesco} onSave={onSave} />
              <FieldRow label="Telefone" path="responsavelPrincipal.telefone1" value={processo.responsavelPrincipal?.telefone1} onSave={onSave} />
            </Section>

            <Section title="Contratante (Nota)">
              <FieldRow label="Nome" path="contratante.nome" value={processo.contratante?.nome} onSave={onSave} />
              <FieldRow label="CPF" path="contratante.cpf" value={processo.contratante?.cpf} onSave={onSave} />
              <FieldRow label="Parentesco" path="contratante.grauParentesco" value={processo.contratante?.grauParentesco} onSave={onSave} />
            </Section>
          </div>

          <div className="space-y-4">
            <Section title="Sepultamento">
              <FieldRow label="Cemitério" path="dadosSepultamento.cemiterio" value={processo.dadosSepultamento?.cemiterio} onSave={onSave} />
              <FieldRow label="Data" path="dadosSepultamento.data" value={processo.dadosSepultamento?.data} onSave={onSave} />
              <FieldRow label="Hora" path="dadosSepultamento.hora" value={processo.dadosSepultamento?.hora} onSave={onSave} />
              <FieldRow label="Local" path="dadosSepultamento.local" value={processo.dadosSepultamento?.local} onSave={onSave} />
              <FieldRow label="Quadra" path="dadosSepultamento.quadra" value={processo.dadosSepultamento?.quadra} onSave={onSave} />
              <FieldRow label="Rua" path="dadosSepultamento.rua" value={processo.dadosSepultamento?.rua} onSave={onSave} />
              <FieldRow label="Terreno" path="dadosSepultamento.terreno" value={processo.dadosSepultamento?.terreno} onSave={onSave} />
              <FieldRow label="Gaveta" path="dadosSepultamento.gaveta" value={processo.dadosSepultamento?.gaveta} onSave={onSave} />
            </Section>

            <Section title="Velório">
              <FieldRow label="Local" path="dadosVelorio.local" value={processo.dadosVelorio?.local} onSave={onSave} />
              <FieldRow label="Sala" path="dadosVelorio.sala" value={processo.dadosVelorio?.sala} onSave={onSave} />
              <FieldRow label="Início" path="dadosVelorio.inicio" value={processo.dadosVelorio?.inicio} onSave={onSave} />
              <FieldRow label="Fim" path="dadosVelorio.fim" value={processo.dadosVelorio?.fim} onSave={onSave} />
            </Section>

            <Section title="Contratação">
              <FieldRow label="Nº contratação" path="dadosContratacao.numeroContratacao" value={processo.dadosContratacao?.numeroContratacao} onSave={onSave} />
              <FieldRow label="Agência" path="dadosContratacao.agencia" value={processo.dadosContratacao?.agencia} onSave={onSave} />
              <div className="pt-2 text-xs text-muted-foreground">
                Padrão do funeral (detectado pelos itens):{" "}
                <Badge variant="outline">{processo.dadosContratacao?.padraoFuneral ?? "NAO_IDENTIFICADO"}</Badge>
                {processo.dadosContratacao?.padraoFonte && (
                  <span className="ml-2 opacity-70">{processo.dadosContratacao.padraoFonte}</span>
                )}
              </div>
              <div className="mt-3 text-xs">
                <div className="font-medium mb-1">Itens contratados</div>
                <ul className="space-y-1">
                  {(processo.dadosContratacao?.itens ?? []).map((it, i) => (
                    <li key={i} className="flex justify-between border-b border-border/30 py-1">
                      <span>{it.descricao}</span>
                      <span className="text-muted-foreground">{it.quantidade ?? ""} {it.unidade ?? ""}</span>
                    </li>
                  ))}
                  {!(processo.dadosContratacao?.itens ?? []).length && <li className="text-muted-foreground">—</li>}
                </ul>
              </div>
            </Section>

            <Section title="Divergências">
              {divergencias.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma divergência detectada.</p>}
              {divergencias.map((d) => (
                <div key={d.id ?? `${d.campo}-${d.valorA}`} className="border border-border rounded p-2 mb-2 text-sm space-y-1">
                  <div className="font-medium">{d.campo}</div>
                  <div className="flex gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-muted">{d.valorA}</span>
                    <span className="px-2 py-0.5 rounded bg-muted">{d.valorB}</span>
                  </div>
                  {d.id && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => resolveDisc({ data: { discrepancyId: d.id!, status: "CONFIRMADO", valorFinal: d.valorA } }).then(() => refetch())}>Manter A</Button>
                      <Button size="sm" variant="outline" onClick={() => resolveDisc({ data: { discrepancyId: d.id!, status: "CONFIRMADO", valorFinal: d.valorB } }).then(() => refetch())}>Manter B</Button>
                      <Button size="sm" variant="ghost" onClick={() => resolveDisc({ data: { discrepancyId: d.id!, status: "DESCARTADO" } }).then(() => refetch())}>Descartar</Button>
                    </div>
                  )}
                </div>
              ))}
            </Section>

            <Section title="Pendências">
              {pendentes.length === 0 ? (
                <p className="text-sm text-emerald-600">Todos os campos obrigatórios preenchidos.</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {pendentes.map((p) => (
                    <li key={p.campo} className="flex justify-between">
                      <span>{p.campo}</span>
                      <Badge className={statusClass[p.motivo === "AUSENTE" ? "vermelho" : "amarelo"]}>{p.motivo}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {processo.cadastroSepultamentoGscemi && (
              <Section title="Cadastro do Sepultamento — GSCEMI">
                <GscemiSepultamentoView data={processo.cadastroSepultamentoGscemi} />
              </Section>
            )}

            {(processo.declaranteObitoGscemi || processo.declarantePagamento) && (
              <Section title="Declarantes — GSCEMI">
                <DeclarantesGscemiView
                  obito={processo.declaranteObitoGscemi}
                  pagamento={processo.declarantePagamento}
                />
              </Section>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function KV({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return (
    <div className="flex text-xs py-0.5 border-b border-border/30 last:border-none">
      <span className="w-40 shrink-0 text-muted-foreground">{k}</span>
      <span className="flex-1">{v}</span>
    </div>
  );
}

function GscemiSepultamentoView({ data }: { data: NonNullable<ProcessoFunerario["cadastroSepultamentoGscemi"]> }) {
  const proc = data.tipoProcedimento ?? {};
  const procList = Object.entries(proc)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-medium mb-1">Identificação</div>
        <KV k="Nº registro" v={data.numeroRegistro} />
        <KV k="Nº sepultado" v={data.numeroSepultado} />
        <KV k="Inscrição GSCEMI" v={data.inscricaoGscemi} />
        <KV k="Nº O.S." v={data.numeroOrdemServico} />
        <KV k="Nº contrato" v={data.numeroContrato} />
        <KV k="Nº D.O." v={data.numeroDeclaracaoObito} />
        <KV k="PRO-AIM" v={data.proAim} />
        <KV k="Plano funerário" v={data.temPlanoFunerario} />
        <KV k="Natureza óbito" v={data.naturezaObito} />
        <KV k="Parentesco (cad. sep.)" v={data.parentescoCadastroSepultamento} />
      </div>
      <div>
        <div className="text-xs font-medium mb-1">Procedimento</div>
        <KV k="Marcados" v={procList || undefined} />
      </div>
      <div>
        <div className="text-xs font-medium mb-1">Localização</div>
        <KV k="Cemitério" v={data.nomeCemiterio} />
        <KV k="Código cemitério" v={data.codigoCemiterio} />
        <KV k="Concessionário" v={data.nomeConcessionarioVinculado} />
        <KV k="Quadra" v={data.quadra} />
        <KV k="Letra" v={data.letra} />
        <KV k="Lote" v={data.lote} />
        <KV k="Nº jazigo" v={data.numeroJazigo} />
        <KV k="Tipo concessão" v={data.tipoConcessao} />
      </div>
      <div>
        <div className="text-xs font-medium mb-1">Livro e página</div>
        <KV k="Cartório" v={data.registroLivro?.cartorio} />
        <KV k="Distrito" v={data.registroLivro?.distrito} />
        <KV k="Livro" v={data.registroLivro?.livro} />
        <KV k="Página" v={data.registroLivro?.pagina} />
        <KV k="Nota fiscal" v={data.registroLivro?.notaFiscal} />
      </div>
      <div>
        <div className="text-xs font-medium mb-1">Placa de identificação</div>
        <KV k="Termo/Nº controle" v={data.placaIdentificacao?.termoNumeroControle} />
        <KV k="Nº placa" v={data.placaIdentificacao?.numeroPlacaIdentificacao} />
        <KV k="Tem lápide" v={data.placaIdentificacao?.temLapide} />
        <KV k="Tipo lápide" v={data.placaIdentificacao?.tipoLapide} />
        <KV k="Qtd gravações" v={data.placaIdentificacao?.quantidadeGravacoes} />
        <KV k="Lápide fixada" v={data.placaIdentificacao?.lapideFixada} />
        <KV k="Data fixação" v={data.placaIdentificacao?.dataFixacao} />
        <KV k="Situação sepultado" v={data.placaIdentificacao?.situacaoSepultado} />
      </div>
      {data.alertas?.length ? (
        <div className="space-y-1">
          <div className="text-xs font-medium">Alertas</div>
          {data.alertas.map((a, i) => (
            <div
              key={i}
              className={`text-xs px-2 py-1 rounded border ${
                a.nivel === "warn"
                  ? statusClass.amarelo
                  : a.nivel === "error"
                    ? statusClass.vermelho
                    : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {a.mensagem}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DeclaranteBlock({ title, d }: { title: string; d?: NonNullable<ProcessoFunerario["declaranteObitoGscemi"]> }) {
  if (!d) return null;
  return (
    <div>
      <div className="text-xs font-medium mb-1">{title}</div>
      <KV k="Nome" v={d.nome} />
      <KV k="Tipo pessoa" v={d.tipoPessoa} />
      <KV k="CPF" v={d.cpf} />
      <KV k="CNPJ" v={d.cnpj} />
      <KV k="Inscrição" v={d.inscricao} />
      <KV k="Telefone" v={d.telefone} />
      <KV k="Celular" v={d.celular} />
      <KV k="E-mail" v={d.email} />
      {d.endereco && (
        <>
          <KV k="CEP" v={d.endereco.cep} />
          <KV k="Logradouro" v={d.endereco.logradouro} />
          <KV k="Número" v={d.endereco.numero} />
          <KV k="Complemento" v={d.endereco.complemento} />
          <KV k="Bairro" v={d.endereco.bairro} />
          <KV k="Cidade" v={d.endereco.cidade} />
          <KV k="UF" v={d.endereco.uf} />
        </>
      )}
      {d.origemDadosDeclarantePagamento && (
        <KV k="Origem dos dados" v={d.origemDadosDeclarantePagamento} />
      )}
    </div>
  );
}

function DeclarantesGscemiView({
  obito,
  pagamento,
}: {
  obito?: NonNullable<ProcessoFunerario["declaranteObitoGscemi"]>;
  pagamento?: NonNullable<ProcessoFunerario["declarantePagamento"]>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <DeclaranteBlock title="Declarante do óbito (GSCEMI)" d={obito} />
      <DeclaranteBlock title="Declarante do pagamento" d={pagamento} />
    </div>
  );
}
