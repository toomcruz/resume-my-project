import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, CalendarIcon, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  applyLocalSepultamento,
  computeQuickDate,
  formatIsoToBr,
  HORARIOS_SEPULTAMENTO,
  HORARIOS_VELORIO,
  SALAS_VELORIO,
  type TriagemSepultamentoState,
} from "@/lib/triagem-sepultamento";
import { readPlacaFromImage } from "@/lib/vision/read-placa.functions";
import { getErrorMessage } from "@/lib/error-message";
import { EXHUMATION_TIME_SLOTS } from "@/lib/domain/exhumation-slots";

interface TriagemSepultamentoProps {
  subprocess: string;
  extras: Record<string, string>;
  onSubprocessChange: (value: string) => void;
  onExtrasChange: (patch: Record<string, string>) => void;
}

function Chip({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative rounded-xl border px-4 py-4 text-sm font-semibold transition-all",
        "hover:-translate-y-0.5 hover:border-primary hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-lg"
          : "border-input bg-background text-foreground",
        className,
      )}
      aria-pressed={selected}
    >
      {children}
      {selected && (
        <Check className="absolute right-2 top-2 h-3.5 w-3.5 opacity-90" strokeWidth={3} />
      )}
    </button>
  );
}

function WakeTimeSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const options =
    HORARIOS_VELORIO.includes(value) || !value ? HORARIOS_VELORIO : [value, ...HORARIOS_VELORIO];

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} className="h-11">
        <SelectValue placeholder="Selecione o horário" />
      </SelectTrigger>
      <SelectContent>
        {options.map((time) => (
          <SelectItem key={time} value={time}>
            {time}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type StepId =
  | "local"
  | "gaveta"
  | "data"
  | "horario_pps"
  | "horario"
  | "velorio"
  | "sala"
  | "detalhes_velorio"
  | "placa";

export function TriagemSepultamento({
  subprocess,
  extras,
  onSubprocessChange,
  onExtrasChange,
}: TriagemSepultamentoProps) {
  const inferredWakeChoice =
    (extras.tem_velorio as "SIM" | "NAO" | "") ||
    (extras.sem_velorio === "SIM"
      ? "NAO"
      : extras.sala_velorio || extras.inicio_velorio || extras.fim_velorio
        ? "SIM"
        : "");

  const state: TriagemSepultamentoState = {
    subprocess,
    data_agendada: extras.data_agendada,
    hora_sepultamento: extras.hora_sepultamento,
    jazigo_possui_gaveta_disponivel:
      (extras.jazigo_possui_gaveta_disponivel as "sim" | "nao" | "") || "",
    hora_exumacao_pps: extras.hora_exumacao_pps,
    tem_velorio: inferredWakeChoice,
    sala_velorio: extras.sala_velorio,
    sem_velorio: (extras.sem_velorio as "SIM" | "") || "",
    placa_identificacao: extras.placa_identificacao,
    placa_confirmada: (extras.placa_confirmada as "SIM" | "") || "",
  };

  const readPlaca = useServerFn(readPlacaFromImage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [placaEncontrada, setPlacaEncontrada] = useState<string | null>(null);

  const steps: StepId[] = useMemo(() => {
    const base: StepId[] = ["local"];
    if (state.subprocess === "jazigo") base.push("gaveta");
    base.push("data");
    if (state.subprocess === "jazigo" && state.jazigo_possui_gaveta_disponivel === "nao") {
      base.push("horario_pps");
    }
    base.push("horario", "velorio");
    if (state.tem_velorio === "SIM") base.push("sala", "detalhes_velorio");
    base.push("placa");
    return base;
  }, [state.jazigo_possui_gaveta_disponivel, state.subprocess, state.tem_velorio]);

  const [stepIndex, setStepIndex] = useState(0);
  useEffect(() => {
    if (stepIndex >= steps.length) setStepIndex(steps.length - 1);
  }, [steps.length, stepIndex]);

  const step = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;

  function next() {
    if (!isLast) setStepIndex((i) => i + 1);
  }
  function prev() {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  function pickLocal(local: "quadra_geral" | "jazigo") {
    onSubprocessChange(local);
    const derived = applyLocalSepultamento(local);
    const sameLocal = state.subprocess === local;
    onExtrasChange({
      concessao: derived.concessao,
      quadra_geral_gaveta: derived.quadra_geral_gaveta,
      jazigo_possui_gaveta_disponivel: sameLocal ? state.jazigo_possui_gaveta_disponivel || "" : "",
      hora_exumacao_pps: sameLocal ? state.hora_exumacao_pps || "" : "",
      tipo_agenda_exumacao: "",
    });
    next();
  }

  function pickGaveta(value: "sim" | "nao") {
    onExtrasChange({
      jazigo_possui_gaveta_disponivel: value,
      hora_exumacao_pps: value === "sim" ? "" : extras.hora_exumacao_pps || "",
      tipo_agenda_exumacao: "",
    });
    setTimeout(() => setStepIndex((index) => index + 1), 0);
  }

  function pickHorarioPps(horario: string) {
    onExtrasChange({ hora_exumacao_pps: horario });
    next();
  }

  function pickQuickDate(choice: "hoje" | "amanha" | "mais2") {
    onExtrasChange({ data_agendada: computeQuickDate(choice) });
    next();
  }

  function pickCalendarDate(date: Date | undefined) {
    if (!date) return;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    onExtrasChange({ data_agendada: `${y}-${m}-${d}` });
    next();
  }

  function pickHorario(horario: string) {
    // Horário do sepultamento = fim do velório (regra do negócio).
    // Propaga automaticamente para fim_velorio se ainda estiver vazio.
    const patch: Record<string, string> = { hora_sepultamento: horario };
    if (!extras.fim_velorio?.trim()) patch.fim_velorio = horario;
    onExtrasChange(patch);
    next();
  }

  function pickWakeChoice(value: "SIM" | "NAO") {
    if (value === "SIM") {
      onExtrasChange({ tem_velorio: "SIM", sem_velorio: "" });
    } else {
      onExtrasChange({
        tem_velorio: "NAO",
        sem_velorio: "SIM",
        sala_velorio: "",
        inicio_velorio: "",
        fim_velorio: "",
      });
    }
    // Use timeout so `steps` recomputes with new tem_velorio before we advance.
    setTimeout(() => setStepIndex((i) => i + 1), 0);
  }

  function pickSala(letra: string) {
    onExtrasChange({
      sala_velorio: letra,
      tem_velorio: "SIM",
      sem_velorio: "",
    });
    next();
  }

  function updatePlacaText(value: string) {
    onExtrasChange({
      placa_identificacao: value,
      placa_confirmada: value.trim() ? "SIM" : "",
    });
    setPlacaEncontrada(null);
  }

  async function handleReadPlaca(file: File) {
    setReading(true);
    setPlacaEncontrada(null);
    try {
      const { compressImageToDataUrl } = await import("@/lib/image-compress");
      const dataUrl = await compressImageToDataUrl(file, { maxSide: 1280, quality: 0.82 });
      const { placa } = await readPlaca({ data: { imageDataUrl: dataUrl } });
      if (!placa) {
        toast.error("Não foi possível identificar a placa. Preencha manualmente.");
        return;
      }
      setPlacaEncontrada(placa);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Falha ao ler a placa"));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function confirmarPlaca() {
    if (!placaEncontrada) return;
    onExtrasChange({ placa_identificacao: placaEncontrada, placa_confirmada: "SIM" });
    setPlacaEncontrada(null);
    toast.success("Placa confirmada");
  }

  const stepLabels: Record<StepId, string> = {
    local: "Local do sepultamento",
    gaveta: "Disponibilidade no jazigo",
    data: "Data",
    horario_pps: "Horário da Exumação PPS",
    horario: "Horário",
    velorio: "Haverá velório?",
    sala: "Sala do velório",
    detalhes_velorio: "Detalhes do velório",
    placa: "Placa de identificação",
  };

  return (
    <div className="space-y-5">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium uppercase tracking-wide text-muted-foreground">
            Passo {stepIndex + 1} de {steps.length}
          </span>
          <span className="text-muted-foreground">{stepLabels[step]}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={false}
            animate={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="min-h-[220px]"
        >
          {step === "local" && (
            <section className="space-y-3">
              <Label className="text-base font-semibold">Onde será o sepultamento?</Label>
              <div className="grid grid-cols-2 gap-3">
                <Chip
                  selected={state.subprocess === "quadra_geral"}
                  onClick={() => pickLocal("quadra_geral")}
                  className="py-6"
                >
                  QUADRA GERAL
                </Chip>
                <Chip
                  selected={state.subprocess === "jazigo"}
                  onClick={() => pickLocal("jazigo")}
                  className="py-6"
                >
                  JAZIGO
                </Chip>
              </div>
            </section>
          )}

          {step === "gaveta" && (
            <section className="space-y-4">
              <div className="space-y-1">
                <Label className="text-base font-semibold">
                  Há gaveta disponível no jazigo para este sepultamento?
                </Label>
                <p className="text-sm text-muted-foreground">
                  Com gaveta disponível, segue somente o sepultamento. Sem gaveta, será necessária
                  uma Exumação PPS para liberar a vaga.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Chip
                  selected={state.jazigo_possui_gaveta_disponivel === "sim"}
                  onClick={() => pickGaveta("sim")}
                  className="py-6"
                >
                  SIM, HÁ GAVETA
                </Chip>
                <Chip
                  selected={state.jazigo_possui_gaveta_disponivel === "nao"}
                  onClick={() => pickGaveta("nao")}
                  className="py-6"
                >
                  NÃO, PRECISA LIBERAR VAGA
                </Chip>
              </div>
            </section>
          )}

          {step === "data" && (
            <section className="space-y-3">
              <Label className="text-base font-semibold">Data do sepultamento</Label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Chip
                  selected={state.data_agendada === computeQuickDate("hoje")}
                  onClick={() => pickQuickDate("hoje")}
                >
                  HOJE
                </Chip>
                <Chip
                  selected={state.data_agendada === computeQuickDate("amanha")}
                  onClick={() => pickQuickDate("amanha")}
                >
                  AMANHÃ
                </Chip>
                <Chip
                  selected={state.data_agendada === computeQuickDate("mais2")}
                  onClick={() => pickQuickDate("mais2")}
                >
                  +2 DIAS
                </Chip>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-4 text-sm font-semibold transition-all",
                        "border-input bg-background hover:-translate-y-0.5 hover:border-primary hover:shadow-md",
                      )}
                    >
                      <CalendarIcon className="h-4 w-4" /> OUTRA
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={
                        state.data_agendada ? new Date(`${state.data_agendada}T00:00`) : undefined
                      }
                      onSelect={pickCalendarDate}
                      initialFocus
                      className={cn("pointer-events-auto p-3")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {state.data_agendada && (
                <p className="text-sm text-muted-foreground">
                  Selecionado:{" "}
                  <span className="font-medium text-foreground">
                    {formatIsoToBr(state.data_agendada)}
                  </span>
                </p>
              )}
            </section>
          )}

          {step === "horario_pps" && (
            <section className="space-y-3">
              <div className="space-y-1">
                <Label className="text-base font-semibold">Horário da Exumação PPS</Label>
                <p className="text-sm text-muted-foreground">
                  Esta etapa aparece somente porque o jazigo não tem gaveta disponível.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {EXHUMATION_TIME_SLOTS.map((horario) => (
                  <Chip
                    key={horario}
                    selected={state.hora_exumacao_pps === horario}
                    onClick={() => pickHorarioPps(horario)}
                  >
                    {horario}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          {step === "horario" && (
            <section className="space-y-3">
              <Label className="text-base font-semibold">Horário do sepultamento</Label>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {HORARIOS_SEPULTAMENTO.map((horario) => (
                  <Chip
                    key={horario}
                    selected={state.hora_sepultamento === horario}
                    onClick={() => pickHorario(horario)}
                  >
                    {horario}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          {step === "velorio" && (
            <section className="space-y-3">
              <Label className="text-base font-semibold">Haverá velório?</Label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Chip
                  selected={state.tem_velorio === "SIM"}
                  onClick={() => pickWakeChoice("SIM")}
                  className="py-6 text-left"
                >
                  <span className="block text-base">SIM</span>
                  <span className="block text-xs font-normal opacity-80">
                    Velório seguido de sepultamento
                  </span>
                </Chip>
                <Chip
                  selected={state.tem_velorio === "NAO"}
                  onClick={() => pickWakeChoice("NAO")}
                  className="py-6 text-left"
                >
                  <span className="block text-base">NÃO</span>
                  <span className="block text-xs font-normal opacity-80">Somente sepultamento</span>
                </Chip>
              </div>
            </section>
          )}

          {step === "sala" && (
            <section className="space-y-3">
              <Label className="text-base font-semibold">Sala do velório</Label>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {SALAS_VELORIO.map((sala) => (
                  <Chip
                    key={sala}
                    selected={state.sala_velorio === sala}
                    onClick={() => pickSala(sala)}
                    className="py-6 text-lg"
                  >
                    {sala}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          {step === "detalhes_velorio" && (
            <section className="space-y-4">
              <Label className="text-base font-semibold">Detalhes do velório (opcional)</Label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="inicio_velorio">Início</Label>
                  <WakeTimeSelect
                    id="inicio_velorio"
                    value={extras.inicio_velorio ?? ""}
                    onChange={(value) => onExtrasChange({ inicio_velorio: value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fim_velorio">Fim (= horário do sepultamento)</Label>
                  <WakeTimeSelect
                    id="fim_velorio"
                    value={extras.fim_velorio ?? extras.hora_sepultamento ?? ""}
                    onChange={(value) => onExtrasChange({ fim_velorio: value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Preenchido automaticamente com o horário do sepultamento — altere só se o
                    velório terminar em horário diferente.
                  </p>
                </div>
              </div>
            </section>
          )}

          {step === "placa" && (
            <section className="space-y-3">
              <Label className="text-base font-semibold">Placa de identificação (opcional)</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={state.placa_identificacao ?? ""}
                  onChange={(event) => updatePlacaText(event.target.value)}
                  placeholder="Digite ou leia do print"
                  aria-label="Placa de identificação"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={reading}
                  className="shrink-0 gap-2"
                >
                  {reading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  LER DO PRINT
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleReadPlaca(file);
                  }}
                />
              </div>
              {placaEncontrada && (
                <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                  <div className="text-sm">
                    Placa encontrada: <span className="font-semibold">{placaEncontrada}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={confirmarPlaca}>
                      CONFIRMAR
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setPlacaEncontrada(null)}
                    >
                      DESCARTAR
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={prev}
          disabled={stepIndex === 0}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        {!isLast && (step === "detalhes_velorio" || step === "placa") && (
          <Button type="button" onClick={next} className="gap-1">
            Avançar <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        {isLast && (
          <span className="text-xs text-muted-foreground">
            Triagem completa — clique em <span className="font-semibold">Continuar</span> abaixo.
          </span>
        )}
      </div>
    </div>
  );
}
