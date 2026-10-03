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

---
Task ID: 3
Agent: Z.ai Code (main)
Task: Validar se a conversão do GIF de Stardew (50fps→15fps) compromete qualidade ou se o usuário precisa refazer.

Work Log:
- Rodei diff pixel a pixel (PIL/numpy) alinhando frames por timestamp: versão 128 cores → diff médio 1,27%, pior frame 2,36%, PSNR ~38 dB
- Gerei variante premium 256 cores (palettegen max_colors=256, bayer_scale=5): diff médio 0,61%, pior 1,91%, 503 KB
- Comparei crops ampliados (área de água/grama): visualmente idênticos ao original
- Insight chave: payload do teclado = frames × 32KB (RGB565 cru), independe do tamanho/paleta do GIF → paleta 256 não custa nada
- Substituí public/stardew-display.gif pela versão 256 cores (78 frames, 15 fps, 503 KB, loop 5,2s)
- Atualizei a seção "Teste real" na página: novos números, comando ffmpeg 256c, nota de validação (diff 0,6%, PSNR 38 dB)
- Lint limpo, browser verificado, sem erros de console

Stage Summary:
- Resposta: NÃO precisa refazer — conversão por descarte de frames mantém frames restantes como cópias exatas
- Arquivo final: /stardew-display.gif (256 cores, 0,6% diff médio vs original)
- Payload final pro teclado: ~2,4 MB → 624 pacotes HID (−70% vs original)

---
Task ID: 4
Agent: Z.ai Code (main)
Task: Corrigir comando de instalação do Swift no guia (pacote swift não existe nos repos oficiais do Arch).

Work Log:
- Usuário colou o comando do passo 1; verifiquei archlinux.org: extra/x86_64/swift retorna 404 e busca por "swift" só acha python-swiftclient (OpenStack, não relacionado)
- Corrigido passo 1: pacman só para git/make/gtk4/hidapi/pkgconf; Swift via AUR (paru -S swift-bin) + swift --version de checagem
- Corrigido também item de troubleshooting "swift não encontrado"
- Nota adicionada: swift-bin baixa ~800 MB do toolchain oficial swift.org; sem AUR helper → makepkg -si manual
- Lint limpo + verificação no browser (passo 1 renderiza corrigido, sem erros de console)

Stage Summary:
- Correção importante: swift NÃO está nos repos oficiais do Arch/CachyOS — caminho certo é AUR swift-bin (ou tarball manual swift.org)
- Guia atualizado na página (passo 1 + troubleshooting)

---
Task ID: 5
Agent: Z.ai Code (main)
Task: Responder dúvidas sobre controle de RGB (só via 2.4G? pela telinha?) e objetivo "LED branco estático"; usuário confirmou upload do GIF com sucesso (78 frames, 625 blocos, slot 1).

Work Log:
- Log do usuário confirmou: todos os 8 endpoints HID wired visíveis (0xff13 e 0xff68 inclusos), upload do stardew-display.gif concluído (625 blocos = cálculo batendo)
- Screenshot do app mostrou: receptor 2.4G "Não conectado" → painel RGB/Desempenho todo desabilitado; Cor fixa já branca; Suspensão em 1 min
- PESQUISA: confirmei atalhos de hardware do F75 (mechanicalkeyboard.net + aulakeyboard.com + aulastar.com): Fn+\ cicla efeito, Fn+Tab cicla cor, Fn+↑/↓ brilho, Fn+←/→ velocidade, Fn+B checa bateria, Fn+Esc 3s factory reset da luz
- Adicionei card "Atalhos de RGB pelo hardware" na aba Config Perfeita com os 6 atalhos em kbd styling + dica do branco estático sem dongle
- Lint limpo, browser verificado (card renderiza com kbd chips, sem erros de console)

Stage Summary:
- Resposta: SIM, RGB pelo driver é exclusivo do receiver 2.4G (usage page 0xFF59); a telinha é display-only (não controla RGB)
- Caminho pro branco estático: (A) pluga dongle → painel destrava → já estava configurado (Estático/branco) → Aplicar perfil RGB; (B) sem dongle: Fn+\ até estático + Fn+Tab até branco
- Bônus sugerido: Suspensão 1 min → 5-10 min; Fn+B funciona sem dongle pra bateria

---
Task ID: 5
Agent: Z.ai Code (main)
Task: Responder dúvida do usuário "mudei pra 2.4G e o teclado não funciona (pareamento?)" e documentar o diagnóstico no guia.

