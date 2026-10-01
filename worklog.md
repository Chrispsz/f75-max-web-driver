# Worklog

---
Task ID: 1
Agent: Z.ai Code (main)
Task: Criar guia interativo definitivo para instalar/configurar o Aula F75 Max Driver (github.com/VitalyArt/Aula-F75-Max-Driver) no CachyOS/Arch Linux, com config perfeita e ideias de GIFs para o display.

Work Log:
- Li o README do repo via raw.githubusercontent.com (features, requisitos, endpoints HID, fluxo cabo vs 2.4G)
- Baixei packaging/linux/60-aula-f75-max.rules (IDs 0c45:800a e 05ac:024f, MODE 0666 + uaccess)
- Baixei Makefile + make/linux.mk + scripts/linux-check-deps.sh (deps: swift 6, gtk4, hidapi-hidraw, pkgconf)
- Verifiquei que não há release binário no GitHub nem pacote AUR acessível (Anubis bloqueou RPC) → build from source é o caminho
- Construí página-guia única em src/app/page.tsx (client component) com 4 tabs: Instalação (5 passos copiáveis + tabela de IDs USB + verificação), Config Perfeita (4 cards: Gaming/Aesthetic/Bateria/Relógio + autostart KDE), GIFs & Display (specs 128×128 RGB565, receita ezgif/gifsicle, 5 fontes, 28 ideias em 5 categorias), Troubleshooting (accordion 6 problemas + fluxo de validação)
- Componentes: CodeBlock com clipboard + toast, checklist interativo de 10 itens com progress bar sticky no topo
- Atualizei layout.tsx: lang pt-BR, className dark, metadata nova
- Adicionei keyframe rgbshift + scrollbar custom no globals.css (removido styled-jsx inline)
- Rodei bun run lint (limpo), verifiquei dev.log (200 OK, sem erros)
- Auto-verificação com Agent Browser: hero, 4 tabs, copy+toast, checklist (3/10 → 30%), accordion, viewport mobile 390px, footer sticky no desktop e mobile, zero erros de console

Stage Summary:
- Artefatos: src/app/page.tsx (guia completo), src/app/layout.tsx (dark/pt-BR), src/app/globals.css (estilos extras)
- Decisões: build from source como caminho oficial no CachyOS (não há AUR/release); tema dark zinc + acento esmeralda com gradiente RGB animado no título (tema do teclado); conteúdo em PT-BR
- Dados técnicos críticos preservados na página: IDs 0C45:800A / 05AC:024F, usage pages 0xFF13/0xFF68/0xFF59/0xFF60, regra udev, divisão cabo (clock/GIF/reset) vs 2.4G (RGB/bateria/latência/Game Mode)

---
Task ID: 2
Agent: Z.ai Code (main)
Task: Analisar GIF do usuário (stardew.gif) para o display do Aula F75 Max, responder sobre Hz/fps e entregar versão otimizada.

Work Log:
- Analisei upload/stardew.gif com PIL: 128×128, 260 frames, 50 fps (20ms), ~1 MB, 244 cores — Stardew Valley pixel art
- Pesquisei spec oficial de refresh do display F75 Max: não documentada (TFT 1.14" da classe SPI, ~20–30 fps reais)
- Otimizei com ffmpeg 7.1.5: fps=15, scale neighbor, palettegen 128 cores, dither bayer → 78 frames, 15 fps, 370 KB, mesmo loop de 5,2s
- Payload RGB565 caiu de ~8,1 MB (2.080 pacotes HID 4KB) para ~2,4 MB (624 pacotes) — 3,3× menos dados
- Publiquei public/stardew-display.gif e adicionei seção "Teste real: GIF de Stardew Valley otimizado" na aba GIFs & Display com prévia animada + comparativo + comando ffmpeg
- Lint limpo, browser verificado (seção renderiza, GIF anima, sem erros de console)

Stage Summary:
- Resposta: GIF serve (128×128 correto), mas 50 fps é desperdício — sweet spot 15 fps; Hz da telinha não tem spec oficial
- Artefatos: public/stardew-display.gif (370 KB, pronto pra upload no slot do teclado), nova seção demo na página
