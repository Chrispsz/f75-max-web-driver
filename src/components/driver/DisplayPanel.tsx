"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Eraser, Image as ImageIcon, Layers, Loader2, Monitor, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Chip, FieldLabel, LockedNote, MonoLine, Segmented, SectionHeader } from "./atoms";
import type { F75Driver } from "@/lib/f75/driver";
import { f75log } from "@/lib/f75/logger";
import {
  buildDisplayStream,
  decodeAnimatedGif,
  decodeStillImage,
  decodeFrameToImageData,
  generateAnimation,
  type DisplayFrame,
  type EncodedDisplayStream,
  type FitMode,
} from "@/lib/f75/protocol";

interface Prepared {
  stream: EncodedDisplayStream;
  frames: DisplayFrame[];
  fileName: string;
  file: File | null;
}

/** Pack de artes geradas pra composição branco/cinza + LED ciano (#41E8FF). */
const READY_ARTS = [
  { file: "/art/f75-badge.gif", name: "F75 badge", desc: "logo prata + brilho ciano" },
  { file: "/art/aurora-ciano.gif", name: "Aurora ciano", desc: "ondas gelo em loop" },
  { file: "/art/pulse-eq.gif", name: "Pulso EQ", desc: "barras ciano pulsando" },
] as const;

export function DisplayPanel({
  driver,
  run,
  busy,
  ready,
}: {
  driver: F75Driver | null;
  run: (label: string, action: () => Promise<void>) => Promise<void>;
  busy: string | null;
  ready: boolean;
}) {
  const [fit, setFit] = useState<FitMode>("contain");
  const [slot, setSlot] = useState("1");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [progress, setProgress] = useState({ sent: 0, total: 0, eta: 0 });
  const [uploading, setUploading] = useState(false);
  const [autoClock, setAutoClock] = useState(false);
  const [eraseArmed, setEraseArmed] = useState(false);
  const eraseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const preparedRef = useRef<Prepared | null>(null);
  const cancelRef = useRef({ cancelled: false });
  const slotRef = useRef("1");
  const clockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  preparedRef.current = prepared;
  slotRef.current = slot;

  /* --------------------------- prévia animada --------------------------- */

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !prepared) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const draw = () => {
      if (stopped || !preparedRef.current) return;
      const stream = preparedRef.current.stream;
      try {
        ctx.putImageData(decodeFrameToImageData(stream.data, index), 0, 0);
      } catch {
        /* stream trocado no meio — a próxima passada usa o novo */
      }
      const delay = Math.max(16, (stream.delays[index] ?? 50) * 2);
      index = (index + 1) % stream.frameCount;
      timer = setTimeout(draw, delay);
    };
    draw();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [prepared]);

  /* ------------------------------ relógio ------------------------------- */

  const syncClock = useCallback(() => run("clock", () => driver!.syncClock()), [run, driver]);

  useEffect(() => {
    if (!autoClock || !driver) return;
    void syncClock();
    clockTimer.current = setInterval(() => void syncClock(), 60_000);
    return () => {
      if (clockTimer.current) clearInterval(clockTimer.current);
      clockTimer.current = null;
    };
  }, [autoClock, driver, syncClock]);

  /* ------------------------------ conteúdo ------------------------------ */

  /** Decode + encode RGB565 + prepara estado. fitForEncode explícito evita
   *  closure velha quando o ajuste muda junto (re-encode on-change). */
  const prepare = async (file: File, fitForEncode: FitMode) => {
    f75log.info(`Arquivo: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
    f75log.info("Decodificando e convertendo pra RGB565 128×128…");
    const frames: DisplayFrame[] = file.type === "image/gif" ? await decodeAnimatedGif(file) : await decodeStillImage(file);
    const stream = buildDisplayStream(frames, fitForEncode);
    f75log.ok(
      `Pronto: ${stream.frameCount} frame(s) · ${stream.chunkCount} blocos de 4 KB · ${(stream.data.length / 1024).toFixed(0)} KB · ${stream.avgFps.toFixed(1)} fps`
    );
    setPrepared({ stream, frames, fileName: file.name, file });
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    setProgress({ sent: 0, total: 0, eta: 0 });
    void run("prepare", () => prepare(file, fit));
  };

  /** Re-encode com o novo fit (arquivos reais; animações geradas já são 128×128). */
  const reencodeWithFit = (newFit: FitMode) => {
    setFit(newFit);
    const current = preparedRef.current;
    if (current?.file) void run("prepare", () => prepare(current.file!, newFit));
  };

  const handleGenerate = (kind: "bounce" | "plasma") =>
    void run("generate", async () => {
      const frames = generateAnimation(kind, 45);
      const stream = buildDisplayStream(frames, "stretch");
      f75log.ok(`Animação gerada (${kind}): ${stream.frameCount} frames · ${stream.chunkCount} blocos · 15 fps · loop perfeito`);
      setPrepared({ stream, frames, fileName: kind === "bounce" ? "bola-ciano (gerada)" : "plasma-gelo (gerada)", file: null });
    });

  /** Baixa uma arte do pack (public/art) e roda o mesmo pipeline do upload. */
  const loadReadyArt = (art: (typeof READY_ARTS)[number]) =>
    void run("art", async () => {
      f75log.info(`Arte pronta “${art.name}” — baixando ${art.file}…`);
      const res = await fetch(art.file);
      if (!res.ok) throw new Error(`Falha ao baixar ${art.file} (HTTP ${res.status}).`);
      const file = new File([await res.blob()], `${art.name}.gif`, { type: "image/gif" });
      await prepare(file, "stretch");
    });

  const clearPrepared = () => {
    setPrepared(null);
    setProgress({ sent: 0, total: 0, eta: 0 });
  };

  const upload = () =>
    void run("upload", async () => {
      const current = preparedRef.current;
      if (!current) return;
      const token = { cancelled: false };
      cancelRef.current = token;
      setUploading(true);
      setProgress({ sent: 0, total: current.stream.chunkCount, eta: 0 });
      try {
        await driver!.uploadDisplay(current.stream, Number(slotRef.current), (p) => setProgress({ sent: p.sent, total: p.total, eta: p.etaSeconds }), token);
      } finally {
        setUploading(false);
      }
    });

  const cancelUpload = () => {
    cancelRef.current.cancelled = true;
    f75log.warn("Cancelamento solicitado — parando após o bloco atual…");
  };

  const activateSlot = () =>
    void run("slot", () => driver!.activateDisplaySlot(Number(slotRef.current)));

  const eraseMemory = () => {
    if (!eraseArmed) {
      setEraseArmed(true);
      if (eraseTimer.current) clearTimeout(eraseTimer.current);
      eraseTimer.current = setTimeout(() => setEraseArmed(false), 6000);
      f75log.warn("Apagar memória de display: clique de novo pra confirmar (apaga TODOS os slots).");
      return;
    }
    if (eraseTimer.current) clearTimeout(eraseTimer.current);
    setEraseArmed(false);
    void run("erase", async () => {
      await driver!.eraseDisplayMemory((stage) => f75log.info(`· ${stage}`));
    });
  };

  const percent = progress.total > 0 ? Math.round((progress.sent / progress.total) * 100) : 0;

  return (
    <section className="space-y-5" aria-label="Tela">
      <SectionHeader
        icon={Monitor}
        title="Tela"
        desc="Display 128×128 · RGB565"
        right={
          prepared && (
            <MonoLine>
              {`${prepared.stream.frameCount}f · ${prepared.stream.chunkCount} blocos · ${(prepared.stream.data.length / 1024).toFixed(0)} KB · ${prepared.stream.avgFps.toFixed(1)} fps`}
            </MonoLine>
          )
        }
      />

      {!ready && (
        <LockedNote>
          <Monitor className="h-3.5 w-3.5 shrink-0" />
          Conecte o teclado via cabo USB-C — display usa o canal 0xFF68 (só existe no cabo).
        </LockedNote>
      )}

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="space-y-5 p-4 sm:p-5">
          <div className="space-y-2">
            <FieldLabel>Conteúdo</FieldLabel>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (ready) handleFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
                ready ? "border-zinc-700 hover:border-emerald-500/50 hover:bg-emerald-500/[0.03]" : "cursor-not-allowed border-zinc-800 opacity-50"
              }`}
            >
              <ImageIcon className="h-5 w-5 text-zinc-500" />
              <span className="text-xs text-zinc-400">
                <strong className="text-zinc-200">GIF, PNG, JPG ou WebP</strong> — clique ou arraste aqui
              </span>
              <span className="text-[10px] text-zinc-600">convertido pra RGB565 128×128 exatamente como o driver nativo</span>
              <input
                type="file"
                accept="image/gif,image/png,image/jpeg,image/webp"
                disabled={!ready}
                className="sr-only"
                onChange={(e) => {
                  handleFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleGenerate("bounce")} disabled={!ready || busy !== null} variant="outline" size="sm" className="h-8 gap-1.5 border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" /> Gerar: bola ciano
              </Button>
              <Button onClick={() => handleGenerate("plasma")} disabled={!ready || busy !== null} variant="outline" size="sm" className="h-8 gap-1.5 border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" /> Gerar: plasma gelo
              </Button>
            </div>
            <div className="space-y-1.5 border-t border-zinc-800/70 pt-3">
              <FieldLabel>Artes prontas · 128×128 · ciano/branco/cinza</FieldLabel>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {READY_ARTS.map((a) => (
                  <button
                    key={a.file}
                    type="button"
                    disabled={!ready || busy !== null}
                    onClick={() => loadReadyArt(a)}
                    className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-2 text-left transition-colors hover:border-emerald-500/50 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="block text-xs font-medium text-zinc-200">{a.name}</span>
                    <span className="block text-[10px] text-zinc-500">{a.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {prepared && (
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              <div className="space-y-2">
                <canvas
                  ref={canvasRef}
                  width={128}
                  height={128}
                  className="h-36 w-36 rounded-lg border border-zinc-800 bg-black [image-rendering:pixelated]"
                  aria-label="Prévia do conteúdo no display do teclado"
                />
                <p className="truncate text-[10px] text-zinc-600" title={prepared.fileName}>
                  {prepared.fileName}
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <FieldLabel>Ajuste</FieldLabel>
                  <Segmented
                    disabled={uploading}
                    value={fit}
                    onChange={reencodeWithFit}
                    options={[
                      { value: "contain", label: "Conter", title: "Cabe inteira, com bordas" },
                      { value: "cover", label: "Preencher", title: "Cobre tudo, corta bordas" },
                      { value: "stretch", label: "Esticar", title: "Força 128×128" },
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  {uploading || percent > 0 ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span className="font-mono">
                          {progress.sent}/{progress.total} blocos · {percent}%
                        </span>
                        <span className="font-mono">{progress.eta > 0 ? `ETA ${progress.eta.toFixed(0)}s` : "—"}</span>
                      </div>
                      <Progress value={percent} className="h-1.5" />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={upload} disabled={!ready || busy !== null} className="h-9 bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
                      {busy === "upload" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      Enviar pro slot {slot}
                    </Button>
                    {uploading ? (
                      <Button onClick={cancelUpload} variant="outline" className="h-9 border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">
                        <X className="mr-2 h-4 w-4" /> Cancelar
                      </Button>
                    ) : (
                      <Button onClick={clearPrepared} variant="outline" className="h-9 border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800">
                        <Eraser className="mr-2 h-4 w-4" /> Limpar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1.5">
              <FieldLabel>Slot de destino</FieldLabel>
              <Segmented
                disabled={uploading || !ready}
                value={slot}
                onChange={setSlot}
                options={["1", "2", "3"].map((s) => ({ value: s, label: `Slot ${s}` }))}
              />
            </div>
            <Button
              onClick={activateSlot}
              disabled={!ready || busy !== null || uploading}
              variant="outline"
              size="sm"
              className="h-8 border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800"
              title="Troca o conteúdo exibido sem reenviar — usa metadados + commit do protocolo nativo"
            >
              {busy === "slot" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Layers className="mr-1.5 h-3.5 w-3.5" />}
              Ativar slot {slot}
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Enviar pro slot <strong className="text-zinc-300">{slot}</strong> já ativa o conteúdo no commit. “Ativar” troca pro slot {slot} sem reenviar — se a telinha não mudar, seu firmware só troca no upload (reenvie a imagem).
          </p>
          <div className="flex items-center justify-between gap-3 border-t border-zinc-800/70 pt-3">
            <div className="flex items-center gap-2.5">
              <Trash2 className={`h-4 w-4 ${eraseArmed ? "text-rose-400" : "text-zinc-500"}`} />
              <div>
                <p className="text-xs font-semibold">Apagar memória de display</p>
                <p className="text-[11px] text-zinc-500">remove o conteúdo de TODOS os slots · dois cliques</p>
              </div>
            </div>
            <Button
              onClick={eraseMemory}
              disabled={!ready || busy !== null}
              variant="outline"
              size="sm"
              className={`h-8 ${
                eraseArmed
                  ? "border-rose-500 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                  : "border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {busy === "erase" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Eraser className="mr-1.5 h-3.5 w-3.5" />}
              {eraseArmed ? "Confirmar" : "Apagar tudo"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-emerald-400" />
            <div>
              <p className="text-xs font-semibold">Relógio do display</p>
              <p className="text-[11px] text-zinc-500">sincroniza com este computador</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Label className="flex items-center gap-2 text-xs text-zinc-400">
              <Switch checked={autoClock} disabled={!ready} onCheckedChange={setAutoClock} aria-label="Relógio automático a cada minuto" />
              auto
            </Label>
            <Button onClick={() => void syncClock()} disabled={!ready || busy !== null} variant="outline" size="sm" className="h-8 border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800">
              {busy === "clock" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Clock className="mr-1.5 h-3.5 w-3.5" />}
              Sincronizar
            </Button>
          </div>
        </CardContent>
      </Card>

    </section>
  );
}
