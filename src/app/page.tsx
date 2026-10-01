"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Check, Copy, Terminal, Keyboard, Palette, Wrench, Gamepad2, Battery, Clock, Image as ImageIcon, Sparkles, Download, Usb, ShieldCheck, Zap, MonitorPlay } from "lucide-react";

/* ---------------------------------- data --------------------------------- */

const INSTALL_STEPS: {
  title: string;
  desc: string;
  code: string;
  note?: string;
  icon: React.ReactNode;
}[] = [
  {
    title: "1. Instale as dependências",
    desc: "O app Linux é escrito em Swift 6 + GTK4 e fala com o teclado via hidapi (hidraw). No CachyOS/Arch tudo vem do pacman:",
    code: "sudo pacman -S --needed git make swift gtk4 hidapi pkgconf",
    note: "O pacote `swift` está no repositório extra do Arch/CachyOS. Se o pacman não encontrar, instale via AUR: paru -S swift-bin",
    icon: <Download className="h-5 w-5" />,
  },
  {
    title: "2. Clone o repositório",
    desc: "Baixe o código-fonte do driver:",
    code: "git clone https://github.com/VitalyArt/Aula-F75-Max-Driver.git\ncd Aula-F75-Max-Driver",
    icon: <Terminal className="h-5 w-5" />,
  },
  {
    title: "3. Compile o app Linux (GTK4)",
    desc: "O build usa Swift Package Manager por baixo dos panos. A primeira compilação demora alguns minutos:",
    code: "make linux-build",
    note: "Binário final fica em .build/release/ e o Makefile empacota tudo em build/.",
    icon: <Wrench className="h-5 w-5" />,
  },
  {
    title: "4. Instale as regras udev (acesso sem root)",
    desc: "Sem isso o app não enxerga o teclado nem o receiver em /dev/hidraw*:",
    code: "sudo make linux-install-udev\n# ou, manualmente:\nsudo install -m 0644 packaging/linux/60-aula-f75-max.rules /etc/udev/rules.d/\nsudo udevadm control --reload-rules\nsudo udevadm trigger",
    note: "Depois disso, DESCONECTE e RECONECTE o teclado e o receiver 2.4G. A regra dá MODE 0666 + uaccess pros IDs 0c45:800a e 05ac:024f.",
    icon: <ShieldCheck className="h-5 w-5" />,
  },
  {
    title: "5. Rode o app",
    desc: "Com o teclado no cabo USB-C e/ou o receiver 2.4G plugado:",
    code: "make linux-run",
    note: "Dica: crie um .desktop / alias pra não depender do make toda vez.",
    icon: <Keyboard className="h-5 w-5" />,
  },
];

const DEVICE_ROWS = [
  {
    device: "Teclado (cabo USB-C)",
    usb: "0C45:800A",
    pages: "0xFF13 (comandos) · 0xFF68 (display)",
    needs: "Relógio, upload de imagem/GIF, factory reset",
  },
  {
    device: "Receiver 2.4G",
    usb: "05AC:024F",
    pages: "0xFF59 (comandos) · 0xFF60 (raw)",
    needs: "Bateria, RGB, response level, sleep, Game Mode",
  },
];

const VERIFY_CODE = `# Confere se o sistema enxerga os dispositivos:
lsusb | grep -iE "0c45|05ac"
ls -l /dev/hidraw*

# Checa se a regra udev aplicou (deve mostrar MODE=0666):
udevadm info /dev/hidraw* | grep -E "MODE|ID_INPUT"`;

