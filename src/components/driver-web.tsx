"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Battery,
  Cable,
  Clock,
  Cpu,
  Gamepad2,
  Info,
  Loader2,
  Monitor,
  Palette,
  ShieldCheck,
  Trash2,
  Upload,
  Usb,
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
  RGB_MODES,
  SLEEP_OPTIONS,
  buildDisplayStream,
  decodeAnimatedGif,
  decodeStillImage,
  hexToInt,
  type EncodedDisplayStream,
  type FitMode,
} from "@/lib/aula-protocol";
import { AulaWebHid, AulaWebHidError, type ConnectionStatus } from "@/lib/aula-webhid";

const CYAN_PRESET = "#41E8FF";

interface PreparedUpload {
  stream: EncodedDisplayStream;
  fileName: string;
  previewUrl: string;
}

export default function DriverWeb() {
  const engineRef = useRef<AulaWebHid | null>(null);
  const logIdRef = useRef(0);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [supported, setSupported] = useState<boolean | null>(null);
  const [inIframe, setInIframe] = useState(false);
  const [connected, setConnected] = useState<ConnectionStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ id: number; text: string }[]>([]);

  const [battery, setBattery] = useState<number | null>(null);

  const [mode, setMode] = useState("1");
  const [color, setColor] = useState(CYAN_PRESET);
  const [brightness, setBrightness] = useState(3);
  const [speed, setSpeed] = useState(2);
  const [direction, setDirection] = useState(0);
  const [colorful, setColorful] = useState(false);
  const [responseLevel, setResponseLevel] = useState(1);
  const [sleepTime, setSleepTime] = useState(1);
  const [gameMode, setGameMode] = useState(false);

  const [fit, setFit] = useState<FitMode>("contain");
  const [slot, setSlot] = useState("1");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [prepared, setPrepared] = useState<PreparedUpload | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [resetArmed, setResetArmed] = useState(false);

  const addLog = useCallback((text: string) => {
    logIdRef.current += 1;
    setLogs((prev) => [...prev.slice(-120), { id: logIdRef.current, text }]);
  }, []);

  useEffect(() => {
    engineRef.current = new AulaWebHid(addLog);
    setSupported(AulaWebHid.supported);
    try {
      setInIframe(window.self !== window.top);
    } catch {
      setInIframe(true);
    }
  }, [addLog]);

  const run = useCallback(
    async (label: string, action: () => Promise<void>) => {
      const engine = engineRef.current;
      if (!engine) return;
      setBusy(label);
      try {
        await action();
      } catch (err) {
        const message = err instanceof AulaWebHidError ? err.message : String(err);
        addLog(`✗ ${message}`);
      } finally {
        setBusy(null);
      }
    },
    [addLog]
  );

  const handleConnect = () =>
    run("connect", async () => {
      const engine = engineRef.current;
      if (!engine) return;
      const result = await engine.connect();
      setConnected({ wiredCommand: result.wiredCommand, wiredDisplay: result.wiredDisplay, dongle: result.dongle });
    });

  const handleDisconnect = () =>
    run("disconnect", async () => {
      await engineRef.current?.disconnect();
      setConnected(null);
      setBattery(null);
    });

  const handleBattery = () =>
    run("battery", async () => {
      const percent = await engineRef.current?.queryBattery();
      setBattery(percent ?? null);
      addLog(percent == null ? "🔋 Bateria não respondou." : `🔋 Bateria: ${percent}%`);
    });

  const handleApplyRGB = () =>
    run("rgb", async () => {
      await engineRef.current?.applyRGB({
        mode: Number(mode),
        brightness,
        speed,
        direction,
        colorful,
        color: hexToInt(color),
      });
    });

  const handlePerformance = () =>
    run("performance", async () => {
      await engineRef.current?.applyPerformance(responseLevel, sleepTime);
    });

  const handleGameMode = (enabled: boolean) =>
    run("gamemode", async () => {
      setGameMode(enabled);
      await engineRef.current?.setGameMode(enabled, responseLevel, sleepTime);
    });

  const handleFile = async (file: File | null) => {
    setUploadFile(file);
    setPrepared(null);
    setUploadProgress(0);
    if (!file) return;
    addLog(`🖼 Arquivo: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
  };

  const handlePrepare = () =>
    run("prepare", async () => {
      if (!uploadFile) return;
      addLog("⚙ Decodificando e convertendo pra RGB565 128×128…");
      const isGif = uploadFile.type === "image/gif";
      const frames = isGif ? await decodeAnimatedGif(uploadFile) : await decodeStillImage(uploadFile);
      const stream = buildDisplayStream(frames, fit);
      const previewUrl = URL.createObjectURL(uploadFile);
      setPrepared({ stream, fileName: uploadFile.name, previewUrl });
      addLog(
        `✔ Pronto: ${stream.frameCount} frame(s) · ${stream.chunkCount} blocos de 4 KB · payload ${((stream.data.length / 1024) | 0).toLocaleString("pt-BR")} KB`
      );
      if (previewCanvasRef.current) {
        const ctx = previewCanvasRef.current.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.clearRect(0, 0, 128, 128);
          ctx.drawImage(frames[0].bitmap, 0, 0, 128, 128);
        }
      }
    });

  const handleUpload = () =>
    run("upload", async () => {
      if (!prepared) return;
      const slotNumber = Number(slot);
      setUploadProgress(0);
      await engineRef.current?.uploadDisplay(prepared.stream, slotNumber, (sent, total) => {
        setUploadProgress(Math.round((sent / total) * 100));
      });
    });

  const handleClock = () => run("clock", async () => void (await engineRef.current?.syncClock()));

  const handleReset = () => {
    if (!resetArmed) {
      setResetArmed(true);
      setTimeout(() => setResetArmed(false), 6000);
      return;
    }
    setResetArmed(false);
    void run("reset", async () => {
      await engineRef.current?.factoryReset((stage) => addLog(`· ${stage}`));
    });
  };

  const chip = (label: string, ok: boolean | undefined) => (
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

  return (
    <div className="space-y-6">
      {/* status / compat */}
      {supported === false && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-100/90 leading-relaxed">
          <strong className="text-amber-400">WebHID indisponível neste navegador.</strong> O driver web usa a
          API WebHID, suportada no <strong>Chrome, Chromium, Edge, Brave e Opera</strong> (Firefox e Safari
          não suportam). No CachyOS: instale o <code className="rounded bg-zinc-800 px-1.5 py-0.5">chromium</code>{" "}
          ou o Google Chrome, abra esta página nele e conecte o teclado.
        </div>
      )}
      {supported && inIframe && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5 text-sm text-sky-100/90 leading-relaxed">
          <strong className="text-sky-400">Dica:</strong> se o botão de conectar não abrir o seletor de
          dispositivos, clique em <strong>&ldquo;Open in New Tab&rdquo;</strong> acima do painel de preview —
          WebHID funciona melhor com a página aberta direto na aba (fora do iframe).
        </div>
      )}

      {/* connection */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Usb className="h-4 w-4 text-emerald-400" /> 1. Conecte os dispositivos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            O navegador vai listar <strong className="text-zinc-200">Aula F75 Max</strong> (cabo) e{" "}
            <strong className="text-zinc-200">Aula F75 Max 2.4G</strong> (receiver). Selecione todos os que
            aparecerem — o app usa os endpoints 0xFF13 (comando), 0xFF68 (display) e 0xFF60 (2.4G), iguais ao
            driver nativo. As regras udev que você já instalou valem pro Chrome também.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleConnect} disabled={busy !== null} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
              {busy === "connect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cable className="mr-2 h-4 w-4" />}
              Conectar dispositivos
            </Button>
            {connected && (
              <Button variant="outline" onClick={handleDisconnect} disabled={busy !== null} className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
                Desconectar
              </Button>
            )}
            {connected && (
              <div className="flex flex-wrap gap-2">
                {chip("Cabo · comando 0xFF13", connected.wiredCommand)}
                {chip("Cabo · display 0xFF68", connected.wiredDisplay)}
                {chip("Receiver 2.4G 0xFF60", connected.dongle)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* receiver panel */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4 text-pink-400" /> 2. Receiver 2.4G — RGB, bateria e performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* rgb */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Efeito</Label>
                  <Select value={mode} onValueChange={setMode}>
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
                  <Label className="text-xs text-zinc-400">Cor fixa</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      aria-label="Cor do RGB"
                      className="h-10 w-12 cursor-pointer rounded-md border border-zinc-700 bg-zinc-950 p-1"
                    />
                    <Input value={color} onChange={(e) => setColor(e.target.value)} className="border-zinc-700 bg-zinc-950 font-mono text-xs text-zinc-200" />
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setColor(CYAN_PRESET)}
                className="border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 hover:text-sky-200"
              >
                ⚡ Preset: Ciano gelo {CYAN_PRESET}
              </Button>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400">Brilho: {brightness}/5</Label>
                  <Slider value={[brightness]} min={1} max={5} step={1} onValueChange={(v) => setBrightness(v[0])} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400">Velocidade: {speed}/5</Label>
                  <Slider value={[speed]} min={1} max={5} step={1} onValueChange={(v) => setSpeed(v[0])} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Direção</Label>
                  <Select value={String(direction)} onValueChange={(v) => setDirection(Number(v))}>
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
                <Switch id="colorful" checked={colorful} onCheckedChange={setColorful} />
                <Label htmlFor="colorful" className="text-xs text-zinc-400">
                  Multicolor (colorful) — desligado mantém a cor escolhida
                </Label>
              </div>
              <Button onClick={handleApplyRGB} disabled={busy !== null || !connected?.dongle} className="w-full bg-pink-500 text-zinc-950 hover:bg-pink-400">
                {busy === "rgb" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Palette className="mr-2 h-4 w-4" />}
                Aplicar RGB
              </Button>
            </div>

            {/* battery + performance */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <Battery className="h-5 w-5 text-emerald-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-200">Bateria</p>
                  <p className="text-xs text-zinc-500">{battery === null ? "sem leitura" : `${battery}%`}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleBattery} disabled={busy !== null || !connected?.dongle} className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
                  {busy === "battery" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Consultar"}
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Response level</Label>
                  <Select value={String(responseLevel)} onValueChange={(v) => setResponseLevel(Number(v))}>
                    <SelectTrigger className="border-zinc-700 bg-zinc-950 text-zinc-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-zinc-700 bg-zinc-950 text-zinc-200">
                      {[1, 2, 3, 4, 5].map((l) => (
                        <SelectItem key={l} value={String(l)}>
                          Nível {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Sleep</Label>
                  <Select value={String(sleepTime)} onValueChange={(v) => setSleepTime(Number(v))}>
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
              <Button onClick={handlePerformance} disabled={busy !== null || !connected?.dongle} variant="outline" className="w-full border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800">
                {busy === "performance" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cpu className="mr-2 h-4 w-4" />}
                Aplicar response + sleep
              </Button>
              <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <Gamepad2 className="h-5 w-5 text-amber-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-200">Game Mode</p>
                  <p className="text-xs text-zinc-500">trava Win, Alt+Tab e Alt+F4 (tecla Win fica branca)</p>
                </div>
                <Switch checked={gameMode} onCheckedChange={handleGameMode} disabled={busy !== null || !connected?.dongle} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* display panel */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Monitor className="h-4 w-4 text-sky-400" /> 3. Cabo USB-C — display, relógio e reset
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
            <div className="space-y-3">
              <div className="rounded-xl border-2 border-zinc-700 bg-zinc-950 p-1">
                <canvas ref={previewCanvasRef} width={128} height={128} className="h-auto w-full rounded-lg" />
              </div>
              <p className="text-center text-xs text-zinc-500">prévia do 1º frame (128×128)</p>
            </div>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-zinc-400">Imagem ou GIF (128×128 recomendado)</Label>
                  <Input
                    type="file"
                    accept="image/gif,image/png,image/jpeg,image/webp,image/bmp"
                    onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
                    className="border-zinc-700 bg-zinc-950 text-xs text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:text-zinc-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Slot (1–255)</Label>
                  <Input type="number" min={1} max={255} value={slot} onChange={(e) => setSlot(e.target.value)} className="border-zinc-700 bg-zinc-950 text-zinc-200" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Ajuste na tela</Label>
                  <Select value={fit} onValueChange={(v) => setFit(v as FitMode)}>
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
                <div className="flex items-end">
                  <Button onClick={handlePrepare} disabled={busy !== null || !uploadFile} variant="outline" className="w-full border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800">
                    {busy === "prepare" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cpu className="mr-2 h-4 w-4" />}
                    Preparar conversão
                  </Button>
                </div>
              </div>
              {prepared && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
                  <p className="text-xs text-zinc-400">
                    <strong className="text-zinc-200">{prepared.fileName}</strong> · {prepared.stream.frameCount} frame(s) ·{" "}
                    {prepared.stream.chunkCount} blocos · {Math.round(prepared.stream.data.length / 1024).toLocaleString("pt-BR")} KB de payload
                  </p>
                  <Progress value={uploadProgress} className="h-2" />
                  <Button onClick={handleUpload} disabled={busy !== null} className="w-full bg-sky-500 text-zinc-950 hover:bg-sky-400">
                    {busy === "upload" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Enviar pro slot {slot} {busy === "upload" ? `(${uploadProgress}%)` : ""}
                  </Button>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Button onClick={handleClock} disabled={busy !== null || !connected?.wiredCommand} variant="outline" className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800">
                  {busy === "clock" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
                  Sincronizar relógio da telinha
                </Button>
                <Button onClick={handleReset} disabled={busy !== null || !connected?.wiredCommand} variant={resetArmed ? "destructive" : "outline"} className={resetArmed ? "" : "border-rose-500/40 bg-transparent text-rose-300 hover:bg-rose-500/10"}>
                  {busy === "reset" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  {resetArmed ? "Confirmar factory reset?" : "Factory reset (apaga tudo!)"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* log */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> Log do driver (100% local — nada sai do seu navegador)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300 scrollbar-thin">
            {logs.length === 0 ? (
              <p className="text-zinc-600">Conecte os dispositivos pra começar…</p>
            ) : (
              logs.map((l) => (
                <p key={l.id} className="whitespace-pre-wrap">
                  {l.text}
                </p>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-xs text-zinc-500 leading-relaxed">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
        <p>
          Porta em TypeScript do protocolo do driver nativo (mesmos pacotes HID: feature reports 0xFF13, chunks de
          4 KB em 0xFF68, reports de 32 B no 0xFF60). Requer Chrome/Chromium + as regras udev já instaladas. Se algo
          falhar, o painel de diagnóstico do app nativo continua sendo a referência.
        </p>
      </div>
    </div>
  );
}
