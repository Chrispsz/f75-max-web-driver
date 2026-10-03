"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cable,
  FlaskConical,
  Keyboard,
  Loader2,
  Monitor,
  Palette,
  Plug,
  PlugZap,
  RefreshCw,
  Terminal,
  TriangleAlert,
  Usb,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { BatteryGauge, Chip, FieldLabel, LockedNote, MonoLine, Segmented, SectionHeader } from "./atoms";
import { DisplayPanel } from "./DisplayPanel";
import { KeysPanel } from "./KeysPanel";
import { SystemPanel } from "./SystemPanel";
import { F75Driver, F75Error, type DriverStatus } from "@/lib/f75/driver";
import { f75log } from "@/lib/f75/logger";
import {
  DIRECTIONS,
  RESPONSE_LEVELS,
  RGB_MODES,
  SLEEP_OPTIONS,
  hexToInt,
  intToHex,
  type RgbSettings,
} from "@/lib/f75/protocol";

const CYAN = "#41E8FF";
const UI_KEY = "f75.webdriver.v1";

type SectionId = "device" | "lighting" | "performance" | "display" | "keys" | "system";

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon; hint: string }[] = [
  { id: "device", label: "Dispositivo", icon: Usb, hint: "Conexão, interfaces e estado do teclado" },
  { id: "lighting", label: "Iluminação", icon: Palette, hint: "Efeitos, cor, brilho e velocidade" },
  { id: "performance", label: "Desempenho", icon: Zap, hint: "Latência, suspensão e modo jogo" },
  { id: "display", label: "Tela", icon: Monitor, hint: "GIFs, imagens e relógio do display" },
  { id: "keys", label: "Teclas", icon: Keyboard, hint: "Teste de teclas em tempo real" },
  { id: "system", label: "Sistema", icon: Terminal, hint: "Diagnóstico e console de pacotes" },
];

export interface PerfState {
  level: number;
  sleep: number;
  game: boolean;
  lockAltTab: boolean;
  lockAltF4: boolean;
  lockWin: boolean;
}

type Run = (label: string, action: () => Promise<void>) => Promise<void>;

const COLOR_PRESETS = [
  { hex: "#41E8FF", name: "Ciano gelo" },
  { hex: "#FFFFFF", name: "Branco" },
  { hex: "#FF3B30", name: "Vermelho" },
  { hex: "#FF9500", name: "Laranja" },
  { hex: "#FFD60A", name: "Amarelo" },
  { hex: "#30D158", name: "Verde" },
  { hex: "#BF5AF2", name: "Roxo" },
  { hex: "#FF375F", name: "Rosa" },
];

