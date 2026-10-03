/**
 * F75 Logger — logging central do driver web.
 *
 * Todo evento do driver passa por aqui e é:
 *  1. Espelhado no console do navegador (F12) com o prefixo [F75] — incluindo
 *     hexdumps completos de cada pacote enviado/recebido;
 *  2. Guardado num ring buffer consultável pela UI (painel de logs, com
 *     filtro, busca e exportação).
 */

export type LogLevel = "info" | "ok" | "warn" | "err" | "cmd" | "rx" | "debug";

export interface F75LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  msg: string;
}

const LEVEL_META: Record<LogLevel, { console: "log" | "info" | "warn" | "error" | "debug"; style: string; tag: string }> = {
  info: { console: "log", style: "color:#a1a1aa", tag: "info" },
  ok: { console: "log", style: "color:#34d399;font-weight:bold", tag: " ok " },
  warn: { console: "warn", style: "color:#fbbf24;font-weight:bold", tag: "warn" },
  // NOTA: erros do driver vão como console.warn de propósito — o dev overlay do
  // Next.js intercepta console.error e abre um modal vermelho pra CADA falha de
  // hardware (que é esperada/iterável). O nível err continua vermelho no painel
  // e no F12 (via estilo %c), só não estoura overlay.
  err: { console: "warn", style: "color:#fb7185;font-weight:bold", tag: "FAIL" },
  cmd: { console: "info", style: "color:#38bdf8", tag: ">>TX" },
  rx: { console: "info", style: "color:#c084fc", tag: "<<RX" },
  debug: { console: "debug", style: "color:#52525b", tag: "dbg " },
};

const MAX_ENTRIES = 1200;

class F75Logger {
  private seq = 0;
  private entries: F75LogEntry[] = [];
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Referência estável para useSyncExternalStore. */
  getSnapshot = (): F75LogEntry[] => this.entries;

  log(level: LogLevel, msg: string): void {
    this.seq += 1;
    const now = new Date();
    const time = `${now.toLocaleTimeString("pt-BR", { hour12: false })}.${String(now.getMilliseconds()).padStart(3, "0")}`;
    this.entries = [...this.entries.slice(-(MAX_ENTRIES - 1)), { id: this.seq, time, level, msg }];
    this.mirrorConsole(level, msg, time);
    for (const fn of this.listeners) fn();
  }

  info(msg: string) { this.log("info", msg); }
  ok(msg: string) { this.log("ok", msg); }
  warn(msg: string) { this.log("warn", msg); }
  err(msg: string) { this.log("err", msg); }
  cmd(msg: string) { this.log("cmd", msg); }
  rx(msg: string) { this.log("rx", msg); }
  debug(msg: string) { this.log("debug", msg); }

  private mirrorConsole(level: LogLevel, msg: string, time: string): void {
    const meta = LEVEL_META[level];
    console[meta.console](
      `%c[F75 ${meta.tag}]%c ${time} %c ${msg}`,
      "background:#09090b;color:#34d399;border:1px solid #27272a;border-radius:4px;padding:1px 4px",
      "color:#52525b",
      meta.style
    );
  }

  /** Hexdump completo (16 bytes por linha, com offset e ASCII). */
  dump(bytes: Uint8Array | DataView, label: string, level: LogLevel = "debug"): void {
    const view = bytes instanceof DataView ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes;
    const lines: string[] = [];
    for (let row = 0; row < view.length; row += 16) {
      const slice = view.subarray(row, Math.min(row + 16, view.length));
      const hex = Array.from(slice, (b) => b.toString(16).padStart(2, "0"));
      while (hex.length < 16) hex.push("  ");
      const ascii = Array.from(slice, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "·")).join("");
      lines.push(`0x${row.toString(16).padStart(4, "0")}  ${hex.slice(0, 8).join(" ")}  ${hex.slice(8).join(" ")}  |${ascii}|`);
    }
    const header = `${label} (${view.length} bytes)`;
    this.log(level, `${header}\n${lines.join("\n")}`);
    console.groupCollapsed(`%c[F75 hex]%c ${header}`, "color:#38bdf8;font-weight:bold", "color:#52525b");
    console.log(lines.join("\n"));
    console.groupEnd();
  }

  /** Exporta tudo (com timestamp) — botão "copiar logs" da UI. */
  export(): string {
    return this.entries
      .map((e) => `[${e.time}] ${e.level.toUpperCase().padEnd(5)} ${e.msg}`)
      .join("\n");
  }

  clear(): void {
    this.entries = [];
    this.log("info", "Log limpo.");
  }
}

export const f75log = new F75Logger();