Work Log:
- Re-li README do repo via page_reader: sem procedimento de pareamento no app (pareamento é firmware/hardware); issues do repo não mencionam 2.4 (busca GitHub API retornou 0 resultados antes do rate limit)
- Busquei o manual oficial Epomaker F75/F75 MAX: FN+R segurado = rematch do receiver 2.4G; FN+Q/W/E segurado = parear BT; FN+Esc segurado 3s = reset do teclado; segurar Fn mostra modo de conexão na telinha; modo selecionado por switch físico + tap Fn+R para reconectar
- Adicionei item no topo do accordion TROUBLESHOOTING em src/app/page.tsx: "Mudei pra 2.4G e o teclado parou de funcionar (pareamento)" com checklist de 6 passos (lsusb 05ac:024f → Fn mostra modo → Fn+R 3s → bateria → porta USB 2.0 sem hub/USB3 → Fn+Esc reset)
- bun run lint limpo; dev.log 200 OK sem erros; verificação no Agent Browser: tab Troubleshooting → acordeão expandido → CONTENT-OK (Fn+R por ~3s, 05ac:024f e Fn+Esc presentes no texto), zero erros de página

Stage Summary:
- Resposta-chave ao usuário: re-emparelhar com Fn+R segurado ~3s até o ícone RF piscar; conferir dongle no lsusb (05ac:024f); bateria baixa derruba wireless antes do cabo; evitar USB 3.0/hubs
- Guia atualizado com o cenário mais urgente do usuário no topo do Troubleshooting

---
Task ID: 6
Agent: Z.ai Code (main)
Task: Fazer loop perfeito no GIF do Stardew Valley do usuário e documentar a técnica no guia.

Work Log:
- Analisei upload/stardew_display_256c.gif e upload/stardew.gif (128x128, 260 frames @ 50fps): movimento médio entre frames 2,87, diff último frame vs primeiro 9,7 = pulo visível no loop
- Busca exaustiva de ciclo no original (períodos 6-120 frames, busca de par inicio->fim com pose idêntica): nenhum corte cíclico existe (melhor par f12->f193 diff 5,8) — a gravação nunca volta exatamente à pose inicial
- Identifiquei a cena via contact sheets: pesca no Stardew (idle -> arremesso -> espera com barra de tempo -> fisgada com barra verde de captura -> recolher -> idle)
- Testei 3 abordagens: (A) loop só do trecho pescando com freeze-fade: artefato (barra de captura no tail); (B) cena completa com dissolve @50fps: seam 2,54 pós-conversão; (C) vencedora: seleção 15fps em Python + dissolve dos últimos 10 frames @15fps (0,67s) de volta pro frame 0 + palettegen/paletteuse 256 cores
- Resultado final: 78 frames, 481 KB, 5,2s, seam = 0.000 (último frame pixel-idêntico ao primeiro), movimento médio 2,79 (idêntico ao corpo)
- Salvei upload/stardew_display_loop.gif e public/stardew-display-loop.gif
- Atualizei src/app/page.tsx: nova seção "Loop perfeito" na tab GIFs (3 técnicas: corte cíclico, ping-pong, crossfade) + CodeBlock com script loop_perfeito.py genérico copiável; seção Teste real com 3 cards (Original/Otimizado/Loop perfeito) e preview trocada pro GIF com loop; texto do payload atualizado (625 blocos mantidos)
- bun run lint limpo; verificação no Agent Browser: tab GIFs & Display -> seção loop, técnicas, script, card de comparação e img naturalWidth=128 OK, zero erros de página; screenshot de confirmação

Stage Summary:
- Arquivo entregue: public/stardew-display-loop.gif (loop matematicamente perfeito, seam 0,0 vs 9,7 do original) — usuário só precisa reenviar pro slot 1 no app
- Decisão técnica: crossfade/freeze-fade no final (últimos 12% dos frames dissolvendo pro 1º frame) como técnica universal, documentada com script Python no guia
- Payload do teclado inalterado (78 frames x 32 KB = mesmos 625 blocos de 4 KB)

---
Task ID: 7
Agent: Z.ai Code (main)
Task: Recomendar a cor de LED com melhor contraste para o colorway cinza/branco do teclado do usuário (foto do Ajjaz AK820 enviada como referência) e documentar no guia.

