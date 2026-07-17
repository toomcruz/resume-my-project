/**
 * Revisão visual dos dados extraídos, organizada por conceitos amigáveis.
 * Aliases técnicos são agrupados e campos opcionais vazios ficam ocultos.
 */
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Pencil } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FieldConflict } from "@/lib/domain/vision/types";
import {
  isReviewBlankValue,
  type FieldStatus,
  type ReviewSummary,
} from "@/lib/vision/review-status";
import type { FlatFieldMeta } from "@/lib/vision/flatten-vision";
import {
  getFriendlyLabel,
  groupFields,
  type PresentationGroup,
  type PresentationSection,
} from "@/lib/vision/field-presentation";

export interface DocumentReviewProps {
  keys: readonly string[];
  fields: Record<string, string>;
  meta: Record<string, FlatFieldMeta | undefined>;
  statuses: Record<string, FieldStatus>;
  summary: ReviewSummary;
  conflicts: FieldConflict[];
  criticalKeys: ReadonlySet<string>;
  onFieldsChange: (next: Record<string, string>) => void;
  onConfirmField?: (key: string) => void;
}

type GroupStatus = FieldStatus;

const STATUS_PRIORITY: Record<GroupStatus, number> = {
  opcional_vazio: 0,
  normal: 1,
  revisar: 2,
  conflito: 3,
  nao_encontrado: 4,
};

const STATUS_LABEL: Record<GroupStatus, string> = {
  normal: "Confirmado",
  revisar: "Conferir",
  conflito: "Divergência",
  nao_encontrado: "Pendente",
  opcional_vazio: "Opcional não informado",
};

function groupWorstStatus(
  group: PresentationGroup,
  statuses: Record<string, FieldStatus>,
): GroupStatus {
  let worst: GroupStatus = "opcional_vazio";
  for (const key of group.keys) {
    const status = statuses[key] ?? "opcional_vazio";
    if (STATUS_PRIORITY[status] > STATUS_PRIORITY[worst]) worst = status;
  }
  return worst;
}

function groupIsCritical(group: PresentationGroup, criticalKeys: ReadonlySet<string>): boolean {
  return group.keys.some((key) => criticalKeys.has(key));
}

function groupValue(group: PresentationGroup, fields: Record<string, string>): string {
  for (const key of group.keys) {
    const value = fields[key];
    if (!isReviewBlankValue(value)) return value;
  }
  return "";
}

function groupAnchorId(group: PresentationGroup): string {
  return `rev-${group.id.replace(/[^a-z0-9_-]+/gi, "-")}`;
}

function actionable(status: GroupStatus): boolean {
  return status === "revisar" || status === "conflito" || status === "nao_encontrado";
}

