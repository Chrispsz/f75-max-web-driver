"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Cable,
  CircleHelp,
  FlaskConical,
  Keyboard,
  Loader2,
  Plug,
  PlugZap,
  RefreshCw,
  Usb,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DisplayCard, DiagnosticsCard, KeyTesterCard, LogsCard, PerformanceCard, RgbCard, SystemCard, type PerfState, type PreparedUpload } from "@/components/driver/driver-cards";
import { F75Driver, F75Error, type DriverStatus } from "@/lib/f75/driver";
import { f75log } from "@/lib/f75/logger";
import {
  buildDisplayStream,
  decodeAnimatedGif,
  decodeStillImage,
  generateAnimation,
  hexToInt,
  type DisplayFrame,
  type FitMode,
  type RgbSettings,
} from "@/lib/f75/protocol";

const CYAN = "#41E8FF";

export default function F75DriverTool({ onOpenGuide }: { onOpenGuide: () => void }) {
  const driverRef = useRef<F75Driver | null>(null);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preparedRef = useRef<PreparedUpload | null>(null);
  const slotRef = useRef("1");

  const [supported, setSupported] = useState<boolean | null>(null);
  const [inIframe, setInIframe] = useState(false);
  const [driverReady, setDriverReady] = useState(false);
  const [status, setStatus] = useState<DriverStatus>({ sim: false, wiredCommand: false, wiredDisplay: false, dongle: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [battery, setBattery] = useState<number | null>(null);

  const [rgb, setRgbState] = useState<RgbSettings>({ mode: 1, brightness: 3, speed: 2, direction: 0, colorful: false, color: hexToInt(CYAN) });
  const [perf, setPerfState] = useState<PerfState>({ level: 1, sleep: 2, game: false, lockAltTab: false, lockAltF4: false, lockWin: false });

  const [fit, setFit] = useState<FitMode>("contain");
  const [slot, setSlot] = useState("1");
  const [prepared, setPrepared] = useState<PreparedUpload | null>(null);
  const [progress, setProgress] = useState({ sent: 0, total: 0, eta: 0 });
  const [uploading, setUploading] = useState(false);
  const [autoClock, setAutoClock] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);

  slotRef.current = slot;
  preparedRef.current = prepared;

  const setRgb = useCallback((patch: Partial<RgbSettings>) => setRgbState((prev) => ({ ...prev, ...patch })), []);
  const setPerf = useCallback((patch: Partial<PerfState>) => setPerfState((prev) => ({ ...prev, ...patch })), []);

  /* ------------------------------- bootstrap ------------------------------- */

  useEffect(() => {
    const driver = new F75Driver();
    driverRef.current = driver;
    setDriverReady(true);
    driver.onStatus = (s) => setStatus(s);
    driver.onBattery = (p) => setBattery(p);
    setSupported(F75Driver.supported);
    try {
      setInIframe(window.self !== window.top);
    } catch {
      setInIframe(true);
    }
    f75log.info("F75 Max Web Driver pronto — 100% local, nada sai do navegador. Logs completos espelhados no console (F12 → filtro [F75]).");
    // tenta rebinar endpoints já autorizados (sem seletor) — invisível se vazio
    driver.reconnectSaved(true).then((s) => {
      if (s.wiredCommand || s.wiredDisplay || s.dongle) f75log.ok("Dispositivos já autorizados rebinados automaticamente.");
    }).catch(() => undefined);
    return () => {
      driver.onStatus = null;
      driver.onBattery = null;
    };
  }, []);

  /* --------------------------------- helpers -------------------------------- */

  const run = useCallback(async (label: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(label);
    try {
      await action();
    } catch (err) {
      const message = err instanceof F75Error ? err.message : err instanceof Error ? err.message : String(err);
      f75log.err(`✗ ${label}: ${message}`);
    } finally {
      setBusy(null);
    }
  }, [busy]);

  /* relógio automático */
  useEffect(() => {
    if (!autoClock) return;
    const tick = () => void run("clock", () => driverRef.current!.syncClock());
    void tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [autoClock, run]);

  const wiredReady = status.wiredCommand && status.wiredDisplay;
  const anyConnected = status.sim || status.wiredCommand || status.wiredDisplay || status.dongle;

  const chip = (label: string, ok: boolean) => (
    <Badge
      variant="outline"
      className={
        ok
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-zinc-700 bg-zinc-900 text-zinc-500"
      }
    >
      {ok ? "✔" : "○"} {label}
    </Badge>
  );

  /* --------------------------------- ações ---------------------------------- */

  const connect = () =>
    run("connect", async () => {
      const s = await driverRef.current!.connectPicker();
      if (s.dongle) {
        try {
          await driverRef.current!.queryBattery();
        } catch {
          /* bateria é best-effort */
        }
      }
    });

  const reconnect = () =>
    run("reconnect", async () => {
      const s = await driverRef.current!.reconnectSaved(false);
      if (s.dongle) await driverRef.current!.queryBattery().catch(() => undefined);
    });

  const disconnect = () =>
    run("disconnect", async () => {
      setAutoClock(false);
      setBattery(null);
      await driverRef.current!.disconnect();
    });

  const toggleSim = () =>
    run("sim", async () => {
      setBattery(null);
      if (driverRef.current!.isSim) {
        await driverRef.current!.disconnect();
      } else {
        await driverRef.current!.enableSim();
      }
    });

  const applyRgb = () =>
    run("rgb", async () => {
      await driverRef.current!.applyRGB(rgb);
    });

  const applyPerf = () =>
    run("perf", async () => {
      await driverRef.current!.applyPerformance({
        level: perf.level,
        sleep: perf.sleep,
        game: perf.game,
        lockAltTab: perf.lockAltTab,
        lockAltF4: perf.lockAltF4,
        lockWin: perf.lockWin,
      });
    });

  const unlockAll = () =>
    run("perf", async () => {
      setPerfState((prev) => ({ ...prev, game: false, lockAltTab: false, lockAltF4: false, lockWin: false }));
      await driverRef.current!.applyPerformance({
        level: perf.level,
        sleep: perf.sleep,
        game: false,
        lockAltTab: false,
        lockAltF4: false,
        lockWin: false,
      });
    });

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setProgress({ sent: 0, total: 0, eta: 0 });
    f75log.info(`🖼 Arquivo: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
    await run("prepare", async () => {
      f75log.info("⚙ Decodificando e convertendo pra RGB565 128×128…");
      const frames: DisplayFrame[] = file.type === "image/gif" ? await decodeAnimatedGif(file) : await decodeStillImage(file);
      const stream = buildDisplayStream(frames, fit);
      f75log.ok(
        `✔ Pronto: ${stream.frameCount} frame(s) · ${stream.chunkCount} blocos de 4 KB · ${(stream.data.length / 1024).toFixed(0)} KB · ${stream.avgFps.toFixed(1)} fps · delays [${stream.delays.slice(0, 8).join(", ")}${stream.delays.length > 8 ? ", …" : ""}]`
      );
      setPrepared({ stream, frames, fileName: file.name });
    });
  };

  const handleGenerate = (kind: "bounce" | "plasma") =>
    void run("generate", async () => {
      const frames = generateAnimation(kind, 45);
      const stream = buildDisplayStream(frames, "stretch");
      f75log.ok(`✨ Animação gerada (${kind}): ${stream.frameCount} frames · ${stream.chunkCount} blocos · 15 fps · loop perfeito`);
      setPrepared({ stream, frames, fileName: kind === "bounce" ? "bola-ciano (gerada)" : "plasma-gelo (gerada)" });
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
        await driverRef.current!.uploadDisplay(current.stream, Number(slotRef.current), (p) => setProgress({ sent: p.sent, total: p.total, eta: p.etaSeconds }), token);
      } finally {
        setUploading(false);
      }
    });

  const cancelUpload = () => {
    cancelRef.current.cancelled = true;
    f75log.warn("Cancelamento solicitado — parando após o bloco atual…");
  };

  const factoryReset = () => {
    if (!resetArmed) {
      setResetArmed(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setResetArmed(false), 6000);
      return;
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setResetArmed(false);
    void run("reset", async () => {
      await driverRef.current!.factoryReset((stage) => f75log.info(`· ${stage}`));
    });
  };

  /* ---------------------------------- UI ----------------------------------- */

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 selection:bg-emerald-500/30">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10">
              <Keyboard className="h-5 w-5 text-emerald-400" />
            </span>
            <div>
              <h1 className="text-sm font-bold leading-tight sm:text-base">F75 Max Web Driver</h1>
              <p className="text-[11px] leading-tight text-zinc-500">protocolo oficial portado do driver nativo · 100% local</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {status.sim && <Badge className="border border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25">🧪 simulação</Badge>}
            {anyConnected && !status.sim && <Badge className="border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">conectado</Badge>}
            {!anyConnected && <Badge variant="outline" className="border-zinc-700 text-zinc-500">desconectado</Badge>}
            <Button variant="outline" size="sm" onClick={onOpenGuide} className="h-8 gap-1.5 border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800 hover:text-emerald-400">
              <BookOpen className="h-3.5 w-3.5" /> Guia completo
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {/* banners */}
        {supported === false && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-relaxed text-amber-100/90">
            <strong className="text-amber-400">WebHID indisponível neste navegador.</strong> O driver fala com o teclado via WebHID — disponível no{" "}
            <strong>Chrome, Chromium, Edge, Brave e Opera</strong> (Firefox e Safari não suportam). No CachyOS:{" "}
            <code className="rounded bg-zinc-800 px-1.5">sudo pacman -S chromium</code>. Enquanto isso, use o{" "}
            <strong>modo simulação</strong> abaixo pra conhecer a ferramenta.
          </div>
        )}
        {supported && inIframe && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm leading-relaxed text-sky-100/90">
            <strong className="text-sky-400">Dica:</strong> se o seletor de dispositivos não abrir, clique em{" "}
            <strong>&ldquo;Open in New Tab&rdquo;</strong> acima do painel de preview — WebHID funciona melhor fora do iframe.
          </div>
        )}

        {/* conexão */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Usb className="h-4 w-4 text-emerald-400" /> Conexão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs leading-relaxed text-zinc-400">
              No seletor do navegador vão aparecer <strong className="text-zinc-200">várias entradas</strong> &ldquo;Aula F75 Max&rdquo; (uma por
              interface HID) e, se plugado, o receiver &ldquo;Aula F75 Max 2.4G&rdquo;. <strong className="text-zinc-200">Selecione todas</strong> — o
              driver abre TODAS as interfaces do receiver (o canal certo do RGB é o 0xFF60; vincular a errada era a causa do erro
              &ldquo;Failed to write the report&rdquo;), além de 0xFF13 (comando cabo) e 0xFF68 (display cabo). As regras udev que você já instalou valem pro
              Chrome.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={connect} disabled={busy !== null || status.sim} className="h-9 bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
                {busy === "connect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
                Conectar (seletor)
              </Button>
              <Button onClick={reconnect} disabled={busy !== null || status.sim} variant="outline" className="h-9 border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
                {busy === "reconnect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Reconectar (lembrados)
              </Button>
              {anyConnected && (
                <Button onClick={disconnect} disabled={busy !== null} variant="outline" className="h-9 border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
                  <PlugZap className="mr-2 h-4 w-4" /> Desconectar
                </Button>
              )}
              <Button
                onClick={toggleSim}
                disabled={busy !== null}
                variant="outline"
                className={`h-9 gap-1.5 ${status.sim ? "border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20" : "border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800"}`}
              >
                <FlaskConical className="h-4 w-4" />
                {status.sim ? "Encerrar simulação" : "🧪 Modo simulação"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {chip("Cabo · comando 0xFF13", status.wiredCommand)}
              {chip("Cabo · display 0xFF68", status.wiredDisplay)}
              {chip("Receiver 2.4G 0xFF60", status.dongle)}
              {status.dongle && (
                <Badge variant="outline" className="gap-1 border-zinc-700 text-zinc-300">
                  <BatteryIcon percent={battery} />
                  {battery === null ? "bateria: sem leitura" : `bateria: ${battery}%`}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* painéis */}
        <div className="grid gap-6 xl:grid-cols-2">
          <RgbCard connected={status.dongle} busy={busy} rgb={rgb} setRgb={setRgb} onApply={applyRgb} />
          <PerformanceCard connected={status.dongle} busy={busy} perf={perf} setPerf={setPerf} apply={applyPerf} onUnlock={unlockAll} />
        </div>

        <DisplayCard
          wiredConnected={status.sim || wiredReady}
          busy={busy}
          prepared={prepared}
          onPrepare={(f) => void handleFile(f)}
          onGenerate={handleGenerate}
          onClear={clearPrepared}
          slot={slot}
          setSlot={setSlot}
          fit={fit}
          setFit={setFit}
          progress={progress}
          uploading={uploading}
          onCancelUpload={cancelUpload}
          onUpload={upload}
          onClock={() => void run("clock", () => driverRef.current!.syncClock())}
          autoClock={autoClock}
          setAutoClock={setAutoClock}
          onFactoryReset={factoryReset}
          resetArmed={resetArmed}
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <KeyTesterCard />
          <SystemCard />
        </div>

        <DiagnosticsCard driver={driverReady ? driverRef.current : null} />

        <LogsCard />

        <p className="flex items-start gap-2 pb-2 text-[11px] leading-relaxed text-zinc-600">
          <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Porta TypeScript do protocolo do driver nativo (github.com/VitalyArt/Aula-F75-Max-Driver): feature reports 64 B no canal 0xFF13, chunks de
          4 KB no 0xFF68, reports de 32 B no 0xFF60 com checksum sum-8. Tudo roda no seu navegador — nenhum dado sai da máquina. Se algo falhar, o
          log acima + console F12 mostram exatamente qual pacote/tratégia quebrou.
        </p>
      </main>

      <footer className="mt-auto border-t border-zinc-800 bg-zinc-950">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-zinc-600 sm:px-6">
          <span>F75 Max Web Driver · WebHID · CachyOS</span>
          <span className="flex items-center gap-1">
            <Cable className="h-3 w-3" /> 0xFF13 · 0xFF68 · 0xFF60
          </span>
        </div>
      </footer>
    </div>
  );
}

function BatteryIcon({ percent }: { percent: number | null }) {
  const color = percent === null ? "text-zinc-500" : percent <= 20 ? "text-rose-400" : percent <= 50 ? "text-amber-400" : "text-emerald-400";
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[10px] ${color}`}>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="7" width="17" height="10" rx="2" />
        <path d="M22 11v2" strokeLinecap="round" />
        {percent !== null && <rect x="4" y="9" width={Math.max(1.5, (percent / 100) * 13)} height="6" rx="1" fill="currentColor" stroke="none" />}
      </svg>
    </span>
  );
}
