"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Eraser, Image as ImageIcon, Loader2, Monitor, Square, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FieldLabel, LockedNote, MonoLine, Segmented, SectionHeader } from "./atoms";
import type { F75Driver } from "@/lib/f75/driver";
import { f75log } from "@/lib/f75/logger";
import {
  buildDisplayStream,
  decodeAnimatedGif,
  decodeStillImage,
  decodeFrameToImageData,
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
  { file: "/art/f75-shine.gif", name: "F75 shine", desc: "logo prata + brilho ciano" },
  { file: "/art/matrix-ciano.gif", name: "Matrix ciano", desc: "chuva de glifos" },
  { file: "/art/pulse-eq.gif", name: "Pulso EQ", desc: "barras + oscilloscope" },
  { file: "/art/tetris-ciano.gif", name: "Tetris", desc: "peças caem + linha some" },
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

  const preparedRef = useRef<Prepared | null>(null);
  const cancelRef = useRef({ cancelled: false });
  const slotRef = useRef("1");
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

  /** Sem conteúdo: simulador em standby (tela preta), fiel ao device vazio. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prepared) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [prepared]);

  /* ------------------------------ relógio ------------------------------- */

  /** Sincronismo manual (o automático foi removido: cada sync repinta a
   *  telinha e piscava por cima do conteúdo a cada minuto). */
  const syncClock = useCallback(() => run("clock", () => driver!.syncClock()), [run, driver]);

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

  /** Baixa uma arte do pack (public/art) e roda o MESMO pipeline do upload. */
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
      if (!current || !driver) return;
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

  /**
   * Tela preta no slot selecionado — a forma SEGURA de "tirar o GIF".
   * Usa exatamente o caminho do upload (sessão → metadados → 8 blocos →
   * commit), que é o único fluxo que o firmware executa com garantia:
   * sobrescreve o slot com 1 frame preto e ativa no commit.
   * (Os comandos de apagar memória foram removidos — no firmware atual eles
   * travavam o teclado, resetavam o LED e não removiam o conteúdo.)
   */
  const blankScreen = () =>
    void run("blank", async () => {
      if (!driver) return;
      f75log.info(`⬛ Enviando tela preta pro slot ${slotRef.current} (1 frame · 8 blocos)…`);
      const stream = buildDisplayStream([{ image: new ImageData(new Uint8ClampedArray(128 * 128 * 4), 128, 128), delayMs: 100 }], "stretch");
      await driver!.uploadDisplay(stream, Number(slotRef.current), () => {});
      f75log.ok("Tela preta aplicada — o slot agora mostra só o fundo apagado.");
    });

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
          Enviar pro teclado exige cabo USB-C (display usa o canal 0xFF68, só existe no cabo) — a prévia abaixo funciona sem conectar.
        </LockedNote>
      )}

      <Card className="card-surface">
        <CardContent className="space-y-5 p-4 sm:p-5">
          {/* -------------------------------- bento -------------------------------- */}
          <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
            {/* coluna esquerda — o SIMULADOR, sempre ligado */}
            <div className="flex flex-col items-center gap-2">
              <div className="sim-bezel w-fit rounded-2xl p-2">
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    width={128}
                    height={128}
                    className="h-40 w-40 rounded-lg bg-black [image-rendering:pixelated] sm:h-44 sm:w-44"
                    aria-label="Simulador do display do teclado (128×128)"
                    role="img"
                  />
                  {!prepared && (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg">
                      <Monitor className="h-4 w-4 text-zinc-700" />
                      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-700">standby</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex w-44 flex-col items-center gap-0.5 sm:w-48">
                <p className="font-mono text-[10px] text-zinc-500">
                  {prepared ? `RGB565 · ${prepared.stream.avgFps.toFixed(1)} fps` : "128×128 · RGB565"}
                </p>
                <p className="max-w-full truncate text-[10px] text-zinc-600" title={prepared?.fileName}>
                  {prepared?.fileName ?? "aguardando conteúdo"}
                </p>
              </div>
            </div>

            {/* coluna direita — conteúdo */}
            <div className="min-w-0 space-y-4">
              <div className="space-y-2">
                <FieldLabel>Conteúdo</FieldLabel>
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFile(e.dataTransfer.files?.[0] ?? null);
                  }}
                  className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.12] px-4 py-6 text-center transition-colors hover:border-cyan-300/40 hover:bg-cyan-400/[0.03]"
                >
                  <ImageIcon className="h-5 w-5 text-zinc-500" />
                  <span className="text-xs text-zinc-400">
                    <strong className="text-zinc-200">GIF, PNG, JPG ou WebP</strong> — clique ou arraste aqui
                  </span>
                  <span className="text-[10px] text-zinc-600">convertido pra RGB565 128×128 exatamente como o driver nativo · prévia sem conectar</span>
                  <input
                    type="file"
                    accept="image/gif,image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      handleFile(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              <div className="space-y-1.5 border-t border-white/[0.06] pt-3">
                <FieldLabel>Artes prontas · 128×128 · ciano/branco/cinza · loop perfeito</FieldLabel>
                <div className="grid gap-2 sm:grid-cols-2">
                  {READY_ARTS.map((a) => (
                    <button
                      key={a.file}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => loadReadyArt(a)}
                      className="group flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.03] p-2.5 text-left transition-colors hover:border-cyan-300/30 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <img
                        src={a.file}
                        alt={`Prévia da arte ${a.name}`}
                        loading="lazy"
                        className="h-14 w-14 shrink-0 rounded-md border border-white/[0.08] bg-black [image-rendering:pixelated] transition-shadow group-hover:shadow-[0_0_12px_rgba(65,232,255,0.18)]"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-zinc-200">{a.name}</span>
                        <span className="block text-[10px] leading-snug text-zinc-500">{a.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ------------------------------- envio ------------------------------- */}
          <div className="grid gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-[auto_minmax(0,1fr)]">
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
                <Button onClick={upload} disabled={!ready || busy !== null} title={!ready ? "Conecte o teclado via cabo pra enviar" : undefined}>
                  {busy === "upload" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Enviar pro slot {slot}
                </Button>
                {uploading ? (
                  <Button onClick={cancelUpload} variant="outline" className="h-9 border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">
                    <X className="mr-2 h-4 w-4" /> Cancelar
                  </Button>
                ) : (
                  <Button onClick={clearPrepared} variant="outline" disabled={!prepared} className="h-9 border-white/[0.1] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.08]">
                    <Eraser className="mr-2 h-4 w-4" /> Limpar
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="card-surface">
        <CardContent className="space-y-3 p-4 sm:p-5">
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
              onClick={blankScreen}
              disabled={!ready || busy !== null || uploading}
              variant="outline"
              size="sm"
              className="h-8 border-white/[0.1] bg-white/[0.03] text-xs text-zinc-300 hover:bg-white/[0.08]"
              title="Envia 1 frame preto pro slot selecionado — apaga o GIF que está na telinha pelo próprio caminho do upload"
            >
              {busy === "blank" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Square className="mr-1.5 h-3.5 w-3.5" />}
              Tela preta no slot {slot}
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            O upload já ativa o slot no commit — a telinha passa a mostrar o que você enviou. Pra trocar, envie de novo pro mesmo slot; pra “apagar” um GIF, use{" "}
            <strong className="text-zinc-300">Tela preta</strong> (sobrescreve o slot com um frame preto pelo caminho garantido do firmware).
          </p>
        </CardContent>
      </Card>

      <Card className="card-surface">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-cyan-300" />
            <div>
              <p className="text-xs font-semibold">Relógio do display</p>
              <p className="text-[11px] text-zinc-500">sincronização manual — sem repintura automática</p>
            </div>
          </div>
          <Button onClick={() => void syncClock()} disabled={!ready || busy !== null} variant="outline" size="sm" className="h-8 border-white/[0.1] bg-white/[0.03] text-xs text-zinc-300 hover:bg-white/[0.08]">
            {busy === "clock" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Clock className="mr-1.5 h-3.5 w-3.5" />}
            Sincronizar agora
          </Button>
        </CardContent>
      </Card>

    </section>
  );
}
