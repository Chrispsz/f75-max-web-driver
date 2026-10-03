"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Camera,
  Check,
  ClipboardCopy,
  Clock,
  Copy,
  Cpu,
  Eraser,
  Film,
  Gamepad2,
  Info,
  Keyboard as KeyboardIcon,
  Loader2,
  Monitor,
  Palette,
  RefreshCw,
  Sparkles,
  Terminal,
  Trash2,
  Unlock,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  DIRECTIONS,
  RESPONSE_LEVELS,
  RGB_MODES,
  SLEEP_OPTIONS,
  decodeFrameToImageData,
  intToHex,
  type DisplayFrame,
  type EncodedDisplayStream,
  type FitMode,
  type GameFlags,
  type RgbSettings,
} from "@/lib/f75/protocol";
import { f75log } from "@/lib/f75/logger";

/* ------------------------------- copy block ------------------------------- */

export function CopyBlock({ title, code }: { title?: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      f75log.err("Não foi possível copiar (clipboard bloqueado) — selecione o texto manualmente.");
    }
  };
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
        <span className="font-mono text-[11px] text-zinc-500">{title ?? "bash"}</span>
        <Button variant="ghost" size="sm" onClick={copy} className="h-7 gap-1.5 px-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-emerald-400">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
          {copied ? "Copiado!" : "Copiar"}
        </Button>
      </div>
      <pre className="scrollbar-thin max-h-72 overflow-auto p-3 font-mono text-xs leading-relaxed text-zinc-300">{code}</pre>
    </div>
  );
}

/* --------------------------------- RGB ------------------------------------ */

const RGB_PRESETS: { name: string; color: string; mode: number; colorful: boolean }[] = [
  { name: "Ciano gelo ⭐", color: "#41E8FF", mode: 1, colorful: false },
  { name: "Ice blue", color: "#96D2FF", mode: 1, colorful: false },
  { name: "Roxo", color: "#AF69FF", mode: 1, colorful: false },
  { name: "Branco", color: "#FFFFFF", mode: 1, colorful: false },
  { name: "Spectrum 🌈", color: "#41E8FF", mode: 8, colorful: true },
];