export default function F75App() {
  const driverRef = useRef<F75Driver | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [section, setSection] = useState<SectionId>("device");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [inIframe, setInIframe] = useState(false);
  const [driverReady, setDriverReady] = useState(false);
  const [status, setStatus] = useState<DriverStatus>({ sim: false, wiredCommand: false, wiredDisplay: false, dongle: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [battery, setBattery] = useState<number | null>(null);

  const [rgb, setRgbState] = useState<RgbSettings>({ mode: 1, brightness: 3, speed: 2, direction: 0, colorful: false, color: hexToInt(CYAN) });
  const [perf, setPerfState] = useState<PerfState>({ level: 2, sleep: 2, game: false, lockAltTab: false, lockAltF4: false, lockWin: false });
  const [resetArmed, setResetArmed] = useState(false);

  const setRgb = useCallback((patch: Partial<RgbSettings>) => setRgbState((prev) => ({ ...prev, ...patch })), []);
  const setPerf = useCallback((patch: Partial<PerfState>) => setPerfState((prev) => ({ ...prev, ...patch })), []);

  /* ------------------------------- bootstrap ------------------------------- */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(UI_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { section?: SectionId; rgb?: Partial<RgbSettings>; perf?: Partial<PerfState> };
        if (saved.section && SECTIONS.some((s) => s.id === saved.section)) setSection(saved.section);
        if (saved.rgb) setRgbState((prev) => ({ ...prev, ...saved.rgb }));
        if (saved.perf) setPerfState((prev) => ({ ...prev, ...saved.perf }));
      }
    } catch {
      /* primeira execução */
    }

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
    f75log.info("F75 Max Web Driver v3 pronto — protocolo nativo portado, 100% local. Console espelhado aqui e no F12 (filtro [F75]).");
    driver
      .reconnectSaved(true)
      .then((s) => {
        if (s.wiredCommand || s.wiredDisplay || s.dongle) f75log.ok("Dispositivos já autorizados rebinados automaticamente.");
      })
      .catch(() => undefined);
    return () => {
      driver.onStatus = null;
      driver.onBattery = null;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({ section, rgb, perf }));
    } catch {
      /* storage cheio/bloqueado — segue sem persistir */
    }
  }, [section, rgb, perf]);

  const run = useCallback(
    async (label: string, action: () => Promise<void>) => {
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
    },
    [busy]
  );

  /* --------------------------------- ações --------------------------------- */

  const connect = () =>
    void run("connect", async () => {
      const s = await driverRef.current!.connectPicker();
      if (s.dongle) await driverRef.current!.queryBattery(true).catch(() => undefined);
    });

  const reconnect = () =>
    void run("reconnect", async () => {
      const s = await driverRef.current!.reconnectSaved(false);
      if (s.dongle) await driverRef.current!.queryBattery(true).catch(() => undefined);
    });

  const disconnect = () =>
    void run("disconnect", async () => {
      setBattery(null);
      await driverRef.current!.disconnect();
    });

  const toggleSim = () =>
    void run("sim", async () => {
      setBattery(null);
      if (driverRef.current!.isSim) await driverRef.current!.disconnect();
      else await driverRef.current!.enableSim();
    });

  const applyRgb = () => void run("rgb", () => driverRef.current!.applyRGB(rgb));

  const applyPerf = () =>
    void run("perf", () =>
      driverRef.current!.applyPerformance({
        level: perf.level,
        sleep: perf.sleep,
        game: perf.game,
        lockAltTab: perf.lockAltTab,
        lockAltF4: perf.lockAltF4,
        lockWin: perf.lockWin,
      })
    );

  const unlockAll = () => {
    setPerf({ game: false, lockAltTab: false, lockAltF4: false, lockWin: false });
    void run("perf", () =>
      driverRef.current!.applyPerformance({ level: perf.level, sleep: perf.sleep, game: false, lockAltTab: false, lockAltF4: false, lockWin: false })
    );
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

  const syncClock = () => void run("clock", () => driverRef.current!.syncClock());

  /* --------------------------------- estado -------------------------------- */

  const wiredReady = status.wiredCommand && status.wiredDisplay;
  const anyConnected = status.sim || status.wiredCommand || status.wiredDisplay || status.dongle;
  const wirelessReady = status.sim || status.dongle;

  const connectionLabel = status.sim
    ? "Simulação"
    : status.dongle && wiredReady
      ? "2.4G + Cabo"
      : status.dongle
        ? "Receiver 2.4G"
        : wiredReady
          ? "Cabo USB-C"
          : anyConnected
            ? "Parcial"
            : "Desconectado";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100 selection:bg-emerald-500/30">
      {/* ------------------------------- topbar ------------------------------- */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800/80 px-4 sm:px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10">
          <Keyboard className="h-4 w-4 text-emerald-400" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold leading-tight">
            F75 Max <span className="text-emerald-400">Web Driver</span>
          </h1>
          <p className="truncate text-[10px] leading-tight text-zinc-500">protocolo nativo portado · 100% local no navegador</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {status.dongle && !status.sim && (
            <Chip ok={true} title="Bateria do teclado via receiver">
              <BatteryGauge percent={battery} />
            </Chip>
          )}
          <Chip ok={anyConnected} title="Estado da conexão">
            <span className={`h-1.5 w-1.5 rounded-full ${anyConnected ? "bg-emerald-400" : "bg-zinc-600"}`} />
            {connectionLabel}
          </Chip>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ------------------------------ sidebar ------------------------------ */}
        <aside className="hidden w-56 shrink-0 flex-col justify-between border-r border-zinc-800/80 p-3 md:flex">
          <nav aria-label="Seções do driver" className="space-y-1">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-current={section === s.id ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  section === s.id
                    ? "bg-emerald-500/10 font-semibold text-emerald-300"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                <s.icon className="h-4 w-4 shrink-0" />
                {s.label}
              </button>
            ))}
          </nav>
          <div className="space-y-2 px-1">
            <div className="flex flex-wrap gap-1.5">
              <Chip ok={supported === true} title={supported ? "WebHID disponível" : "Use Chrome/Chromium/Edge/Brave"}>
                WebHID
              </Chip>
              <Chip title="Nenhuma telemetria — nada sai da máquina">100% local</Chip>
            </div>
            <p className="font-mono text-[10px] leading-relaxed text-zinc-600">v3 · TX descriptor-aware</p>
          </div>
        </aside>

        {/* --------------------------- conteúdo ------------------------------ */}
        <div className="flex min-w-0 flex-1 flex-col">
          <nav aria-label="Seções do driver" className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-800/80 px-3 py-2 md:hidden">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-current={section === s.id ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  section === s.id
                    ? "border-emerald-500/50 bg-emerald-500/10 font-semibold text-emerald-300"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-400"
                }`}
              >
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
            ))}
          </nav>

          <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-3xl space-y-5">
              {supported === false && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs leading-relaxed text-amber-100/90">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>
                    <strong className="text-amber-300">WebHID indisponível.</strong> Use Chrome, Chromium, Edge, Brave ou Opera — ou explore com o
                    modo simulação.
                  </span>
                </div>
              )}
              {supported && inIframe && (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-xs leading-relaxed text-emerald-100/80">
                  <Cable className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>
                    Rodando em iframe: se o seletor de dispositivos não abrir, use <strong>Open in New Tab</strong> acima do preview.
                  </span>
                </div>
              )}

              {section === "device" && (
                <DevicePanel
                  supported={supported}
                  status={status}
                  anyConnected={anyConnected}
                  wiredReady={wiredReady}
                  busy={busy}
                  battery={battery}
                  driverReady={driverReady}
                  resetArmed={resetArmed}
                  onConnect={connect}
                  onReconnect={reconnect}
                  onDisconnect={disconnect}
                  onToggleSim={toggleSim}
                  onFactoryReset={factoryReset}
                />
              )}

              {section === "lighting" && (
                <LightingPanel rgb={rgb} setRgb={setRgb} canSend={wirelessReady} busy={busy} onApply={applyRgb} />
              )}

              {section === "performance" && (
                <PerformancePanel perf={perf} setPerf={setPerf} canSend={wirelessReady} busy={busy} onApply={applyPerf} onUnlock={unlockAll} />
              )}

              {section === "display" && (
                <DisplayPanel driver={driverReady ? driverRef.current : null} run={run} busy={busy} ready={status.sim || wiredReady} sim={status.sim} />
              )}

              {section === "keys" && <KeysPanel active={section === "keys"} />}

              {section === "system" && <SystemPanel driver={driverReady ? driverRef.current : null} />}
            </div>
          </main>
        </div>
      </div>

      {/* ----------------------------- status bar ----------------------------- */}
      <footer className="shrink-0 border-t border-zinc-800/80 bg-zinc-950">
        <div className="scrollbar-thin flex items-center gap-2 overflow-x-auto px-4 py-2 text-[11px] text-zinc-500 sm:px-5">
          <Chip ok={status.wiredCommand} title="Cabo USB-C · canal de comando 0xFF13">cabo·cmd</Chip>
          <Chip ok={status.wiredDisplay} title="Cabo USB-C · canal de display 0xFF68">cabo·disp</Chip>
          <Chip ok={status.dongle} title="Receiver 2.4G · canais 0xFF59/0xFF60">2.4G</Chip>
          {status.sim && (
            <Chip ok={true} title="Modo simulação ativo">
              sim
            </Chip>
          )}
          <span className="ml-auto hidden shrink-0 items-center gap-1 font-mono text-[10px] text-zinc-600 sm:flex">
            <Cable className="h-3 w-3" /> 0xFF13 · 0xFF68 · 0xFF60
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ============================== dispositivo ================================ */

function DevicePanel(props: {
  supported: boolean | null;
  status: DriverStatus;
  anyConnected: boolean;
  wiredReady: boolean;
  busy: string | null;
  battery: number | null;
  driverReady: boolean;
  resetArmed: boolean;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onToggleSim: () => void;
  onFactoryReset: () => void;
}) {
  const { supported, status, anyConnected, wiredReady, busy, battery, driverReady, resetArmed } = props;
  const diag = driverReady ? null : null; // tabela detalhada vive em Sistema
  void diag;

  return (
    <section className="space-y-5" aria-label="Dispositivo">
      <SectionHeader icon={Usb} title="Dispositivo" desc="Conexão e estado do hardware" />

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip ok={status.wiredCommand}>cabo · comando 0xFF13</Chip>
            <Chip ok={status.wiredDisplay}>cabo · display 0xFF68</Chip>
            <Chip ok={status.dongle}>receiver 2.4G</Chip>
            {status.dongle && !status.sim && (
              <Chip ok={battery !== null}>
                <BatteryGauge percent={battery} />
              </Chip>
            )}
          </div>

          <p className="text-xs leading-relaxed text-zinc-500">
            No seletor, marque <strong className="text-zinc-300">todas</strong> as entradas “Aula F75 Max” e “Aula F75 Max 2.4G”.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={props.onConnect} disabled={anyBusy(busy) || status.sim} className="h-9 bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
              {busy === "connect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
              Conectar
            </Button>
            <Button onClick={props.onReconnect} disabled={anyBusy(busy) || status.sim} variant="outline" className="h-9 border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
              {busy === "reconnect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Reconectar
            </Button>
            {anyConnected && (
              <Button onClick={props.onDisconnect} disabled={anyBusy(busy)} variant="outline" className="h-9 border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
                <PlugZap className="mr-2 h-4 w-4" /> Desconectar
              </Button>
            )}
            <Button
              onClick={props.onToggleSim}
              disabled={anyBusy(busy)}
              variant="outline"
              className={`h-9 gap-1.5 ${status.sim ? "border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20" : "border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800"}`}
            >
              <FlaskConical className="h-4 w-4" />
              Simulação
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-rose-500/20 bg-rose-500/[0.03]">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-rose-400" />
            <p className="text-sm font-semibold">Restauração de fábrica</p>
          </div>
          <p className="text-xs leading-relaxed text-zinc-500">
            Apaga display, keymap, macros e lighting. Requer cabo USB-C. Dois cliques pra confirmar.
          </p>
          <Button
            onClick={props.onFactoryReset}
            disabled={anyBusy(busy) || !(status.sim || wiredReady)}
            variant="outline"
            className={`h-9 ${
              resetArmed ? "border-rose-500 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25" : "border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {busy === "reset" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {resetArmed ? "Confirmar reset" : "Restaurar agora"}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

function anyBusy(busy: string | null): boolean {
  return busy !== null;
}

/* =============================== iluminação ================================ */

function LightingPanel(props: {
  rgb: RgbSettings;
  setRgb: (patch: Partial<RgbSettings>) => void;
  canSend: boolean;
  busy: string | null;
  onApply: () => void;
}) {
  const { rgb, setRgb, canSend, busy } = props;
  const modeName = RGB_MODES.find((m) => m.id === rgb.mode)?.name ?? `modo ${rgb.mode}`;

  return (
    <section className="space-y-5" aria-label="Iluminação">
      <SectionHeader
        icon={Palette}
        title="Iluminação"
        desc="Aplicada via receiver 2.4G"
        right={
          <MonoLine>
            {`0x05 · ${modeName} · ${intToHex(rgb.color)} · b${rgb.brightness} v${rgb.speed} ${DIRECTIONS[rgb.direction]}${rgb.colorful ? " · colorful" : ""}`}
          </MonoLine>
        }
      />

      {!canSend && (
        <LockedNote>
          <Plug className="h-3.5 w-3.5 shrink-0" />
          Conecte o receiver 2.4G — ou ative a simulação pra explorar.
        </LockedNote>
      )}

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="space-y-5 p-4 sm:p-5">
          <div className="space-y-2">
            <FieldLabel>Efeito</FieldLabel>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {RGB_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={!canSend}
                  onClick={() => setRgb({ mode: m.id })}
                  className={`min-h-[36px] rounded-md border px-2 py-1.5 text-xs transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                    rgb.mode === m.id
                      ? "border-emerald-500/60 bg-emerald-500/15 font-semibold text-emerald-300"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel>Cor fixa</FieldLabel>
            <div className="flex flex-wrap items-center gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.name}
                  disabled={!canSend}
                  onClick={() => setRgb({ color: hexToInt(c.hex) })}
                  className={`h-8 w-8 rounded-lg border-2 transition-transform disabled:cursor-not-allowed disabled:opacity-40 ${
                    rgb.color === hexToInt(c.hex) ? "scale-110 border-emerald-400" : "border-zinc-700 hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.hex }}
                  aria-label={`Cor ${c.name} ${c.hex}`}
                />
              ))}
              <Label
                className={`flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/60 px-2 text-[11px] text-zinc-400 hover:border-zinc-600 ${!canSend ? "pointer-events-none opacity-40" : ""}`}
                title="Cor personalizada"
              >
                <input
                  type="color"
                  value={intToHex(rgb.color)}
                  disabled={!canSend}
                  onChange={(e) => setRgb({ color: hexToInt(e.target.value) })}
                  className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                  aria-label="Cor personalizada"
                />
                custom
              </Label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FieldLabel>Brilho</FieldLabel>
                <span className="font-mono text-[11px] text-emerald-400">{rgb.brightness}/5</span>
              </div>
              <Slider value={[rgb.brightness]} min={1} max={5} step={1} disabled={!canSend} onValueChange={([v]) => setRgb({ brightness: v })} aria-label="Brilho" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FieldLabel>Velocidade</FieldLabel>
                <span className="font-mono text-[11px] text-emerald-400">{rgb.speed}/5</span>
              </div>
              <Slider value={[rgb.speed]} min={1} max={5} step={1} disabled={!canSend} onValueChange={([v]) => setRgb({ speed: v })} aria-label="Velocidade" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel>Direção</FieldLabel>
              <Segmented
                disabled={!canSend}
                value={rgb.direction}
                onChange={(v) => setRgb({ direction: v })}
                options={DIRECTIONS.map((d, i) => ({ value: i, label: d }))}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold">Colorful</p>
                <p className="text-[11px] text-zinc-500">arco-íris independente da cor</p>
              </div>
              <Switch checked={rgb.colorful} disabled={!canSend} onCheckedChange={(v) => setRgb({ colorful: v })} aria-label="Colorful" />
            </div>
          </div>

          <Button onClick={props.onApply} disabled={!canSend || busy !== null} className="h-10 w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 sm:w-auto">
            {busy === "rgb" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Palette className="mr-2 h-4 w-4" />}
            Aplicar iluminação
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

/* =============================== desempenho ================================ */

function PerformancePanel(props: {
  perf: PerfState;
  setPerf: (patch: Partial<PerfState>) => void;
  canSend: boolean;
  busy: string | null;
  onApply: () => void;
  onUnlock: () => void;
}) {
  const { perf, setPerf, canSend, busy } = props;

  return (
    <section className="space-y-5" aria-label="Desempenho">
      <SectionHeader
        icon={Zap}
        title="Desempenho"
        desc="Latência, suspensão e modo jogo"
        right={<MonoLine>{`0x07 · lvl ${perf.level} · sleep ${perf.sleep} · game=${perf.game ? 1 : 0} altTab=${perf.lockAltTab ? 1 : 0} altF4=${perf.lockAltF4 ? 1 : 0} win=${perf.lockWin ? 1 : 0}`}</MonoLine>}
      />

      {!canSend && (
        <LockedNote>
          <Plug className="h-3.5 w-3.5 shrink-0" />
          Conecte o receiver 2.4G — ou ative a simulação pra explorar.
        </LockedNote>
      )}

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="space-y-5 p-4 sm:p-5">
          <div className="space-y-2">
            <FieldLabel>Latência (polling)</FieldLabel>
            <Segmented
              disabled={!canSend}
              value={perf.level}
              onChange={(v) => setPerf({ level: v })}
              options={RESPONSE_LEVELS.map((r) => ({ value: r.id, label: `N${r.id} · ${r.name.split("·")[1].trim().split(" ")[0]}`, title: r.name }))}
            />
          </div>

          <div className="space-y-2">
            <FieldLabel>Suspensão automática</FieldLabel>
            <Segmented disabled={!canSend} value={perf.sleep} onChange={(v) => setPerf({ sleep: v })} options={SLEEP_OPTIONS.map((s) => ({ value: s.id, label: s.name }))} />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold">Modo jogo</p>
              <p className="text-[11px] text-zinc-500">perfil de resposta pra jogo</p>
            </div>
            <Switch checked={perf.game} disabled={!canSend} onCheckedChange={(v) => setPerf({ game: v })} aria-label="Modo jogo" />
          </div>

          <div className="space-y-2">
            <FieldLabel>Bloqueios independentes</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  { key: "lockAltTab", label: "Alt+Tab", hint: "firmware ignora o atalho" },
                  { key: "lockAltF4", label: "Alt+F4", hint: "firmware ignora o atalho" },
                  { key: "lockWin", label: "Tecla Win", hint: "LED branco fixo = ligado" },
                ] as const
              ).map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold">{item.label}</p>
                    <p className="text-[10px] text-zinc-500">{item.hint}</p>
                  </div>
                  <Switch checked={perf[item.key]} disabled={!canSend} onCheckedChange={(v) => setPerf({ [item.key]: v })} aria-label={`Bloquear ${item.label}`} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={props.onApply} disabled={!canSend || busy !== null} className="h-10 bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
              {busy === "perf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Aplicar
            </Button>
            <Button onClick={props.onUnlock} disabled={!canSend || busy !== null} variant="outline" className="h-10 border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
              Desbloquear tudo
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
