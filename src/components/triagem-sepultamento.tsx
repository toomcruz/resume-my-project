import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarIcon, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  applyLocalSepultamento,
  computeQuickDate,
  formatIsoToBr,
  HORARIOS_SEPULTAMENTO,
  SALAS_VELORIO,
  type TriagemSepultamentoState,
} from "@/lib/triagem-sepultamento";
import { readPlacaFromImage } from "@/lib/vision/read-placa.functions";
import { getErrorMessage } from "@/lib/error-message";

interface TriagemSepultamentoProps {
  subprocess: string;
  extras: Record<string, string>;
  onSubprocessChange: (value: string) => void;
  onExtrasChange: (patch: Record<string, string>) => void;
}

function BtnChip({
  selected,
  onClick,
  children,
  className,
  type = "button",
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        "rounded-md border px-4 py-3 text-sm font-medium transition-colors",
        "hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-input bg-background hover:bg-accent",
        className,
      )}
      aria-pressed={selected}
    >
      {children}
    </button>
  );
}

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

  function pickLocal(local: "quadra_geral" | "jazigo") {
    onSubprocessChange(local);
    const derived = applyLocalSepultamento(local);
    onExtrasChange({
      concessao: derived.concessao,
      quadra_geral_gaveta: derived.quadra_geral_gaveta,
    });
  }

  function pickQuickDate(choice: "hoje" | "amanha" | "mais2") {
    onExtrasChange({ data_agendada: computeQuickDate(choice) });
  }

  function pickCalendarDate(date: Date | undefined) {
    if (!date) return;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    onExtrasChange({ data_agendada: `${y}-${m}-${d}` });
  }

  function pickHorario(horario: string) {
    onExtrasChange({ hora_sepultamento: horario });
  }

  function pickWakeChoice(value: "SIM" | "NAO") {
    if (value === "SIM") {
      onExtrasChange({ tem_velorio: "SIM", sem_velorio: "" });
      return;
    }
    onExtrasChange({ tem_velorio: "NAO", sem_velorio: "SIM" });
  }

  function pickSala(letra: string) {
    onExtrasChange({
      sala_velorio: letra,
      tem_velorio: "SIM",
      sem_velorio: "",
    });
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

  function corrigirPlaca() {
    if (!placaEncontrada) return;
    onExtrasChange({ placa_identificacao: placaEncontrada, placa_confirmada: "" });
    setPlacaEncontrada(null);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Local do sepultamento
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <BtnChip
            selected={state.subprocess === "quadra_geral"}
            onClick={() => pickLocal("quadra_geral")}
          >
            QUADRA GERAL
          </BtnChip>
          <BtnChip selected={state.subprocess === "jazigo"} onClick={() => pickLocal("jazigo")}>
            JAZIGO
          </BtnChip>
        </div>
      </section>

      <section className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Data</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <BtnChip
            selected={state.data_agendada === computeQuickDate("hoje")}
            onClick={() => pickQuickDate("hoje")}
          >
            HOJE
          </BtnChip>
          <BtnChip
            selected={state.data_agendada === computeQuickDate("amanha")}
            onClick={() => pickQuickDate("amanha")}
          >
            AMANHÃ
          </BtnChip>
          <BtnChip
            selected={state.data_agendada === computeQuickDate("mais2")}
            onClick={() => pickQuickDate("mais2")}
          >
            +2 DIAS
          </BtnChip>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition-colors",
                  "border-input bg-background hover:border-primary hover:bg-accent",
                )}
              >
                <CalendarIcon className="h-4 w-4" /> OUTRA DATA
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
            Data escolhida:{" "}
            <span className="font-medium text-foreground">
              {formatIsoToBr(state.data_agendada)}
            </span>
          </p>
        )}
      </section>

      <section className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Horário</Label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {HORARIOS_SEPULTAMENTO.map((horario) => (
            <BtnChip
              key={horario}
              selected={state.hora_sepultamento === horario}
              onClick={() => pickHorario(horario)}
            >
              {horario}
            </BtnChip>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Placa de identificação
        </Label>
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
              <Button type="button" size="sm" variant="outline" onClick={corrigirPlaca}>
                CORRIGIR
              </Button>
            </div>
          </div>
        )}
        {state.placa_confirmada === "SIM" && state.placa_identificacao && !placaEncontrada && (
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Upload className="h-3 w-3" /> Placa confirmada — será usada no documento.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div>
          <Label className="text-base font-semibold">Haverá velório?</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Os dados da agenda só aparecem quando houver velório.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <BtnChip
            selected={state.tem_velorio === "SIM"}
            onClick={() => pickWakeChoice("SIM")}
            className="text-left"
          >
            <span className="block">SIM</span>
            <span className="block text-xs font-normal opacity-80">
              Velório seguido de sepultamento
            </span>
          </BtnChip>
          <BtnChip
            selected={state.tem_velorio === "NAO"}
            onClick={() => pickWakeChoice("NAO")}
            className="text-left"
          >
            <span className="block">NÃO</span>
            <span className="block text-xs font-normal opacity-80">Somente sepultamento</span>
          </BtnChip>
        </div>
      </section>

      {state.tem_velorio === "SIM" && (
        <section className="space-y-5 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div>
            <h3 className="font-semibold">Dados para a Agenda Geral</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Ao concluir o atendimento, o velório e o sepultamento serão vinculados automaticamente
              à agenda. Preencha apenas as informações disponíveis.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Sala do velório
            </Label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {SALAS_VELORIO.map((sala) => (
                <BtnChip
                  key={sala}
                  selected={state.sala_velorio === sala}
                  onClick={() => pickSala(sala)}
                >
                  {sala}
                </BtnChip>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inicio_velorio">Início do velório</Label>
              <Input
                id="inicio_velorio"
                type="time"
                value={extras.inicio_velorio ?? ""}
                onChange={(event) => onExtrasChange({ inicio_velorio: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fim_velorio">Fim do velório</Label>
              <Input
                id="fim_velorio"
                type="time"
                value={extras.fim_velorio ?? ""}
                onChange={(event) => onExtrasChange({ fim_velorio: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="local_sepultamento">Local do sepultamento</Label>
            <Input
              id="local_sepultamento"
              value={extras.local_sepultamento ?? ""}
              onChange={(event) => onExtrasChange({ local_sepultamento: event.target.value })}
              placeholder="Quadra, terreno, gaveta ou jazigo"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="funeraria">Funerária / agência</Label>
            <Input
              id="funeraria"
              value={extras.funeraria ?? ""}
              onChange={(event) => onExtrasChange({ funeraria: event.target.value })}
            />
          </div>
        </section>
      )}
    </div>
  );
}
