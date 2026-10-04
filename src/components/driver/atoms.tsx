"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Chip de estado (endpoint, bateria, flag). Com onClick vira botão.
 *  Monocromático (Cal.com/Linear): o estado vive no dot de sinal, não na pílula. */
export function Chip({
  ok,
  children,
  onClick,
  title,
  className,
}: {
  ok?: boolean;
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors",
        ok === false && "text-zinc-500",
        onClick && "hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-zinc-100",
        className
      )}
    >
      {ok !== undefined && (
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            ok ? "bg-cyan-300 shadow-[0_0_6px_rgba(65,232,255,0.75)]" : "bg-zinc-600"
          )}
        />
      )}
      {children}
    </Tag>
  );
}

/** Cabeçalho de seção: ícone + título + descrição + slot à direita.
 *  Ícone neutro (hairline) — cor é sinal, não decoração. */
export function SectionHeader({
  icon: Icon,
  title,
  desc,
  right,
}: {
  icon: LucideIcon;
  title: string;
  desc?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] shadow-[inset_0_1px_0_0_rgb(255_255_255/0.05)]">
          <Icon className="h-4 w-4 text-zinc-300" />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold leading-tight tracking-tight sm:text-base">{title}</h2>
          {desc && <p className="text-xs leading-tight text-zinc-500">{desc}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/** Linha mono compacta com o estado atual do report (resumo legível). */
export function MonoLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code
      className={cn(
        "inline-block max-w-full truncate rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1 font-mono text-[11px] text-zinc-400",
        className
      )}
    >
      {children}
    </code>
  );
}

/** Controle segmentado (botões exclusivos) usado em toda a UI.
 *  Ativo = seleção neutra iluminada (Linear), nunca pílula colorida. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  className,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="group" className={cn("flex flex-wrap gap-1", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          disabled={disabled}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-[32px] rounded-md border px-2.5 py-1 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40",
            o.value === value
              ? "border-white/[0.14] bg-white/[0.09] text-zinc-100 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.07)]"
              : "border-transparent bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Nota inline curta para estado bloqueado — nada de texto longo. */
export function LockedNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
      {children}
    </div>
  );
}

/** Rótulo de campo (label de formulário compacto). */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{children}</p>;
}

/** Bateria: ícone SVG + % com cor por nível. */
export function BatteryGauge({ percent, compact }: { percent: number | null; compact?: boolean }) {
  const color =
    percent === null ? "text-zinc-500" : percent <= 20 ? "text-rose-400" : percent <= 50 ? "text-amber-400" : "text-cyan-300";
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${color}`}>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="2" y="7" width="17" height="10" rx="2" />
        <path d="M22 11v2" strokeLinecap="round" />
        {percent !== null && (
          <rect x="4" y="9" width={Math.max(1.5, (percent / 100) * 13)} height="6" rx="1" fill="currentColor" stroke="none" />
        )}
      </svg>
      {!compact && <span>{percent === null ? "—" : `${percent}%`}</span>}
    </span>
  );
}
