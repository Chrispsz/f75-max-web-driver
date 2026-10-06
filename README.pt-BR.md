# F75 Max Web Driver

<div align="center">

**Driver WebHID para o teclado Epomaker x Aula F75 Max**

Iluminação · Desempenho · Display 128×128 · Bateria · Console de pacotes

`100% local` · `sem instalação` · `código aberto`

**[English readme](README.md)**

</div>

---

Driver de navegador que fala **direto com o firmware** — o mesmo protocolo do driver nativo, portado byte a byte pra WebHID. Sem app, sem instalador, sem telemetria: abra no Chrome, conecte o cabo, pronto.

## Recursos

| Seção | O que faz |
|---|---|
| **Dispositivo** | Conexão via cabo USB-C e/ou receiver 2.4G, sondagem de rota de comando, bateria em tempo real, restauração de fábrica |
| **Iluminação** | 20 efeitos do firmware, cor fixa + custom, brilho/velocidade 1–5, direção, modo Colorful |
| **Desempenho** | Latência de polling N1–N4, suspensão automática, modo jogo (trava Win — comportamento do firmware) |
| **Tela** | Upload de GIF/PNG/JPG/WebP pro display 128×128 (RGB565), 4 artes prontas com loop perfeito (F75 shine, Matrix ciano, Pulso EQ, Tetris), tela preta, relógio manual |
| **Teclas** | Teste de teclas em tempo real com histórico |
| **Sistema** | Diagnóstico do driver e console de pacotes TX/RX com hexdump — o mesmo conteúdo do F12 |

### Destaques

- **Protocolo nativo portado** — canais `0xFF13` (comando), `0xFF68` (display) e `0xFF59/0xFF60` (receiver 2.4G), com checksum e rotas idênticas ao driver de desktop.
- **Telinha à prova de firmware** — upload usa o único fluxo garantido (sessão → metadados → blocos de 4 KB → commit, que já ativa o slot). "Tela preta" apaga qualquer GIF sobrescrevendo o slot pelo mesmo caminho.
- **Simulador fiel** — o simulador 128×128 embutido decodifica de volta o RGB565 exato que o firmware vai receber, no fps real do device.
- **Console transparente** — cada pacote enviado/recebido aparece com hexdump completo no app e no console do navegador (filtro `[F75]`).

## Requisitos

- **Chromium** (Chrome, Edge, Brave, Opera, Chromium) — WebHID não existe no Firefox/Safari
- Teclado Epomaker x Aula F75 Max

### Linux (udev)

Crie `/etc/udev/rules.d/60-aula-f75-max.rules`:

```
# Aula F75 Max — cabo (vendor 0x3554, product 0xf75a) e receiver 2.4G
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3554", ATTRS{idProduct}=="f75a", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3554", ATTRS{idProduct}=="f790", MODE="0660", TAG+="uaccess"
```

```bash
sudo udevadm control --reload && sudo udevadm trigger
```

## Rodando

```bash
bun install
bun run dev
```

Abra a página, clique em **Conectar** e marque **todas** as entradas "Aula F75 Max" no seletor do navegador.

### Artes do display

Os GIFs do pack ficam em `public/art/` — paleta exata do espectro RGB565 (zero banding), loop matematicamente perfeito:

```bash
bun scripts/gen-art.mjs
```

## Privacidade

Nada sai da máquina: sem servidor, sem analytics, sem storage remoto. As preferências ficam no `localStorage` do navegador e a comunicação é exclusivamente USB/HID local.

## Avisos

- Projeto da comunidade, sem afiliação com Epomaker/Aula. Use por sua conta e risco — a restauração de fábrica apaga display, keymap, macros e lighting.
- O display usa o canal `0xFF68`, disponível **apenas com cabo** (o receiver 2.4G não expõe esse canal).