Work Log:
- Extraí a paleta real da foto via k-means (8 clusters): colorway 100% neutro — #DFDEDF (cinza claro), #AFAEB0 (cinza médio), #363636 (legends grafite), case #FEFEFE, zero saturação
- Simulei 12 cores de LED com modelo físico (cap reflete igual em todo espectro; tint = cap × LED): medi ΔE76 glow-vs-caps, chroma C* do cap tingido e ΔE legenda-vs-cap sob o LED
- Resultados: roxo ΔE 85 / vermelho 82 / verde 80 = máximo pop mas tingem os caps (C* 70+); branco frio ΔE 25 = some contra o case branco (C* 2,3); ciano ΔE 46 e teal 44 = sweet spot (glow visível, caps neutros)
- Rodei duas renderizações de comparação (8 LEDs) — a final com modelo realista pra caps sólidos sem shine-through (topo 82% ambiente + 18% LED, halo de borda, glow full nos gaps): public/led-compare.png
- Recomendação final: 🥇 ciano gelo #41E8FF (pop alto, caps neutros, combina com a água do GIF Stardew) · 🥈 ice blue #96D2FF · 🥉 roxo #AF69FF · ❌ branco frio (a escolha anterior do usuário = pior contraste pra esse colorway); dica de brightness 50-70%
- Adicionei seção "Qual cor de RGB pro colorway cinza/branco?" no fim da tab Config Perfeita (imagem comparativa + 4 presets com hex + dica de brilho)
- bun run lint limpo; verificação no Agent Browser: tab Config Perfeita -> seção, 4 presets e imagem (naturalWidth 650) OK, zero erros

Stage Summary:
- Veredito com dados: ciano gelo #41E8FF é a melhor cor possível pro colorway cinza/branco; branco estático (desejo anterior) é o pior pra contraste nessa combinação
- Artefatos: public/led-compare.png + seção nova no guia com presets copiáveis pro Fixed Color do app (via receiver 2.4G)

---
Task ID: 8
Agent: Z.ai Code (main)
Task: Responder "como remover o GIF" e documentar remoção/reset no guia

Work Log:
- Verifiquei o código-fonte do driver (LinuxHIDBackend.swift via jsDelivr): factoryReset = packet 0x04,0x15 [8]=0x08 + 8 páginas zeradas (limpa TODA a memória de display, todos os slots) + reset de keymap/macros + lighting + footer 0xAA55 + reset de display config (0x04,0x17)
- Confirmado: NÃO existe comando de apagar slot individual; não existe download/backup de slots (só upload)
- Adicionado no page.tsx: seção "Removendo o GIF: como 'desinstalar' da telinha" na tab GIFs & Display (3 cards: trocar sobrescrevendo / Factory Reset via cabo / o que o reset apaga) + box de alerta sobre ausência de backup
- Adicionado item no TROUBLESHOOTING: "Quero remover o GIF da telinha (ou voltar ao padrão de fábrica)"
- Ajustei as linhas do RESET_STEPS pra caberem no card estreito (2 iterações de encurtamento validadas por screenshot)

Stage Summary:
- Resposta: remoção real = Factory Reset no app com CABO USB-C (volta pra animação de fábrica); trocar visual = upload no mesmo slot (sobrescreve, sem reset)
- Guia validado no Agent Browser (desktop 1280px + mobile 390px), lint limpo, HTTP 200, sem erros de página

---
Task ID: 9
Agent: Z.ai Code (main)
Task: Explicar tecla Windows branca estática (Win lock indicator) e documentar no guia

Work Log:
- Pesquisa web (r/Epomaker, r/mkindia, tuxforums): tecla Win branca fixa = indicador de Win lock, comportamento conhecido no Aula F75/F75 Max; fix comunidade = Fn+Win, ou Fn+Esc 3–5s
- Confirmado no código do driver (WirelessAulaDevice.swift): setGameMode envia disableWin = gameMode → Game Mode ON trava a tecla Win (LED branco é o indicador)
- Adicionado callout amber na seção de RGB da tab Config Perfeita ("Só a tecla Windows fica branca fixa?")
- Adicionado item no TROUBLESHOOTING com ordem de fix: Fn+Win → Fn+Esc 3–5s → conferir Game Mode OFF

Stage Summary:
- Resposta: comportamento normal (indicador), não defeito; gatilhos = Fn+Win ou Game Mode; fix validado pela comunidade
- Validação: lint limpo, HTTP 200, callout + accordion verificados no Agent Browser, zero erros