const CONFIG_CARDS = [
  {
    icon: <Gamepad2 className="h-5 w-5" />,
    title: "Modo Gaming",
    tag: "via receiver 2.4G",
    items: [
      "Response Level: no MÁXIMO (menor latência pro polling)",
      "Game Mode: ON — mata a tecla Win e evita Alt-Tab acidental",
      "RGB: estático ou reativo com brilho baixo — menos distração",
      "Sleep: 15–30 min (você não quer teclado dormindo no meio da ranked)",
    ],
    accent: "text-rose-400",
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: "Setup Aesthetic",
    tag: "via cabo + receiver",
    items: [
      "RGB: onda colorida (colorful animation) lenta e suave",
      "Cor fixa pra combinar com o tema do setup (usar 'fixed color')",
      "Display: GIF pixel art em loop + relógio sincronizado",
      "Fit mode 'Fill' deixa o GIF cobrindo a tela inteira, sem borda",
    ],
    accent: "text-emerald-400",
  },
  {
    icon: <Battery className="h-5 w-5" />,
    title: "Bateria & Sleep",
    tag: "via receiver 2.4G",
    items: [
      "Sleep timeout: 5–10 min é o ponto de equilíbrio",
      "Deixe o app aberto ou no autostart: ele avisa quando a bateria cai abaixo de 20%",
      "Consulta manual de bateria pela janela principal a qualquer momento",
      "RGB é o maior consumidor — abaixar brilho estoura a duração",
    ],
    accent: "text-amber-400",
  },
  {
    icon: <Clock className="h-5 w-5" />,
    title: "Relógio do Display",
    tag: "via cabo USB-C",
    items: [
      "SyncClock joga a hora local do sistema pro teclado",
      "Refaça o sync depois de trocar fuso / horário de verão",
      "Boa prática: sync uma vez por semana ou sempre que plugar o cabo",
    ],
    accent: "text-sky-400",
  },
];

const GIF_SOURCES = [
  { name: "Giphy", url: "https://giphy.com", tip: 'busque: "pixel art loop", "8 bit screensaver", "pixel campfire"' },
  { name: "Tenor", url: "https://tenor.com", tip: 'busque: "pixel cat", "retro game gif", "lofi pixel"' },
  { name: "r/PixelArt", url: "https://reddit.com/r/PixelArt", tip: "arte original, muita coisa em loop perfeito" },
  { name: "Lospec", url: "https://lospec.com/palette-list", tip: "paletas retrô + galeria de pixel art" },
  { name: "OpenGameArt", url: "https://opengameart.org", tip: "sprites e animações de jogos (licença livre)" },
];

const GIF_IDEAS: { category: string; emoji: string; ideas: string[] }[] = [
  {
    category: "Retro Gamer",
    emoji: "👾",
    ideas: [
      "Fantasmas do Pac-Man perseguindo o pontinho",
      "Space Invaders descendo em loop",
      "Boot logo do Game Boy (aquela animação clássica)",
      "Coração pixelado de Zelda batendo",
      "Moeda do Mario girando",
      "CRT com estática de TV antiga",
    ],
  },
  {
    category: "Linux / Arch vibes",
    emoji: "🐧",
    ideas: [
      "Tux pixel art dançando (combina demais com CachyOS)",
      "Barra de progresso 'pacman -Syu' sincronizando em loop",
      "Logo do Arch pulsando em neon",
      "Terminal com neofetch rolando",
      "CachyOS dragon flame loop",
    ],
  },
  {
    category: "Chill / Aesthetic",
    emoji: "🌙",
    ideas: [
      "Fogueira pixel com faíscas subindo",
      "Aquário com peixinhos nadando",
      "Lava lamp derretendo",
      "Café fumegando ao lado de um livro",
      "Chuva caindo na janela à noite",
      "Planeta com anel girando no espaço",
      "Gatinho pixel dormindo e roncando 'zZz'",
    ],
  },
  {
    category: "Tech / Synthwave",
    emoji: "🌴",
    ideas: [
      "Matrix rain em verde (combina com Arch)",
      "Starfield voando (screensaver clássico)",
      "Equalizador de áudio pulando (estilo boombox)",
      "Sol synthwave com grades em perspectiva",
      "VHS glitch com timestamp",
      "Disquete sendo 'lido' com LED piscando",
    ],
  },
  {
    category: "Anime / Pop",
    emoji: "🌸",
    ideas: [
      "Sprite 8-bit do Goku carregando o Kamehameha",
      "Pikachu pixel dando choque",
      "Pétalas de sakura caindo",
      "Jolly Roger do One Piece tremulando",
    ],
  },
];