export function DocumentReview({
  keys,
  fields,
  meta,
  statuses,
  summary,
  conflicts,
  criticalKeys,
  onFieldsChange,
  onConfirmField,
}: DocumentReviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [showAllPending, setShowAllPending] = useState(false);

  const { sections } = useMemo(() => groupFields({ keys, fields }), [keys, fields]);

  const visibleSections = useMemo<PresentationSection[]>(
    () =>
      sections
        .map((section) => ({
          ...section,
          groups: section.groups.filter(
            (group) => groupWorstStatus(group, statuses) !== "opcional_vazio",
          ),
        }))
        .filter((section) => section.groups.length > 0),
    [sections, statuses],
  );

  const pendingGroups = useMemo(
    () =>
      visibleSections.flatMap((section) =>
        section.groups.filter((group) => actionable(groupWorstStatus(group, statuses))),
      ),
    [visibleSections, statuses],
  );

  const conflictsByKey = useMemo(() => {
    const map = new Map<string, FieldConflict>();
    for (const conflict of conflicts) map.set(conflict.key, conflict);
    return map;
  }, [conflicts]);

  const counts = useMemo(() => {
    let criticas = 0;
    let divergencias = 0;
    let conferir = 0;
    let resolvidas = 0;
    let total = 0;
    let pendentes = 0;

    for (const section of visibleSections) {
      for (const group of section.groups) {
        const status = groupWorstStatus(group, statuses);
        const isCritical = groupIsCritical(group, criticalKeys);
        total += 1;

        if (status === "nao_encontrado") {
          pendentes += 1;
          if (isCritical) criticas += 1;
        } else if (status === "conflito") {
          pendentes += 1;
          divergencias += 1;
        } else if (status === "revisar") {
          pendentes += 1;
          conferir += 1;
        } else if (status === "normal" && !isReviewBlankValue(groupValue(group, fields))) {
          resolvidas += 1;
        }
      }
    }

    return { criticas, divergencias, conferir, resolvidas, total, pendentes };
  }, [visibleSections, statuses, criticalKeys, fields]);

  const progress = counts.total === 0 ? 100 : Math.round((counts.resolvidas / counts.total) * 100);

  function scrollToGroup(group: PresentationGroup) {
    const el = containerRef.current?.querySelector<HTMLElement>(`#${groupAnchorId(group)}`);
    if (!el) return;
    setPendingOpen(false);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary/60");
    window.setTimeout(() => el.classList.remove("ring-2", "ring-primary/60"), 1600);
  }

  function updateGroup(group: PresentationGroup, value: string) {
    const next = { ...fields };
    for (const key of group.keys) next[key] = value;
    onFieldsChange(next);
  }

  const displayedPending = showAllPending ? pendingGroups : pendingGroups.slice(0, 5);

  return (
    <div ref={containerRef} className="grid gap-4 lg:grid-cols-[280px,1fr]">
      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Revisão do documento</CardDescription>
            <CardTitle className="text-2xl">
              {counts.pendentes === 0
                ? "Tudo em ordem"
                : `${counts.pendentes} pendência${counts.pendentes > 1 ? "s" : ""}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-1.5">
              <SummaryLine color="destructive" label="Críticas" value={counts.criticas} />
              <SummaryLine color="destructive" label="Divergências" value={counts.divergencias} />
              <SummaryLine color="amber" label="Conferir" value={counts.conferir} />
              <SummaryLine color="emerald" label="Resolvidas" value={counts.resolvidas} />
            </div>
            <div className="pt-2">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Progresso</span>
                <span>
                  {counts.resolvidas} de {counts.total}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {pendingGroups.length > 0 && (
          <Card>
            <button
              type="button"
              onClick={() => setPendingOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              aria-expanded={pendingOpen}
            >
              <span className="text-sm font-medium">
                {pendingGroups.length} pendência{pendingGroups.length > 1 ? "s" : ""} — visualizar
              </span>
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", pendingOpen && "rotate-180")}
              />
            </button>
            {pendingOpen && (
              <CardContent className="max-h-[320px] space-y-1 overflow-auto border-t pt-2">
                {displayedPending.map((group) => {
                  const status = groupWorstStatus(group, statuses);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => scrollToGroup(group)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="truncate">{group.label}</span>
                      <StatusPill status={status} compact />
                    </button>
                  );
                })}
                {pendingGroups.length > 5 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowAllPending((show) => !show)}
                  >
                    {showAllPending ? "Mostrar menos" : `Ver todas (${pendingGroups.length})`}
                  </Button>
                )}
              </CardContent>
            )}
          </Card>
        )}
      </aside>

      <div className="space-y-4">
        {visibleSections.map((section) => (
          <Card key={section.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{section.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {section.groups.map((group) => {
                const status = groupWorstStatus(group, statuses);
                const isCritical = groupIsCritical(group, criticalKeys);
                const value = groupValue(group, fields);
                const valueKey =
                  group.keys.find((key) => !isReviewBlankValue(fields[key])) ?? group.primaryKey;
                const conflict = group.keys
                  .map((key) => conflictsByKey.get(key))
                  .find((item): item is FieldConflict => !!item);
                const info =
                  meta[valueKey] ??
                  group.keys.map((key) => meta[key]).find((item): item is FlatFieldMeta => !!item);

                return (
                  <GroupRow
                    key={group.id}
                    anchorId={groupAnchorId(group)}
                    group={group}
                    status={status}
                    isCritical={isCritical}
                    value={value}
                    conflict={conflict}
                    meta={info}
                    onChange={(nextValue) => updateGroup(group, nextValue)}
                    onConfirm={() => onConfirmField?.(valueKey)}
                  />
                );
              })}
            </CardContent>
          </Card>
        ))}

        {summary.blockingKeys.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Resolva as pendências críticas para liberar a geração dos documentos.
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryLine({
  color,
  label,
  value,
}: {
  color: "destructive" | "amber" | "emerald";
  label: string;
  value: number;
}) {
  const dot =
    color === "destructive"
      ? "bg-destructive"
      : color === "amber"
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function StatusPill({ status, compact }: { status: GroupStatus; compact?: boolean }) {
  if (status === "opcional_vazio") return null;
  if (status === "normal") {
    return compact ? null : (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        <Check className="h-3 w-3" /> {STATUS_LABEL.normal}
      </Badge>
    );
  }
  const cls =
    status === "conflito" || status === "nao_encontrado"
      ? "bg-destructive/5 text-destructive border-destructive/40"
      : "bg-amber-500/10 text-amber-700 border-amber-500/40 dark:text-amber-300";
  return (
    <Badge variant="outline" className={cn("gap-1", cls, compact && "h-5 px-1.5 text-[10px]")}>
      <AlertTriangle className={cn(compact ? "h-2.5 w-2.5" : "h-3 w-3")} />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

interface GroupRowProps {
  anchorId: string;
  group: PresentationGroup;
  status: GroupStatus;
  isCritical: boolean;
  value: string;
  conflict: FieldConflict | undefined;
  meta: FlatFieldMeta | undefined;
  onChange: (value: string) => void;
  onConfirm: () => void;
}

function GroupRow({
  anchorId,
  group,
  status,
  isCritical,
  value,
  conflict,
  meta,
  onChange,
  onConfirm,
}: GroupRowProps) {
  const [showAlt, setShowAlt] = useState(false);
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState(false);
  const blank = isReviewBlankValue(value);

  if (status === "normal" && !blank && !editing) {

    return (
      <div id={anchorId} className="scroll-mt-24 rounded-lg border px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">{group.label}</div>
            <div className="mt-1 break-words text-base">{value}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <StatusPill status={status} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setEditing(true)}
              aria-label={`Editar ${group.label}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const inputBorder =
    status === "conflito" || status === "nao_encontrado"
      ? "border-destructive/60 focus-visible:ring-destructive/25"
      : status === "revisar"
        ? "border-amber-500/60 focus-visible:ring-amber-500/25"
        : "";

  const placeholder = status === "nao_encontrado" ? "Informação pendente" : "Não informado";

  return (
    <div id={anchorId} className="scroll-mt-24 rounded-lg border px-3 py-2 transition-shadow">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <span>{group.label}</span>
            {isCritical && status !== "normal" && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-destructive">
                obrigatório
              </span>
            )}
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      {status === "conflito" &&
      conflict &&
      Array.isArray(conflict.candidates) &&
      conflict.candidates.length > 0 &&
      !manual ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Encontramos valores diferentes. Escolha qual deve ser usado:
          </p>
          <div className="flex flex-wrap gap-2">
            {conflict.candidates.map((candidate, index) => (
              <Button
                key={`${candidate?.value ?? index}-${index}`}
                type="button"
                variant="outline"
                size="sm"
                className="justify-start gap-2"
                onClick={() => {
                  onChange(String(candidate?.value ?? ""));
                  onConfirm();
                }}
              >
                <span className="shrink-0 text-xs text-muted-foreground">
                  {index === 0 ? "Documento principal" : `Documento ${index + 1}`}:
                </span>
                <span className="font-medium">{String(candidate?.value ?? "")}</span>
              </Button>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => setManual(true)}>
              Digitar manualmente
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Input
            value={value}
            placeholder={placeholder}
            onFocus={() => setEditing(true)}
            onChange={(event) => {
              setEditing(true);
              onChange(event.target.value);
            }}
            onBlur={() => setEditing(false)}
            className={inputBorder}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-h-[1rem] text-[11px] text-muted-foreground">
              {meta?.hasConflict === false && meta.source && status === "revisar" && (
                <>Origem: {String(meta.source).replace(/_/g, " ")}</>
              )}
            </div>
            <div className="flex items-center gap-1">
              {(status === "revisar" || (status === "conflito" && manual)) && !blank && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-emerald-700 hover:text-emerald-700"
                  onClick={() => {
                    onConfirm();
                    setManual(false);
                  }}
                >
                  <Check className="h-3 w-3" /> Confirmar valor
                </Button>
              )}
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => setEditing(false)}
                >
                  Concluir edição
                </Button>
              )}
              {manual && conflict && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => setManual(false)}
                >
                  Voltar às opções
                </Button>
              )}
              {group.keys.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowAlt((show) => !show)}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight
                    className={cn("h-3 w-3 transition-transform", showAlt && "rotate-90")}
                  />
                  {group.keys.length} campos vinculados
                </button>
              )}
            </div>
          </div>
          {showAlt && group.keys.length > 1 && (
            <div className="pt-1 pl-4 text-[11px] text-muted-foreground">
              Este dado é aplicado em: {group.keys.map((key) => getFriendlyLabel(key)).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function hasCriticalBlocking(summary: ReviewSummary): boolean {
  return summary.blockingKeys.length > 0;
}

export const DocumentReviewLoading = () => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin" /> Preparando revisão…
  </div>
);
