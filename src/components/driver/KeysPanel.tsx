"use client";

import { useEffect, useRef, useState } from "react";
import { Keyboard, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Chip, MonoLine, SectionHeader } from "./atoms";

interface KeyPress {
  id: number;
  code: string;
  key: string;
  mods: string;
  time: string;
}

/** Teste de teclas em tempo real — igual aos drivers de desktop. */
export function KeysPanel({ active }: { active: boolean }) {
  const [presses, setPresses] = useState<KeyPress[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      seq.current += 1;
      const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean).join("+");
      setPresses((prev) =>
        [
          {
            id: seq.current,
            code: e.code,
            key: e.key,
            mods,
            time: new Date().toLocaleTimeString("pt-BR", { hour12: false }),
          },
          ...prev,
        ].slice(0, 40)
      );
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [active]);

  const last = presses[0];

  return (
    <section className="space-y-5" aria-label="Teclas">
      <SectionHeader
        icon={Keyboard}
        title="Teclas"
        desc="Teste em tempo real"
        right={
          presses.length > 0 && (
            <Button onClick={() => setPresses([])} variant="outline" size="sm" className="h-8 gap-1.5 border-zinc-700 bg-transparent text-xs text-zinc-400 hover:bg-zinc-800">
              <Trash2 className="h-3.5 w-3.5" /> Limpar
            </Button>
          )
        }
      />

      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex min-h-[92px] items-center justify-center rounded-xl border border-zinc-800 bg-black/40 p-4">
            {last ? (
              <div className="text-center">
                <p className="font-mono text-2xl font-bold text-emerald-400">{last.key === " " ? "Space" : last.key}</p>
                <MonoLine className="mt-1.5">{`${last.code}${last.mods ? ` · ${last.mods}` : ""} · ${last.time}`}</MonoLine>
              </div>
            ) : (
              <p className="text-xs text-zinc-600">Pressione qualquer tecla…</p>
            )}
          </div>

          {presses.length > 0 && (
            <div className="scrollbar-thin flex max-h-40 flex-wrap gap-1.5 overflow-y-auto" aria-label="Histórico de teclas">
              {presses.map((p) => (
                <Chip key={p.id} title={`${p.code}${p.mods ? ` · ${p.mods}` : ""} · ${p.time}`}>
                  <span className="font-mono">{p.key === " " ? "Space" : p.key}</span>
                  {p.mods && <span className="text-[9px] text-zinc-500">{p.mods}</span>}
                </Chip>
              ))}
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-zinc-600">
            Enquanto esta aba está aberta o navegador segura as teclas. Combinações que o sistema captura antes (ex.: prints do desktop) não chegam aqui.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