const GIF_RECIPE = `# Jeito nerdy (terminal) de otimizar seu GIF:
sudo pacman -S gifsicle

# Otimiza: menos bytes, 64 cores, mantém a animação
gifsicle -O3 --colors 64 -i input.gif -o display.gif

# Remove frames extras (menos peso pro upload HID):
gifsicle -O3 -U input.gif "#0-29" -o display.gif  # só os 30 primeiros frames`;

const TROUBLESHOOTING = [
  {
    q: "Teclado conectado mas o app não detecta",
    a: "Abra o painel de diagnóstico de endpoints do app — é a primeira coisa a checar. Depois: use uma porta USB direta (não hub), rode `lsusb | grep -iE '0c45|05ac'` e confirme que as regras udev foram instaladas + você replugou os cabos depois do `udevadm trigger`. No Wayland (padrão do CachyOS) o uaccess funciona com sessão ativa — se estiver logado via SSH/GDM direto, logue na sessão gráfica.",
  },
  {
    q: "Bateria não aparece",
    a: "A leitura de bateria SÓ funciona pelo receiver 2.4G — o cabo sozinho não basta. Plugue o dongle, espere o polling automático ou clique em consulta manual.",
  },
  {
    q: "Upload de imagem/GIF falha",
    a: "Confirme que está no modo cabo USB-C (não 2.4G), que o endpoint de display (usage page 0xFF68) aparece no diagnóstico, que o slot está entre 1 e 255 e teste primeiro uma imagem pequena/estática. GIFs muito longos demoram mais — comece com 10–30 frames.",
  },
  {
    q: "Comandos de RGB / performance falham",
    a: "RGB, response level, sleep e Game Mode vão pelo RECEIVER 2.4G (endpoint 0xFF60). Confirme que o dongle está plugado, reconecte-o e faça rescan no app.",
  },
  {
    q: "Permission denied no hidraw",
    a: "A regra udev não aplicou. Rode: sudo install -m 0644 packaging/linux/60-aula-f75-max.rules /etc/udev/rules.d/ && sudo udevadm control --reload-rules && sudo udevadm trigger — e replugue teclado/receiver. Verifique com `udevadm info /dev/hidraw*`.",
  },
  {
    q: "make linux-build falha: swift não encontrado",
    a: "O projeto exige toolchain Swift 6. No CachyOS: sudo pacman -S swift. Se não estiver nos mirrors: paru -S swift-bin (AUR). Confirme com `swift --version` antes de compilar.",
  },
];

const CHECKLIST = [
  "Dependências instaladas (swift, gtk4, hidapi, pkgconf)",
  "make linux-build concluído sem erro",
  "Regras udev instaladas + replug dos dispositivos",
  "Teclado detectado no app (modo cabo)",
  "Receiver 2.4G detectado no app",
  "Relógio do display sincronizado",
  "GIF enviado pro display (slot 1–255)",
  "RGB configurado (modo, brilho, velocidade)",
  "Response Level no máximo + Game Mode",
  "Notificação de bateria (<20%) validada",
];

/* -------------------------------- components ------------------------------ */