export function RgbCard({
  connected,
  busy,
  rgb,
  setRgb,
  onApply,
}: {
  connected: boolean;
  busy: string | null;
  rgb: RgbSettings;
  setRgb: (patch: Partial<RgbSettings>) => void;
  onApply: () => void;
}) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-4 w-4 text-pink-400" /> RGB — receiver 2.4G
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Efeito</Label>
            <Select value={String(rgb.mode)} onValueChange={(v) => setRgb({ mode: Number(v) })}>
              <SelectTrigger className="border-zinc-700 bg-zinc-950 text-zinc-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72 border-zinc-700 bg-zinc-950 text-zinc-200">
                {RGB_MODES.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Cor ({intToHex(rgb.color)})</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={intToHex(rgb.color)}
                onChange={(e) => setRgb({ color: parseInt(e.target.value.replace("#", ""), 16) })}
                aria-label="Cor do RGB"
                className="h-10 w-12 cursor-pointer rounded-md border border-zinc-700 bg-zinc-950 p-1"
              />
              <div className="h-10 flex-1 rounded-md border border-zinc-700" style={{ backgroundColor: intToHex(rgb.color) }} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {RGB_PRESETS.map((p) => (
            <Button
              key={p.name}
              variant="outline"
              size="sm"
              onClick={() => setRgb({ color: parseInt(p.color.replace("#", ""), 16), mode: p.mode, colorful: p.colorful })}
              className="h-8 gap-1.5 border-zinc-700 bg-transparent px-2.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              <span className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: p.color }} />
              {p.name}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Brilho: {rgb.brightness}/5</Label>
            <Slider value={[rgb.brightness]} min={1} max={5} step={1} onValueChange={(v) => setRgb({ brightness: v[0] })} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">Velocidade: {rgb.speed}/5</Label>
            <Slider value={[rgb.speed]} min={1} max={5} step={1} onValueChange={(v) => setRgb({ speed: v[0] })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Direção</Label>
            <Select value={String(rgb.direction)} onValueChange={(v) => setRgb({ direction: Number(v) })}>
              <SelectTrigger className="border-zinc-700 bg-zinc-950 text-zinc-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-zinc-700 bg-zinc-950 text-zinc-200">
                {DIRECTIONS.map((d, i) => (
                  <SelectItem key={d} value={String(i)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch id="colorful" checked={rgb.colorful} onCheckedChange={(v) => setRgb({ colorful: v })} />
          <Label htmlFor="colorful" className="text-xs text-zinc-400">
            Multicolor (colorful) — desligado mantém a cor escolhida
          </Label>
        </div>

        <Button onClick={onApply} disabled={busy !== null || !connected} className="w-full bg-pink-500 text-zinc-950 hover:bg-pink-400">
          {busy === "rgb" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Aplicar RGB
        </Button>
        {!connected && (
          <p className="text-center text-xs text-amber-400/90">
            Precisa do receiver 2.4G conectado (ou do modo simulação) — veja o card de conexão.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------- Desempenho & Jogo ---------------------------- */

export interface PerfState extends GameFlags {
  level: number;
  sleep: number;
}

export function PerformanceCard({
  connected,
  busy,
  perf,
  setPerf,
  apply,
  onUnlock,
}: {
  connected: boolean;
  busy: string | null;
  perf: PerfState;
  setPerf: (patch: Partial<PerfState>) => void;
  apply: () => void;
  onUnlock: () => void;
}) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/60" id="card-desempenho">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gamepad2 className="h-4 w-4 text-amber-400" /> Desempenho & Modo Jogo — receiver 2.4G
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-100/90">
          <strong className="text-amber-400">Alt+Tab / Alt+F4 / Win não funcionam?</strong> Isso vem do{" "}
          <strong>firmware do teclado</strong>: o protocolo tem flags <code className="rounded bg-zinc-800 px-1">disableAltTab</code>,{" "}
          <code className="rounded bg-zinc-800 px-1">disableAltF4</code> e <code className="rounded bg-zinc-800 px-1">disableWin</code> que o
          teclado intercepta antes de chegar no GNOME. O driver nativo liga as três junto com o Game Mode — aqui você controla cada uma.
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onUnlock} disabled={!connected} className="h-8 gap-1.5 border-emerald-500/40 bg-emerald-500/10 px-2.5 text-xs text-emerald-300 hover:bg-emerald-500/20">
            <Unlock className="h-3.5 w-3.5" /> Desbloquear Alt+Tab / Alt+F4 / Win agora
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPerf({ game: true, lockAltTab: true, lockAltF4: true, lockWin: true })}
            disabled={!connected}
            className="h-8 border-zinc-700 bg-transparent px-2.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            🎮 Preset clássico (tudo travado)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPerf({ game: true, lockAltTab: false, lockAltF4: false, lockWin: true })}
            disabled={!connected}
            className="h-8 border-zinc-700 bg-transparent px-2.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            🪶 Preset leve (só Win travada)
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Response level (latência 2.4G)</Label>
            <Select value={String(perf.level)} onValueChange={(v) => setPerf({ level: Number(v) })}>
              <SelectTrigger className="border-zinc-700 bg-zinc-950 text-zinc-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-zinc-700 bg-zinc-950 text-zinc-200">
                {RESPONSE_LEVELS.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">Suspensão automática</Label>
            <Select value={String(perf.sleep)} onValueChange={(v) => setPerf({ sleep: Number(v) })}>
              <SelectTrigger className="border-zinc-700 bg-zinc-950 text-zinc-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-zinc-700 bg-zinc-950 text-zinc-200">
                {SLEEP_OPTIONS.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 sm:grid-cols-2">
          {(
            [
              { key: "game", label: "Game Mode (master)" },
              { key: "lockAltTab", label: "Travar Alt+Tab" },
              { key: "lockAltF4", label: "Travar Alt+F4" },
              { key: "lockWin", label: "Travar tecla Win" },
            ] as const
          ).map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <Switch checked={perf[row.key]} onCheckedChange={(v) => setPerf({ [row.key]: v })} disabled={!connected} />
              <span className="text-xs text-zinc-300">{row.label}</span>
            </div>
          ))}
        </div>

        <Button onClick={apply} disabled={busy !== null || !connected} className="w-full bg-amber-500 text-zinc-950 hover:bg-amber-400">
          {busy === "perf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cpu className="mr-2 h-4 w-4" />}
          Aplicar desempenho + flags de jogo
        </Button>
        {!connected && (
          <p className="text-center text-xs text-amber-400/90">
            Precisa do receiver 2.4G conectado (ou do modo simulação).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- Display -------------------------------- */

export interface PreparedUpload {
  stream: EncodedDisplayStream;
  frames: DisplayFrame[];
  fileName: string;
}

export function DisplayCard({
  wiredConnected,
  busy,
  prepared,
  onPrepare,
  onGenerate,
  onClear,
  slot,
  setSlot,
  fit,
  setFit,
  progress,
  uploading,
  onCancelUpload,
  onUpload,
  onClock,
  autoClock,
  setAutoClock,
  onFactoryReset,
  resetArmed,
}: {
  wiredConnected: boolean;
  busy: string | null;
  prepared: PreparedUpload | null;
  onPrepare: (file: File | null) => void;
  onGenerate: (kind: "bounce" | "plasma") => void;
  onClear: () => void;
  slot: string;
  setSlot: (v: string) => void;
  fit: FitMode;
  setFit: (f: FitMode) => void;
  progress: { sent: number; total: number; eta: number };
  uploading: boolean;
  onCancelUpload: () => void;
  onUpload: () => void;
  onClock: () => void;
  autoClock: boolean;
  setAutoClock: (v: boolean) => void;
  onFactoryReset: () => void;
  resetArmed: boolean;
}) {
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const [showDeviceColors, setShowDeviceColors] = useState(false);

  /* animação da prévia (frames originais ou o RGB565 que a telinha recebe) */
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !prepared) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cache = new Map<number, ImageData>();
    let raf = 0;
    let index = 0;
    let nextAt = performance.now();
    const draw = (now: number) => {
      if (now >= nextAt) {
        const frames = prepared.frames;
        const frame = frames[index];
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, 128, 128);
        if (showDeviceColors) {
          let image = cache.get(index);
          if (!image) {
            image = decodeFrameToImageData(prepared.stream.data, index);
            cache.set(index, image);
          }
          ctx.putImageData(image, 0, 0);
        } else if (frame.bitmap) {
          ctx.drawImage(frame.bitmap, 0, 0, 128, 128);
        } else if (frame.image) {
          ctx.putImageData(frame.image, 0, 0);
        }
        nextAt = now + Math.max(20, frame.delayMs);
        index = (index + 1) % frames.length;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [prepared, showDeviceColors]);

  const pct = progress.total > 0 ? Math.round((progress.sent / progress.total) * 100) : 0;

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Monitor className="h-4 w-4 text-sky-400" /> Display, relógio & reset — cabo USB-C
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
          <div className="space-y-2">
            <div className="rounded-xl border-2 border-zinc-700 bg-zinc-950 p-1">
              <canvas ref={previewRef} width={128} height={128} className="h-auto w-full rounded-lg" style={{ imageRendering: "pixelated" }} />
            </div>
            <p className="text-center text-[11px] text-zinc-500">
              {prepared ? `prévia animada · ${prepared.frames.length} frames` : "prévia 128×128"}
            </p>
            {prepared && (
              <Button variant="ghost" size="sm" onClick={() => setShowDeviceColors((v) => !v)} className="w-full text-[11px] text-zinc-400 hover:bg-zinc-800">
                {showDeviceColors ? "Mostrando: cores da telinha (RGB565)" : "Mostrando: original — ver cores da telinha"}
              </Button>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-zinc-400">Imagem ou GIF (128×128 recomendado)</Label>
                <Input
                  type="file"
                  accept="image/gif,image/png,image/jpeg,image/webp,image/bmp"
                  onChange={(e) => onPrepare(e.target.files?.[0] ?? null)}
                  disabled={uploading}
                  className="border-zinc-700 bg-zinc-950 text-xs text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:text-zinc-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Slot (1–255)</Label>
                <Input type="number" min={1} max={255} value={slot} onChange={(e) => setSlot(e.target.value)} disabled={uploading} className="border-zinc-700 bg-zinc-950 text-zinc-200" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Ajuste na tela</Label>
                <Select value={fit} onValueChange={(v) => setFit(v as FitMode)} disabled={uploading}>
                  <SelectTrigger className="border-zinc-700 bg-zinc-950 text-zinc-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-zinc-700 bg-zinc-950 text-zinc-200">
                    <SelectItem value="contain">Fit (mantém proporção)</SelectItem>
                    <SelectItem value="cover">Fill (corta)</SelectItem>
                    <SelectItem value="stretch">Stretch (esticado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  onClick={() => onGenerate("bounce")}
                  disabled={uploading || busy !== null}
                  variant="outline"
                  className="flex-1 border-zinc-700 bg-transparent text-xs text-zinc-200 hover:bg-zinc-800"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-cyan-300" /> Bola ciano
                </Button>
                <Button
                  onClick={() => onGenerate("plasma")}
                  disabled={uploading || busy !== null}
                  variant="outline"
                  className="flex-1 border-zinc-700 bg-transparent text-xs text-zinc-200 hover:bg-zinc-800"
                >
                  <Film className="mr-1.5 h-3.5 w-3.5 text-cyan-300" /> Plasma gelo
                </Button>
              </div>
            </div>

            {prepared && (
              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-zinc-400">
                    <strong className="text-zinc-200">{prepared.fileName}</strong> · {prepared.stream.frameCount} frame(s) ·{" "}
                    {prepared.stream.chunkCount} blocos · {Math.round(prepared.stream.data.length / 1024).toLocaleString("pt-BR")} KB ·{" "}
                    {prepared.stream.avgFps.toFixed(1)} fps
                  </p>
                  <Button variant="ghost" size="sm" onClick={onClear} className="h-7 px-2 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                    <X className="mr-1 h-3 w-3" /> limpar
                  </Button>
                </div>
                {(uploading || progress.sent > 0) && (
                  <div className="space-y-1">
                    <Progress value={pct} className="h-2" />
                    <p className="flex justify-between font-mono text-[11px] text-zinc-500">
                      <span>
                        {progress.sent}/{progress.total} blocos · {pct}%
                      </span>
                      {uploading && progress.eta > 0 && (
                        <span>ETA {progress.eta < 90 ? `${Math.ceil(progress.eta)}s` : `${Math.ceil(progress.eta / 60)}min`}</span>
                      )}
                    </p>
                  </div>
                )}
                {uploading ? (
                  <Button onClick={onCancelUpload} variant="destructive" className="w-full">
                    <X className="mr-2 h-4 w-4" /> Cancelar upload ({pct}%)
                  </Button>
                ) : (
                  <Button onClick={onUpload} disabled={busy !== null || !wiredConnected} className="w-full bg-sky-500 text-zinc-950 hover:bg-sky-400">
                    <Upload className="mr-2 h-4 w-4" /> Enviar pro slot {slot}
                  </Button>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Button onClick={onClock} disabled={busy !== null || !wiredConnected} variant="outline" className="w-full border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800">
                  {busy === "clock" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
                  Sincronizar relógio da telinha
                </Button>
                <div className="flex items-center gap-2 pl-1">
                  <Switch checked={autoClock} onCheckedChange={setAutoClock} disabled={!wiredConnected} id="autoclock" />
                  <Label htmlFor="autoclock" className="text-xs text-zinc-400">
                    Re-sincronizar a cada 60 s
                  </Label>
                </div>
              </div>
              <Button
                onClick={onFactoryReset}
                disabled={busy !== null || !wiredConnected}
                variant={resetArmed ? "destructive" : "outline"}
                className={resetArmed ? "" : "border-rose-500/40 bg-transparent text-rose-300 hover:bg-rose-500/10"}
              >
                {busy === "reset" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                {resetArmed ? "Confirmar factory reset?" : "Factory reset (apaga tudo!)"}
              </Button>
            </div>
          </div>
        </div>
        {!wiredConnected && (
          <p className="text-center text-xs text-amber-400/90">
            Display, relógio e reset precisam do teclado no CABO USB-C com os dois canais (comando + display) conectados.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------ teste de teclas ---------------------------- */

interface KeyEventEntry {
  id: number;
  type: "down" | "up";
  code: string;
  key: string;
  mods: string;
}

const INTERESTING = ["PrintScreen", "MetaLeft", "MetaRight", "AltLeft", "AltRight", "Tab", "F13", "F14", "F15", "Lang1", "Lang2"];

export function KeyTesterCard() {
  const [events, setEvents] = useState<KeyEventEntry[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const push = (type: "down" | "up") => (e: KeyboardEvent) => {
      if (e.key === "F12") return; // não atrapalhar o devtools
      seq.current += 1;
      const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.metaKey && "Win/Super", e.shiftKey && "Shift"].filter(Boolean).join("+");
      setEvents((prev) => [...prev.slice(-24), { id: seq.current, type, code: e.code, key: e.key, mods }]);
    };
    const down = push("down");
    const up = push("up");
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyboardIcon className="h-4 w-4 text-emerald-400" /> Teste de teclas — o que chega no SO
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-zinc-400">
          Aperte teclas aqui pra ver o <code className="rounded bg-zinc-800 px-1">event.code</code> real que o CachyOS recebe.{" "}
          <strong className="text-zinc-200">Alt+Tab saudável = o seletor de janelas abre e a página perde foco</strong> (o GNOME consome o atalho
          no compositor). Se apertar Alt+Tab <em>não acontecer nada</em>, é o firmware do teclado travando — resolva no card{" "}
          <em>Desempenho &amp; Modo Jogo</em>. Use também pra descobrir o código da tecla Print (captura de tela) e rebindar no card Sistema.
        </p>
        <div className="scrollbar-thin max-h-44 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs">
          {events.length === 0 ? (
            <p className="text-zinc-600">nenhuma tecla ainda — clique na página e aperte algo…</p>
          ) : (
            events.map((ev) => (
              <p key={ev.id} className={INTERESTING.includes(ev.code) ? "text-emerald-300" : "text-zinc-400"}>
                <span className={ev.type === "down" ? "text-sky-400" : "text-zinc-600"}>{ev.type === "down" ? "▼" : "△"}</span>{" "}
                <span className="text-zinc-200">{ev.code}</span>
                {ev.mods && <span className="text-amber-400/90"> [{ev.mods}]</span>}
                <span className="text-zinc-600"> (key &quot;{ev.key}&quot;)</span>
              </p>
            ))
          )}
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setEvents([])} className="h-7 gap-1.5 px-2 text-xs text-zinc-500 hover:bg-zinc-800">
            <Eraser className="h-3.5 w-3.5" /> limpar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------- sistema -------------------------------- */

export function SystemCard() {
  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Terminal className="h-4 w-4 text-emerald-400" /> Sistema CachyOS — Alt+Tab, captura de tela e inicialização
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Alt+Tab */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Gamepad2 className="h-4 w-4 text-amber-400" /> 1 · Alt+Tab bugado ou morto
          </h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-zinc-400">
            <li>
              <strong className="text-zinc-200">Causa nº 1 no F75 Max:</strong> Game Mode do firmware com{" "}
              <code className="rounded bg-zinc-800 px-1">disableAltTab=1</code> — o teclado engole o atalho antes do SO.{" "}
              Teste: aperte Alt e Tab <em>separados</em> no Teste de Teclas (os dois chegam?) e depois Alt+Tab juntos (nada acontece = firmware).{" "}
              Resolva no card <em>Desempenho &amp; Modo Jogo</em> (botão “Desbloquear agora”).
            </li>
            <li>
              <strong className="text-zinc-200">Configuração do GNOME:</strong> confira/force os binds padrão:
              <div className="mt-2">
                <CopyBlock
                  title="fix Alt+Tab"
                  code={`# conferir o estado atual:\ngsettings get org.gnome.desktop.wm.keybindings switch-windows\ngsettings get org.gnome.desktop.wm.keybindings switch-applications\n\n# Alt+Tab = alternar janelas | Super+Tab = alternar apps:\ngsettings set org.gnome.desktop.wm.keybindings switch-windows "['<Alt>Tab']"\ngsettings set org.gnome.desktop.wm.keybindings switch-windows-backward "['<Shift><Alt>Tab']"\ngsettings set org.gnome.desktop.wm.keybindings switch-applications "['<Super>Tab']"\ngsettings set org.gnome.desktop.wm.keybindings switch-applications-backward "['<Shift><Super>Tab']"\n\n# se já mexeu em muita coisa e quiser zerar TUDO dos atalhos de janela:\ngsettings reset-recursively org.gnome.desktop.wm.keybindings`}
                />
              </div>
            </li>
            <li>
              <strong className="text-zinc-200">Extensão conflitando?</strong>{" "}
              <code className="rounded bg-zinc-800 px-1">gnome-extensions list --enabled</code> — desligue uma por uma (as que mexem em janelas
              são as suspeitas clássicas) e teste Alt+Tab depois de cada uma.
            </li>
          </ol>
        </section>

        {/* Screenshot */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Camera className="h-4 w-4 text-sky-400" /> 2 · Atalho de captura de tela (Print)
          </h3>
          <p className="text-xs leading-relaxed text-zinc-400">
            O GNOME usa a tecla Print pra abrir a UI de captura. Se no Teste de Teclas a tecla Print aparecer como outro código (alguns
            firmwares mandam <code className="rounded bg-zinc-800 px-1">F13</code>), rebindo pro que seu teclado manda — ou pra uma combinação:
          </p>
          <CopyBlock
            title="captura de tela"
            code={`# ver o bind atual:\ngsettings get org.gnome.shell.keybindings show-screenshot-ui\n\n# de volta pra tecla Print:\ngsettings set org.gnome.shell.keybindings show-screenshot-ui "['Print']"\n\n# alternativa se a Print do teclado for estranha (teste no card acima):\ngsettings set org.gnome.shell.keybindings show-screenshot-ui "['<Ctrl><Alt>S']"\n\n# captura direta sem UI (opcional):\nsudo pacman -S --needed gnome-screenshot\ngnome-screenshot -i   # interativo`}
          />
        </section>

        {/* systemd */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <RefreshCw className="h-4 w-4 text-pink-400" /> 3 · Inicialização do sistema (systemd)
          </h3>
          <p className="text-xs leading-relaxed text-zinc-400">
            Diagnóstico completo da bootada atual — unidades quebradas, tempo de boot, o que travou a inicialização e erros do journal:
          </p>
          <CopyBlock
            title="diagnóstico systemd"
            code={`# 1. serviços quebrados (o que LIGOU e falhou):\nsystemctl --failed\n\n# 2. tempo total de boot + onde foi gasto:\nsystemd-analyze\nsystemd-analyze blame | head -15\nsystemd-analyze critical-chain\n\n# 3. erros do boot atual (priority err e acima):\njournalctl -b -p err --no-pager | tail -40\n\n# 4. serviços habilitados (o que liga no boot):\nsystemctl list-unit-files --state=enabled --no-pager`}
          />
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-[11px] leading-relaxed text-zinc-500">
            <strong className="text-zinc-300">Como ler:</strong> <code className="rounded bg-zinc-800 px-1">systemctl --failed</code> vazio =
            saudável. No <code className="rounded bg-zinc-800 px-1">blame</code>, serviços de rede esperando timeout são os culpados clássicos de
            boot lento. Mensagens “Failed to load module” no journal costumam ser inofensivas (nomes de módulo diferentes no Arch) — o que importa
            é serviço <em>failed</em> de verdade.
          </div>
        </section>

        {/* auditoria geral */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Info className="h-4 w-4 text-zinc-400" /> 4 · Auditoria de TODOS os atalhos
          </h3>
          <CopyBlock
            title="auditoria + backup"
            code={`# listar tudo que está configurado hoje:\ngsettings list-recursively org.gnome.desktop.wm.keybindings\ngsettings list-recursively org.gnome.shell.keybindings\ngsettings list-recursively org.gnome.mutter.keybindings\n\n# backup geral das suas configs (restaura com dconf load /):\ndconf dump / > ~/dconf-backup-$(date +%F).ini`}
          />
        </section>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------- logs ---------------------------------- */

function useLogEntries() {
  return useSyncExternalStore(f75log.subscribe, f75log.getSnapshot, f75log.getSnapshot);
}

export function LogsCard() {
  const [filter, setFilter] = useState<"all" | "issues" | "packets">("all");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const entries = useLogEntries();

  const visible = entries.filter((e) => {
    if (filter === "issues" && !(e.level === "warn" || e.level === "err")) return false;
    if (filter === "packets" && !(e.level === "cmd" || e.level === "rx")) return false;
    if (query && !e.msg.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }, [visible.length]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(f75log.export());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const colorFor = (level: string) =>
    level === "ok"
      ? "text-emerald-300"
      : level === "warn"
        ? "text-amber-300"
        : level === "err"
          ? "text-rose-300"
          : level === "cmd"
            ? "text-sky-300"
            : level === "rx"
              ? "text-purple-300"
              : "text-zinc-400";

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Terminal className="h-4 w-4 text-emerald-400" /> Log do driver
          <Badge variant="outline" className="border-zinc-700 text-[10px] font-normal text-zinc-500">
            espelhado no console F12 com prefixo [F75]
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "all", label: "Tudo" },
              { id: "packets", label: "Pacotes TX/RX" },
              { id: "issues", label: "Só avisos/erros" },
            ] as const
          ).map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? "default" : "outline"}
              onClick={() => setFilter(f.id)}
              className={`h-7 px-2.5 text-xs ${filter === f.id ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400" : "border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800"}`}
            >
              {f.label}
            </Button>
          ))}
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="buscar no log…"
            className="h-7 w-40 border-zinc-700 bg-zinc-950 text-xs text-zinc-200"
          />
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={copyAll} className="h-7 gap-1.5 border-zinc-700 bg-transparent px-2 text-xs text-zinc-300 hover:bg-zinc-800">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />} copiar tudo
            </Button>
            <Button size="sm" variant="outline" onClick={() => f75log.clear()} className="h-7 gap-1.5 border-zinc-700 bg-transparent px-2 text-xs text-zinc-300 hover:bg-zinc-800">
              <Trash2 className="h-3.5 w-3.5" /> limpar
            </Button>
          </div>
        </div>
        <div ref={boxRef} className="scrollbar-thin max-h-72 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed">
          {visible.length === 0 ? (
            <p className="text-zinc-600">Sem entradas com esse filtro — conecte o teclado ou ative a simulação pra ver os pacotes.</p>
          ) : (
            visible.map((e) => (
              <p key={e.id} className={`whitespace-pre-wrap ${colorFor(e.level)}`}>
                <span className="text-zinc-600">{e.time}</span> {e.msg}
              </p>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
