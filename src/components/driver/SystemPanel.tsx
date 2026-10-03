"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Copy, Download, Search, Terminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Chip, FieldLabel, SectionHeader } from "./atoms";
import { f75log, type F75LogEntry, type LogLevel } from "@/lib/f75/logger";
import type { F75Driver } from "@/lib/f75/driver";
import { cn } from "@/lib/utils";

const EMPTY: F75LogEntry[] = [];

const LEVEL_STYLE: Record<LogLevel, string> = {
  info: "text-zinc-300",
  ok: "text-emerald-400",
  warn: "text-amber-400",
  err: "text-rose-400",
  cmd: "text-sky-400",
  rx: "text-purple-400",
  debug: "text-zinc-600",
};

const LEVEL_BADGE: Record<LogLevel, string> = {
  info: "bg-zinc-800 text-zinc-400",
  ok: "bg-emerald-500/15 text-emerald-400",
  warn: "bg-amber-500/15 text-amber-400",
  err: "bg-rose-500/15 text-rose-400",
  cmd: "bg-sky-500/15 text-sky-400",
  rx: "bg-purple-500/15 text-purple-400",
  debug: "bg-zinc-900 text-zinc-600",
};

type Filter = "all" | "tx" | "rx" | "warn" | "err";

function matchFilter(e: F75LogEntry, f: Filter): boolean {
  switch (f) {
    case "tx":
      return e.level === "cmd";
    case "rx":
      return e.level === "rx";
    case "warn":
      return e.level === "warn";
    case "err":
      return e.level === "err";
    default:
      return true;
  }
}