function CodeBlock({ code }: { code: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast({ title: "Copiado! 📋", description: "Cole no terminal com Ctrl+Shift+V" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Erro ao copiar", description: "Selecione e copie manualmente" });
    }
  };

  return (
    <div className="group relative rounded-lg border border-zinc-700/80 bg-zinc-950">
      <Button
        size="sm"
        variant="ghost"
        onClick={copy}
        aria-label="Copiar comando"
        className="absolute right-2 top-2 h-8 w-8 p-0 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-400"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
      </Button>
      <pre className="overflow-x-auto p-4 pr-12 text-[13px] leading-relaxed text-zinc-200 scrollbar-thin">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-400 text-[11px] font-normal">
      {children}
    </Badge>
  );
}

/* ----------------------------------- page --------------------------------- */

export default function Home() {
  const [checked, setChecked] = useState<boolean[]>(() => CHECKLIST.map(() => false));
  const done = checked.filter(Boolean).length;
  const pct = Math.round((done / CHECKLIST.length) * 100);

  const toggle = (i: number) =>
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 selection:bg-emerald-500/30">
      {/* ------------------------------- HERO ------------------------------- */}
      <header className="relative overflow-hidden border-b border-zinc-800">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(600px 200px at 20% 0%, rgba(52,211,153,.35), transparent), radial-gradient(600px 220px at 80% 10%, rgba(244,114,182,.25), transparent), radial-gradient(500px 200px at 50% 100%, rgba(250,204,21,.18), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-20">
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25">
              Linux nativo · GTK4 · hidapi
            </Badge>
            <Badge className="bg-pink-500/15 text-pink-400 border border-pink-500/30 hover:bg-pink-500/25">
              Display 128×128 RGB565
            </Badge>
            <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25">
              2.4G + USB-C
            </Badge>
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]">
            Aula F75 Max{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg,#34d399,#facc15,#f472b6,#a78bfa,#38bdf8,#34d399)",
                backgroundSize: "200% 100%",
                animation: "rgbshift 6s linear infinite",
              }}
            >
              no CachyOS
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-zinc-400 text-base sm:text-lg leading-relaxed">
            Guia definitivo pra instalar o{" "}
            <a
              href="https://github.com/VitalyArt/Aula-F75-Max-Driver"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 underline decoration-emerald-500/40 underline-offset-4 hover:decoration-emerald-400"
            >
              driver nativo
            </a>{" "}
            no seu Arch-based, deixar a config impecável e lotar o display de GIFs
            perfeitos. Comandos copiáveis, dicas de RGB, bateria e troubleshooting.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold">
              <a href="#instalacao"><Download className="mr-2 h-4 w-4" /> Começar instalação</a>
            </Button>
            <Button asChild variant="outline" className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800 hover:text-emerald-400">
              <a href="#gifs"><ImageIcon className="mr-2 h-4 w-4" /> Ver ideias de GIFs</a>
            </Button>
          </div>
        </div>
      </header>

      {/* checklist progress */}
      <div className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 sm:px-6 py-2.5">
          <span className="hidden sm:block text-xs text-zinc-400 shrink-0">
            Seu progresso: <strong className="text-emerald-400">{done}/{CHECKLIST.length}</strong>
          </span>
          <Progress value={pct} className="h-2 flex-1 bg-zinc-800 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-amber-400" />
          <span className="text-xs font-mono text-emerald-400 shrink-0">{pct}%</span>
        </div>
      </div>

      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-10 sm:py-14">
        <Tabs defaultValue="instalacao" className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1.5 sm:inline-flex sm:w-auto">
            <TabsTrigger value="instalacao" className="gap-1.5 data-[state=active]:bg-zinc-950 data-[state=active]:text-emerald-400">
              <Terminal className="h-4 w-4" /> Instalação
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-1.5 data-[state=active]:bg-zinc-950 data-[state=active]:text-emerald-400">
              <Zap className="h-4 w-4" /> Config Perfeita
            </TabsTrigger>
            <TabsTrigger value="gifs" className="gap-1.5 data-[state=active]:bg-zinc-950 data-[state=active]:text-emerald-400">
              <ImageIcon className="h-4 w-4" /> GIFs & Display
            </TabsTrigger>
            <TabsTrigger value="troubleshooting" className="gap-1.5 data-[state=active]:bg-zinc-950 data-[state=active]:text-emerald-400">
              <Wrench className="h-4 w-4" /> Troubleshooting
            </TabsTrigger>
          </TabsList>

          {/* ============================ INSTALAÇÃO ============================ */}
          <TabsContent value="instalacao" className="mt-8 space-y-8">
            <section aria-label="Passos de instalação" className="space-y-6">
              {INSTALL_STEPS.map((step) => (
                <Card key={step.title} className="border-zinc-800 bg-zinc-900/60 gap-3">
                  <CardHeader className="pb-0">
                    <CardTitle className="flex items-center gap-3 text-lg text-zinc-100">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 ${step.icon && "font-mono"}`}>
                        {step.icon}
                      </span>
                      {step.title}
                    </CardTitle>
                    <p className="text-sm text-zinc-400 leading-relaxed">{step.desc}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <CodeBlock code={step.code} />
                    {step.note && (
                      <p className="text-xs text-zinc-500 leading-relaxed border-l-2 border-amber-500/40 pl-3">
                        💡 {step.note}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </section>

            {/* device ids */}
            <section aria-label="Identificação dos dispositivos" className="space-y-4">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Usb className="h-5 w-5 text-emerald-400" /> IDs dos dispositivos
              </h2>
              <p className="text-sm text-zinc-400">
                Importante saber o que cada conexão controla — metade das funções
                vai pelo cabo, metade pelo receiver:
              </p>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-900 text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Dispositivo</th>
                      <th className="px-4 py-3 font-medium">USB ID</th>
                      <th className="px-4 py-3 font-medium">Usage pages</th>
                      <th className="px-4 py-3 font-medium">Controla</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {DEVICE_ROWS.map((r) => (
                      <tr key={r.usb} className="bg-zinc-950/50">
                        <td className="px-4 py-3 font-medium text-zinc-200">{r.device}</td>
                        <td className="px-4 py-3 font-mono text-emerald-400">{r.usb}</td>
                        <td className="px-4 py-3 font-mono text-xs text-zinc-400">{r.pages}</td>
                        <td className="px-4 py-3 text-zinc-300">{r.needs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <CodeBlock code={VERIFY_CODE} />
            </section>
          </TabsContent>

          {/* =========================== CONFIG PERFEITA ========================== */}
          <TabsContent value="config" className="mt-8 space-y-8">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <p className="text-sm leading-relaxed text-emerald-100/90">
                <strong className="text-emerald-400">Regra de ouro:</strong> tudo que
                é RGB, latência, sleep e bateria vai pelo <strong>receiver 2.4G</strong>.
                Relógio, upload de GIF e factory reset exigem o <strong>cabo USB-C</strong>.
                Deixe os dois conectados na primeira configuração.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {CONFIG_CARDS.map((c) => (
                <Card key={c.title} className="border-zinc-800 bg-zinc-900/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between gap-2 text-lg">
                      <span className="flex items-center gap-2.5">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950 ${c.accent}`}>
                          {c.icon}
                        </span>
                        {c.title}
                      </span>
                    </CardTitle>
                    <SectionBadge>{c.tag}</SectionBadge>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2.5">
                      {c.items.map((item) => (
                        <li key={item} className="flex gap-2.5 text-sm text-zinc-300 leading-relaxed">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2.5 text-lg">
                  <MonitorPlay className="h-5 w-5 text-pink-400" /> Autostart no CachyOS (KDE)
                </CardTitle>
                <SectionBadge>bateria sempre monitorada</SectionBadge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Pro aviso de bateria baixa funcionar de verdade, deixe o app
                  iniciando junto com a sessão:
                </p>
                <CodeBlock code={`mkdir -p ~/.config/autostart
cat > ~/.config/autostart/aula-f75-max.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=Aula F75 Max Driver
Exec=caminho/para/o/binario-do-app
X-KDE-autostart-after=panel
EOF

# Descubra o caminho do binário compilado:
ls .build/release/`} />
                <p className="text-xs text-zinc-500">
                  Também dá pra usar: Configurações do Sistema → Autostart → Adicionar programa.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================== GIFS =============================== */}
          <TabsContent value="gifs" className="mt-8 space-y-10">
            {/* spec */}
            <section className="grid gap-4 sm:grid-cols-3">
              {[
                { k: "128 × 128", v: "Resolução do display", d: "quadrado — GIFs verticais/horizontais pedem crop" },
                { k: "RGB565", v: "65 mil cores", d: "evite gradientes suaves; dithering disfarça o banding" },
                { k: "Slots 1–255", v: "Espaços na memória", d: "vários GIFs salvos, troca pelo app" },
              ].map((s) => (
                <Card key={s.k} className="border-zinc-800 bg-zinc-900/60 text-center">
                  <CardContent className="pt-6 space-y-1.5">
                    <p className="font-mono text-2xl font-bold text-emerald-400">{s.k}</p>
                    <p className="text-sm font-medium text-zinc-200">{s.v}</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">{s.d}</p>
                  </CardContent>
                </Card>
              ))}
            </section>

            {/* receita */}
            <section className="space-y-4">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Palette className="h-5 w-5 text-amber-400" /> Receita do GIF perfeito
              </h2>
              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="border-zinc-800 bg-zinc-900/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Modo fácil — ezgif.com</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ol className="space-y-2.5 text-sm text-zinc-300 leading-relaxed">
                      {[
                        "Ache o GIF (fontes abaixo) — priorize pixel art em loop",
                        "ezgif.com/crop → recorte quadrado 1:1 na parte principal",
                        "ezgif.com/resize → 128×128 (use 'nearest neighbor' pra pixel art não borrar)",
                        "ezgif.com/optimize → reduza frames/cores, alvo: ~30 frames ou menos",
                        "No app: escolha slot 1–255, fit mode Fill (sem bordas) e envie",
                      ].map((t, i) => (
                        <li key={t} className="flex gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 font-mono text-xs text-emerald-400">
                            {i + 1}
                          </span>
                          {t}
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
                <Card className="border-zinc-800 bg-zinc-900/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Modo nerd — gifsicle</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <CodeBlock code={GIF_RECIPE} />
                    <p className="text-xs text-zinc-500">
                      Pra CRIAR do zero: Aseprite (pago), Libresprite (grátis) ou Piskel (web).
                      Exporte já em 128×128.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* teste real - stardew */}
            <section className="space-y-4">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Gamepad2 className="h-5 w-5 text-amber-400" /> Teste real: GIF de Stardew Valley otimizado
              </h2>
              <Card className="border-zinc-800 bg-zinc-900/60">
                <CardContent className="p-6">
                  <div className="flex flex-col items-start gap-6 sm:flex-row">
                    <div className="flex shrink-0 flex-col items-center gap-2">
                      <div
                        className="rounded-xl border-2 border-zinc-700 bg-zinc-950 p-1 shadow-[0_0_24px_rgba(52,211,153,0.15)]"
                        aria-hidden
                      >
                        <img
                          src="/stardew-display.gif"
                          alt="GIF de Stardew Valley otimizado para o display de 128x128 do teclado"
                          width={128}
                          height={128}
                          className="rounded-lg"
                          style={{ imageRendering: "pixelated" }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-zinc-500">prévia 128×128</span>
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <p className="text-sm leading-relaxed text-zinc-300">
                        Um GIF de <strong className="text-zinc-100">Stardew Valley</strong> foi
                        submetido ao teste: 128×128, 260 frames @ 50 fps, ~1 MB. Rodamos a
                        receita otimizada e o resultado manteve o visual idêntico com{" "}
                        <strong className="text-emerald-400">3,3× menos dados</strong> pro
                        upload HID:
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs">
                          <p className="mb-1 font-semibold text-rose-400">Original ❌</p>
                          <p className="text-zinc-400">260 frames · 50 fps · 1,0 MB</p>
                          <p className="text-zinc-500">payload RGB565: ~8,1 MB → 2.080 pacotes HID</p>
                        </div>
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
                          <p className="mb-1 font-semibold text-emerald-400">Otimizado ✅</p>
                          <p className="text-zinc-400">78 frames · 15 fps · 370 KB</p>
                          <p className="text-zinc-500">payload RGB565: ~2,4 MB → 624 pacotes HID</p>
                        </div>
                      </div>
                      <CodeBlock
                        code={`ffmpeg -i stardew.gif -vf "fps=15,scale=128:128:flags=neighbor,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" -loop 0 stardew_display.gif`}
                      />
                      <p className="text-xs leading-relaxed text-zinc-500">
                        Mesma duração de loop (5,2s), pixel art intacta (dithering bayer
                        combina com sprites), e o display tocará igual — painéis TFT dessa
                        classe raramente passam de 20–30 fps reais, então 50 fps é peso
                        morto. <strong className="text-zinc-400">15 fps é o sweet spot.</strong>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* fontes */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold">Onde achar GIFs bons</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {GIF_SOURCES.map((s) => (
                  <a
                    key={s.name}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-emerald-500/40 hover:bg-zinc-900"
                  >
                    <p className="font-semibold text-zinc-100 group-hover:text-emerald-400">{s.name} ↗</p>
                    <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{s.tip}</p>
                  </a>
                ))}
              </div>
            </section>

            {/* ideias */}
            <section className="space-y-4">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Sparkles className="h-5 w-5 text-pink-400" /> 28 ideias de GIFs pro seu display
              </h2>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {GIF_IDEAS.map((cat) => (
                  <Card key={cat.category} className="border-zinc-800 bg-zinc-900/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        <span className="mr-2">{cat.emoji}</span>
                        {cat.category}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {cat.ideas.map((idea) => (
                          <li key={idea} className="flex gap-2 text-sm text-zinc-300 leading-relaxed">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-emerald-400 to-pink-400" />
                            {idea}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-5 text-sm text-pink-100/90 leading-relaxed">
                <strong className="text-pink-400">Pro tip:</strong> no display pequeno,
                GIFs com <strong>poucos elementos e alto contraste</strong> ficam muito
                melhores que cenas cheias. Detalhe fino se perde em 128px — prefira
                silhuetas grossas e cores chapadas.
              </div>
            </section>
          </TabsContent>

          {/* ========================== TROUBLESHOOTING ========================== */}
          <TabsContent value="troubleshooting" className="mt-8 space-y-6">
            <Accordion type="single" collapsible className="space-y-3">
              {TROUBLESHOOTING.map((t, i) => (
                <AccordionItem
                  key={t.q}
                  value={`item-${i}`}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 last:border-b"
                >
                  <AccordionTrigger className="text-left text-[15px] font-medium text-zinc-100 hover:text-emerald-400 hover:no-underline">
                    {t.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-zinc-400 leading-relaxed">
                    {t.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <Card className="border-zinc-800 bg-zinc-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Fluxo de validação recomendado</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-sm text-zinc-300 leading-relaxed">
                  {[
                    "Plugue teclado no cabo → confira endpoints no painel de diagnóstico",
                    "Plugue o receiver 2.4G → confira endpoints de novo",
                    "Consulte a bateria manualmente",
                    "Aplique um perfil RGB inofensivo (ex: static color)",
                    "Sincronize o relógio do display",
                    "Envie uma imagem pequena de teste num slot alto (ex: 200)",
                    "Mude o idioma do app (tem PT incluído 🇧🇷) e confirme que salva",
                  ].map((t, i) => (
                    <li key={t} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 font-mono text-xs text-zinc-400">
                        {i + 1}
                      </span>
                      {t}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ============================ CHECKLIST ============================ */}
        <section aria-label="Checklist final" className="mt-16">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl flex items-center justify-between flex-wrap gap-2">
                <span>✅ Checklist da config perfeita</span>
                <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {done}/{CHECKLIST.length} concluídos
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 sm:grid-cols-2">
                {CHECKLIST.map((item, i) => (
                  <li key={item}>
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      aria-pressed={checked[i]}
                      className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all min-h-[44px] ${
                        checked[i]
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                          : "border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          checked[i] ? "border-emerald-400 bg-emerald-500 text-zinc-950" : "border-zinc-600"
                        }`}
                        aria-hidden
                      >
                        {checked[i] && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className={checked[i] ? "line-through opacity-70" : ""}>{item}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {pct === 100 && (
                <p className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-sm font-medium text-emerald-300">
                  🎉 Setup completo! Seu Aula F75 Max agora é uma extensão do CachyOS.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      {/* ------------------------------ FOOTER ------------------------------ */}
      <footer className="mt-auto border-t border-zinc-800 bg-zinc-950 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-zinc-500 sm:flex-row sm:px-6">
          <p>
            Guia não-oficial baseado no{" "}
            <a
              href="https://github.com/VitalyArt/Aula-F75-Max-Driver"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400/90 hover:underline"
            >
              VitalyArt/Aula-F75-Max-Driver
            </a>{" "}
            · teclado Epomaker x Aula F75 Max
          </p>
          <p className="font-mono">feito pra quem usa pacman 🐧</p>
        </div>
      </footer>

    </div>
  );
}
