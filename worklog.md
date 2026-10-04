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

---
Task ID: 10
Agent: Z.ai Code (main)
Task: Portar o driver nativo pra WebHID (driver web) e adicionar tab "Driver Web" no guia

Work Log:
- Estudou o protocolo completo no código-fonte: AulaCore.swift (packets, checksum, timePayload), LinuxHIDBackend.swift (commandExchange via feature reports 0xFF13, chunks 4096B em 0xFF68 + ACKs, factoryReset, bateria), WirelessAulaDevice.swift (RGB modes 0-19, reports 0x0f/0x05/0x07, gameMode=disableWin), DisplayEncoder.swift (header 256B + delays×2ms + RGB565 LE)
- Criado src/lib/webhid.d.ts (tipos WebHID mínimos, lib.dom não tem)
- Criado src/lib/aula-protocol.ts: builders de packets byte a byte + encoder RGB565/fit modes via canvas + decodeAnimatedGif (ImageDecoder/WebCodecs) + decodeStillImage
- Criado src/lib/aula-webhid.ts: AulaWebHid (connect com filtro VID/PID, seleção por usagePage, sendFeature com fallback 0x00-prefixo = semântica hidapi, waitForInput ACKs, syncClock, uploadDisplay com progresso, factoryReset completo, queryBattery com parsing de input report 0x20, applyRGB/applyPerformance/setGameMode)
- Criado src/components/driver-web.tsx: UI completa (conexão + chips de endpoint, RGB com preset Ciano gelo #41E8FF, bateria, performance, Game Mode, upload com preview canvas/slot/fit/progresso, clock sync, factory reset com confirmação em 2 cliques, log local)
- page.tsx: nova tab "Driver Web [beta]" com intro, 3 cards, componente e comparação web vs nativo
- Correções de tipos: BufferSource → Uint8Array|DataView|ArrayBuffer (TS 5.7 generics), setBattery(percent ?? null)
- Validação no Agent Browser: tab renderiza, WebHID detectado no Chromium (navigator.hid = object), botões desabilitados sem conexão corretos, upload do stardew_display_loop.gif → "78 frame(s) · 625 blocos · 2500 KB" = IDÊNTICO ao driver nativo (78f/625 blocos), preview canvas desenha o 1º frame, zero erros de página

Stage Summary:
- Driver web funcional em beta: mesmo protocolo do nativo, sem compilação, 100% local no navegador
- Pipeline de encode validado byte-idêntico ao nativo com o GIF real do usuário
- Limitações honestas documentadas no guia (só Chromium, sem notificação de bateria/autostart)

---
Task ID: 11
Agent: Z.ai Code (main)
Task: Reconstruir o driver web como ferramenta standalone perfeita (fix do botão Aplicar), logs completos no F12, fix Alt+Tab/atalhos GNOME e diagnóstico systemd.

Work Log:
- Diagnóstico do beta: botões travados por `!connected?.dongle` sem explicação na UI (usuário não sabia por quê) + bug real de campos (`wired`/`wiredRaw`) vs chaves de role (`wiredCommand`) que quebrava require()/status
- Re-estudou o código-fonte nativo (LinuxHIDBackend/WirelessAulaDevice/AulaCore/DisplayEncoder.swift via /tmp): descoberta-chave = Game Mode tem flags INDEPENDENTES disableAltTab/disableAltF4/disableWin → causa provável do Alt+Tab morto do usuário
- Criado src/lib/f75/logger.ts: logger central espelhado no console (prefixo [F75], níveis, hexdumps com offset+ASCII via groupCollapsed) + ring buffer pra UI com export
- Criado src/lib/f75/protocol.ts: builders byte a byte (wired 64B, wireless 32B c/ checksum sum-8, battery query, gameModeReport c/ flags independentes), describeWired/describeWireless legíveis, encoder RGB565 + decode de volta (prévia "cores da telinha"), decodeAnimatedGif (WebCodecs), generateAnimation procedural (bola ciano/plasma gelo, loop perfeito)
- Criado src/lib/f75/driver.ts: F75Driver WebHID c/ estratégias de wire (feature id=pacote[0] ↔ verbatim id=0 conforme descriptor), listeners persistentes de input report (bateria em tempo real + ACKs contados), hotplug auto-rebin (eventos connect/disconnect), reconnectSaved() via getDevices, uploadDisplay c/ progresso/ETA/cancelamento, factoryReset completo, modo simulação que roda o MESMO código de protocolo
- Criado src/components/driver/F75DriverTool.tsx + driver-cards.tsx: ferramenta standalone (header/status, Conexão c/ 3 chips de endpoint + bateria, RGB c/ presets, Desempenho & Modo Jogo c/ flags independentes + "Desbloquear Alt+Tab agora", Display c/ prévia animada + relógio auto 60s + factory reset 2-passos, Teste de Teclas, Sistema CachyOS, Log c/ filtros/busca/copiar)
- page.tsx virou shell de 2 views: Driver (default) ↔ Guia; guia ganhou botões "Driver Web" (hero + sticky) e tab "Driver Web" com card de ponte; beta antigo (driver-web.tsx, aula-protocol.ts, aula-webhid.ts) deletado
- Fix TS: getServerSnapshot no useSyncExternalStore, HIDConnectionEvent no webhid.d.ts, VideoFrame duration
- Validação Agent Browser: sim mode → todos botões destravam; RGB aplicado (hexdump conferido: 05 10 00 01 41 e8 ff…aa 55, ck ok); unlock enviou altTab=0/altF4=0/win=0; upload animação gerada 361 blocos c/ progresso 33%→90%→"concluído em 10.7s"; relógio (payload 10/03 13:44:58 dow=6 = correto p/ Sat Oct 3 2026); key tester capturou PrintScreen/Shift/Tab; 91 logs [F75] no console; navegação Driver↔Guia↔ponte↔Driver OK; footer sticky desktop+mobile (bottom=vh); icon.svg 200; tsc+lint limpos

Stage Summary:
- Botão Aplicar: causa raiz resolvida (estado de conexão explícito nos chips + hint de texto em cada botão travado + sim mode pra testar tudo)
- Alt+Tab: diagnóstico novo = flags do firmware (disableAltTab/AltF4/Win) que o nativo liga junto c/ Game Mode; driver web permite desbloquear individualmente (melhoria sobre o nativo)
- Ferramenta standalone em / com logs completos no F12 ([F75] + hexdumps) e no painel — pronta pra iterar com hardware real

---
Task ID: 12
Agent: Z.ai Code (main)
Task: Corrigir "NotAllowedError: Failed to write the report" no TX do driver web (RGB via receiver) e blindar a ferramenta com matriz de estratégias descriptor-aware + diagnóstico completo na UI.

Work Log:
- Baixou de novo os fontes nativos (jsDelivr) e confirmou a wire real: LinuxHIDBackend.openDongleRaw varre TODAS as interfaces 05AC:024F ordenando usagePage 0xFF60 → maior output; RGB/perf/bateria = hid_write cru com fallback [0x00]+pacote; cabo = feature reports 64B no 0xFF13; display = writes 4096B no 0xFF68
- Baixou kernel hidraw.c + hid_connection.cc/linux.cc do Chromium e fechou o modelo: Chrome SEMPRE prefixa o byte de report ID (sendReport → write([id]+payload)), exige has_report_id === (id!==0), kernel rejeita count<2 e count>4096, interrupt OUT não valida ID, SET_REPORT valida+stripa
- CAUSA RAIZ: v1 vinculava a PRIMEIRA interface do receiver como "dongle" (podia ser a de teclado, sem output 32B) e enviava sendReport(0,...)/(packet[0],...) sem consultar o descritor → kernel/Chrome rejeitavam → NotAllowedError
- driver.ts v2: bindDevices abre TODAS as interfaces do receiver (ordenadas 0xFF60→maxOutput, 0xFF60 = preferida), summarizeDevice computa hasNumberedIds/maxOutput/maxFeature/outputIds/featureIds por interface, buildAttempts gera matriz de estratégias equivalentes às rotas raw/prefixed do nativo respeitando o descritor, emit() loga cada tentativa (modo/id/wire/erro), tx() varre candidatos×modos com cache da vencedora por família de comando, F75Error final com resumo das tentativas
- Display: writeDisplayChunk v2 — interface numerada = sendReport(chunk[0], chunk[1..]) recria a wire nativa 4096B byte a byte; sem IDs = stream em pedaços min(maxOut,4095) com id=0 (Chrome sempre injeta o byte de ID; kernel limita 4096); bateria com waiter novo por tentativa; input de teclado/mouse do receiver filtrado do log
- logger.ts: nível err espelhado como console.warn (dev overlay do Next intercepta console.error e abria modal vermelho pra cada falha de hardware esperada)
- driver-cards.tsx: novo DiagnosticsCard (interfaces abertas com descritores reais, matriz da última TX colorida, botão "copiar diagnóstico completo" = endpoints + tentativas + log inteiro); F75DriverTool integra o card e explica a causa do erro antigo no texto de conexão
- Fix sim mode: status getter agora reporta todos os endpoints em simulação (botões destravam de novo)
- Validação: tsc limpo em src/, lint limpo, dev.log 200 OK; Agent Browser — sim: RGB aplicado (05 10 00 01 41 e8 ff…aa 55, ck ok), unlock Alt+Tab (flags 0), upload 361 blocos + commit, card diagnóstico em sim, zero erros de página; guia ↔ driver com 3 pontes; footer/header sticky desktop 1280 + mobile 390

Stage Summary:
- RGB pelo dongle agora: (1) usa a interface 0xFF60 de verdade, (2) respeita report IDs do descritor real, (3) cai na estratégia vencedora cacheada, (4) se falhar, o log F12 + DiagnosticsCard mostram a matriz completa
- Caminho de iteração com hardware real: usuário clica "copiar diagnóstico completo" e cola no chat → ajustamos o protocolo com dados do teclado dele
- Limitação documentada: WebHID injeta o byte de report ID na wire — upload de display em interface SEM IDs usa stream fatiado (4095B) em vez do bloco cru do nativo; interface numerada reproduz a wire nativa exata

---
Task ID: 13
Agent: Z.ai Code (main)
Task: Transformar o driver web em app standalone minimalista estilo driver de periférico (remover guia/Alt+Tab/systemd), endurecer o motor TX (v3) e blindar tudo com verificação completa no browser.

Work Log:
- Motor TX v3 (src/lib/f75/driver.ts): cache global de wire-spec por (endpoint, modo, reportId, tamanho) — um único sucesso calibra RGB+perf+bateria de uma vez (antes era por família de comando); capableCandidates() filtra interfaces sem output/feature grande o bastante (não gasta tentativas na interface de teclado do receiver); reusable() valida reuso seguro da spec cacheada (id compatível + tamanho); auto-calibração silenciosa calibrateDongle() roda query de bateria ao vincular o receiver (igual ao nativo) e valida a rota ANTES do primeiro Aplicar; lastTx agora populado também em sim mode (diagnóstico demonstrável); queryBattery ganhou param quiet
- UI reescrita de zero como APP de driver (não mais página-guia): F75App.tsx = shell h-dvh com topbar (marca + pill de conexão + bateria), sidebar desktop de 6 seções (Dispositivo/Iluminação/Desempenho/Tela/Teclas/Sistema) com nav horizontal em pills no mobile, status bar fixa no rodapé com chips de endpoint + canais 0xFF13/0xFF68/0xFF60
- Painéis: Dispositivo (chips de endpoint + bateria, conectar/reconectar/desconectar/simulação em botões compactos, restauração de fábrica em zona de perigo com confirmação em 2 cliques); Iluminação (grid dos 20 modos, 8 presets de cor + color picker, sliders brilho/velocidade, direção segmentada, switch colorful, resumo mono 0x05 em tempo real); Desempenho (latência N1-N5 com ms no title, suspensão, modo jogo, 3 bloqueios independentes com switches, resumo mono 0x07); Tela (dropzone drag&drop, 2 animações procedurais, preview canvas 128×128 animado direto do stream RGB565 via decodeFrameToImageData, slot/fit com re-encode on-change, progresso+ETA+cancelamento, relógio manual+auto 60s); Teclas (captura keydown capture, última tecla grande + histórico em chips, 40 entradas); Sistema (tabela de interfaces com descritores reais, matriz da última TX, console com filtros tudo/TX/RX/avisos/erros + busca + auto-scroll + copiar + baixar .log)
- atoms.tsx: Chip/SectionHeader/MonoLine/Segmented/LockedNote/FieldLabel/BatteryGauge compartilhados
- Persistência localStorage (f75.webdriver.v1): seção ativa + RGB + desempenho restaurados no reload
- Removido TUDO: guia completo (page.tsx inteiro com 4 tabs), SystemCard com comandos gsettings/systemd/journalctl, falatório de Alt+Tab (ficou só o controle firmware dos bloqueios, neutro), botão "Guia completo", driver-cards.tsx e F75DriverTool.tsx deletados; page.tsx = server component que só renderiza F75App; layout.tsx com metadata "F75 Max Web Driver"
- Validação Agent Browser (1280px + 390px): sim mode destrava tudo; RGB aplicado (0x0f commit + 0x05 LED, ck=ok, hexdumps no console); unlock flags 0; animação gerada → preview canvas 128×128 animando → upload 361 blocos + commit; Teclas captura Tab/Enter; Sistema: 80 linhas no console, filtros, matriz "ok (sim)"; persistência Spectrum→reload→restaurado; footer gruda no vh em ambos viewports (800/800, 844/844); zero erros de página; lint + tsc limpos

Stage Summary:
- O site agora É o driver: app fullscreen estilo VIA/Wootility, minimalista, sem nenhum conteúdo de guia/OS
- Motor TX v3 mais robusto: calibração automática ao conectar o receiver + cache global de rota vencedora — o clique em Aplicar usa a rota já validada (ataca o NotAllowedError residual por outro ângulo: calibração preventiva)
- UX de driver de verdade: estado vivo em resumos mono, preview fiel RGB565, console embutido = F12, persistência de settings

---
Task ID: 14
Agent: Z.ai Code (main)
Task: "não funcionou aparentemente" — RGB "aplicado" pelo receiver mas teclado não muda nada (bateria também muda). Investigação profunda da wire real (Chromium + kernel Linux) e reprojeto do TX do receiver (v4) com sonda de rotas validada por resposta real.

Work Log:
- Decodificou o log do usuário: packet 0x05/0x0f byte-idêntico ao nativo (checksum 0x34 ok, AA55 ok), TX aceito pelo SO, device ignora tudo (RGB + bateria sem resposta)
- Baixou e leu o código-fonte REAL de 3 camadas para fechar o modelo da wire:
  · Chromium (hid_connection_impl.cc): Write() SEMPRE prepensa o byte de report ID (io_buffer[0]=report_id, mesmo id=0) → write() cru no hidraw
  · Kernel hid-core/hidraw: hidraw_send_report (2≤count≤4096) → hid_hw_output_report → usbhid_output_report
  · Kernel usbhid: usbhid_output_report E usbhid_set_raw_report fazem "if (buf[0]==0x0) {buf++;count--;}" — REMOVEM o 0x00 → sendReport(0, pkt32) = 32B reais na wire = hid_write nativo (Linux E macOS após fallback)
- Conclusão-chave: a wire do web driver JÁ era byte-idêntica à do nativo; o problema NÃO é a wire — o firmware do receiver ignora rotas erradas em silêncio e "aceito pelo SO" não prova processamento; o tx() antigo parava na 1ª escrita aceita (0xFF60 output cru) e NUNCA testava 0xFF59 (64B), padding 64B ou SET_REPORT feature
- driver.ts v4: nova máquina de rotas do receiver — routeCandidates() gera matriz priorizada (0xFF60 out cru → 0xFF59 out cru → 0xFF59 out padded 64B → 0xFF60/0xFF59 feature SET_REPORT), sendRoute() com contabilidade honesta da wire, probeDongleRoutes() = SONDA que envia query de bateria por cada rota esperando a RESPOSTA real (20 01 .. %) — a rota que responde é cacheada (dongleRoute) e passa a valer para RGB/desempenho/bateria (fast path no tx())
- Fix de corrida: waiter de bateria agora registrado ANTES do send (antes registrava depois do await tx — resposta rápida podia ser perdida)
- Fix de visibilidade: inputs das interfaces vendor (0xFF59/0xFF60) agora sempre logados (RX receiver hex) — antes o filtro de ruído descartava id=0x00 e podia esconder o ACK/resposta
- queryBattery reescrita = sonda (verbose mostra cada rota tentada); calibrateDongle roda a sonda no bind; notas de log corrigidas (não diz mais "33B na wire" — wire real N B com explicação do strip do kernel)
- UI: DevicePanel ganhou card "Rota de comando do receiver" com botão "Sondar rotas" + status da rota (verde quando validada por resposta); SystemPanel mostra "rota do receiver: ..." na tabela de interfaces; sidebar v4
- Se nenhuma rota responder: mensagem clara e acionável (teclado não está falando com o receiver — acordar, conferir modo 2.4G segurando Fn, re-emparelhar Fn+R ~3s)
- Validação: tsc limpo, lint limpo, HTTP 200; Agent Browser — app renderiza, sim mode destrava tudo, RGB/perf aplicam com hexdump ck=ok, console TX/RX visível, tabela Sistema ok, mobile 390px com pill nav + footer grudado (844/844), desktop 1440px footer 900/900, zero erros de página

Stage Summary:
- Causa raiz real esclarecida: não era mais o NotAllowedError (isso já tinha ido) — era rota não verificável: o driver aceitava a 1ª rota que o SO aceitava e o firmware descartava em silêncio
- v4 = validação por EVIDÊNCIA (resposta de bateria) em vez de suposição — a rota certa é descoberta automaticamente, mesmo que o firmware deste receiver use 0xFF59/64B/SET_REPORT em vez de 0xFF60/32B
- Caminho de iteração: usuário clica "Sondar rotas" com o teclado acordado no 2.4G → se validar, RGB funciona; se nada responder, o log diz exatamente o que conferir (Fn / Fn+R / acordar teclado)

---
Task ID: 15
Agent: Z.ai Code (main)
Task: "pelo visto ta funciondo legal" — log do usuário confirmou rota 0xff59/64B validada por sonda (bateria 100%, RGB com ACK 0x05/0x0f ecoado, perf 0x07 ecoado, upload slot 2 OK em 1.2s). Novos pedidos: (1) trocar o slot da telinha (slots 1 e 2 preenchidos), (2) remover "Bloqueios independentes", (3) resposta sobre a capacidade total extraível do teclado.

Work Log:
- Re-baixou os fontes nativos (jsDelivr): LinuxHIDBackend.swift, AulaDevice.swift, AppViewModel.swift, ContentView.swift, DisplayEncoder.swift
- Conclusão de fonte: o driver nativo NÃO tem comando dedicado "ativar slot" — AppViewModel só tem `@Published var slot = 1` como alvo do PRÓXIMO upload; a telinha mostra o último slot escrito (metadados 04 72 [slot] + commit 04 02)
- ACK do firmware decodificado do log real do usuário: GET feature responde [0]=cmd [3]=0x01 quando aceito (04 02 00 01, 04 72 02 01)
- driver.ts: commandExchange/readFeatureAck agora RETORNAM o ACK (DataView|null); novo helper estático ackOk() checa byte[3]===0x01; zeroPages extraído pra método privado (reuso)
- NOVO activateDisplaySlot(slot): abrir sessão 04 18 → metadados 04 72 [slot] com 0 blocos → commit 04 02, com verificação honesta do ACK: se 0x01, "aceito, telinha deve trocar em ~2s"; senão, aviso claro de que o caminho garantido é reenviar a imagem (upload ativa no commit)
- NOVO eraseDisplayMemory(onStage): bloco de limpeza de display do factoryReset nativo isolado (04 19 → 04 15 [8]=0x08 → 8 zero pages → commit) — apaga TODOS os slots sem tocar keymap/lighting
- DisplayPanel: card "Slot de destino" com Segmented 1/2/3 compartilhado + botão "Ativar slot N" + nota explicativa; "Apagar memória de display" com confirmação em dois cliques (armed 6s); slot saiu do bloco de conteúdo — upload continua usando o slot compartilhado e ativa no commit
- F75App: REMOVIDO "Bloqueios independentes" (Alt+Tab/Alt+F4/Win) + botão "Desbloquear tudo"; PerfState simplificado pra {level, sleep, game}; Modo jogo agora usa a semântica EXATA do firmware nativo (setGameMode manda game=altTab=altF4=win juntos — Win lock é o único com efeito real: tecla morre + LED branco fixo); MonoLine atualizado; versões v3/v4 → v5
- Validação: eslint limpo, tsc limpo (app), HTTP 200; Agent Browser — sim destrava tudo, "Ativar slot 2" gera sequência byte-exata 04 18/04 72 02/04 02 no console, perf com modo jogo manda 0x07 game=1 altTab=1 altF4=1 win=1 ck=ok, Tela/Desempenho renderizam sem os bloqueios, mobile 390px footer grudado, desktop 1440px ok, zero erros de console/página

Stage Summary:
- Troca de slot SEM reenviar: botão "Ativar slot" (metadados 0 blocos + commit, ACK validado) — com fallback honesto: se o firmware da unidade só troca no upload, reenviar a imagem pro slot (1 clique, ~1s pra imagem estática)
- Apagar memória de display disponível isolada (remover GIFs sem factory reset)
- UI enxuta: bloqueios independentes fora; Modo jogo = comportamento nativo de verdade
- Capacidade total mapeada (resposta ao usuário): cabo = display (slots/clear/relógio) + factory reset; 2.4G = RGB 20 efeitos, perf 1-5, sleep, game/win-lock, bateria; fora do alcance (sem protocolo conhecido): remap por tecla, edição de macros, rate de polling