/** Diagnóstico do driver + console de pacotes (espelho do F12). */
export function SystemPanel({ driver }: { driver: F75Driver | null }) {
  const entries = useSyncExternalStore(f75log.subscribe, f75log.getSnapshot, () => EMPTY);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const consoleRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => matchFilter(e, filter) && (q === "" || e.msg.toLowerCase().includes(q)));
  }, [entries, filter, query]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered, autoScroll]);

  const diag = driver ? driver.getDiagnostics() : null;

  const download = () => {
    const blob = new Blob([f75log.export()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `f75-driver-console-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(f75log.export());
    } catch {
      /* clipboard bloqueado — botão download continua */
    }
  };

  return (
    <section className="space-y-5" aria-label="Sistema">
      <SectionHeader icon={Terminal} title="Sistema" desc="Diagnóstico do driver e console de pacotes" />

      {/* --------------------------- diagnóstico --------------------------- */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <FieldLabel>Interfaces abertas</FieldLabel>
            {diag?.sim && <Chip ok={true}>simulação</Chip>}
          </div>

          {diag && diag.endpoints.length > 0 ? (
            <div className="space-y-2">
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full min-w-[560px] text-left font-mono text-[11px]">
                  <thead>
                    <tr className="text-zinc-600">
                      <th className="pb-1.5 pr-3 font-medium">papel</th>
                      <th className="pb-1.5 pr-3 font-medium">produto</th>
                      <th className="pb-1.5 pr-3 font-medium">USB</th>
                      <th className="pb-1.5 pr-3 font-medium">páginas</th>
                      <th className="pb-1.5 pr-3 font-medium">IDs</th>
                      <th className="pb-1.5 pr-3 font-medium">out</th>
                      <th className="pb-1.5 font-medium">feat</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-400">
                    {diag.endpoints.map((ep) => (
                      <tr key={ep.key} className="border-t border-zinc-800/60">
                        <td className="py-1.5 pr-3 text-emerald-400/90">{ep.role}</td>
                        <td className="max-w-[140px] truncate py-1.5 pr-3" title={ep.product}>
                          {ep.product}
                        </td>
                        <td className="py-1.5 pr-3 text-zinc-500">
                          {ep.vid}:{ep.pid}
                        </td>
                        <td className="py-1.5 pr-3">{ep.usagePages}</td>
                        <td className="py-1.5 pr-3">{ep.hasNumberedIds ? "numerados" : "—"}</td>
                        <td className="py-1.5 pr-3">{ep.maxOutput > 0 ? `${ep.maxOutput}B` : "—"}</td>
                        <td className="py-1.5">{ep.maxFeature > 0 ? `${ep.maxFeature}B` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {diag.dongleRoute && (
                <p className="font-mono text-[10px] leading-relaxed text-emerald-400/90" title="Rota validada pela resposta real do teclado na sonda de bateria">
                  rota do receiver: {diag.dongleRoute}
                </p>
              )}
            </div>
          ) : (
            <p className="font-mono text-[11px] text-zinc-600">{diag?.sim ? "simulação — sem hardware" : "nenhuma interface aberta"}</p>
          )}

          {diag?.lastTx && diag.lastTx.attempts.length > 0 && (
            <div className="space-y-1.5">
              <FieldLabel>Última TX · {diag.lastTx.label}</FieldLabel>
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full min-w-[520px] text-left font-mono text-[11px]">
                  <tbody className="text-zinc-400">
                    {diag.lastTx.attempts.map((a, i) => (
                      <tr key={i} className="border-t border-zinc-800/60">
                        <td className="py-1.5 pr-3 text-zinc-500">{a.target}</td>
                        <td className="py-1.5 pr-3">{a.mode}</td>
                        <td className="py-1.5 pr-3">id {a.reportId}</td>
                        <td className="py-1.5 pr-3 text-zinc-500">{a.wire}</td>
                        <td className={cn("py-1.5", a.result.startsWith("✔") ? "text-emerald-400" : a.result === "…" ? "text-zinc-500" : "text-rose-400/90")}>
                          {a.result}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------- console ----------------------------- */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar no console…"
                className="h-8 border-zinc-800 bg-zinc-950/60 pl-8 text-xs"
                aria-label="Buscar no console"
              />
            </div>
            <Label className="flex items-center gap-2 text-[11px] text-zinc-400">
              <Switch checked={autoScroll} onCheckedChange={setAutoScroll} aria-label="Auto-scroll do console" />
              auto
            </Label>
            <div className="ml-auto flex gap-1.5">
              <Button onClick={copy} variant="outline" size="sm" className="h-8 border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800" title="Copiar tudo">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button onClick={download} variant="outline" size="sm" className="h-8 border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800" title="Baixar .log">
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button onClick={() => f75log.clear()} variant="outline" size="sm" className="h-8 border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800" title="Limpar">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "all", label: "tudo" },
                { id: "tx", label: "TX" },
                { id: "rx", label: "RX" },
                { id: "warn", label: "avisos" },
                { id: "err", label: "erros" },
              ] as { id: Filter; label: string }[]
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`min-h-[28px] rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                  filter === f.id ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="ml-auto self-center font-mono text-[10px] text-zinc-600">
              {filtered.length}/{entries.length}
            </span>
          </div>

          <div
            ref={consoleRef}
            className="scrollbar-thin h-[340px] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 font-mono text-[11px] leading-relaxed"
            aria-live="polite"
            aria-label="Console de pacotes do driver"
          >
            {filtered.length === 0 ? (
              <p className="text-zinc-700">— vazio —</p>
            ) : (
              filtered.map((e) => (
                <div key={e.id} className="whitespace-pre-wrap break-words">
                  <span className="text-zinc-700">{e.time}</span>{" "}
                  <span className={cn("rounded px-1 py-px text-[9px] uppercase", LEVEL_BADGE[e.level])}>{e.level}</span>{" "}
                  <span className={LEVEL_STYLE[e.level]}>{e.msg}</span>
                </div>
              ))
            )}
          </div>

          <p className="text-[10px] leading-relaxed text-zinc-600">
            Cada pacote enviado/recebido aparece aqui com hexdump completo — o mesmo conteúdo vai pro console do navegador (F12 → filtro [F75]).
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
