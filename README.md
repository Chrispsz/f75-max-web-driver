# F75 Max Web Driver

<div align="center">

**WebHID driver for the Epomaker x Aula F75 Max keyboard**

Lighting · Performance · 128×128 Display · Battery · Packet console

`100% local` · `no installation` · `open source`

**[Readme em português](README.pt-BR.md)**

</div>

---

A browser driver that talks **straight to the firmware** — the same protocol as the native desktop driver, ported byte-for-byte to WebHID. No app, no installer, no telemetry: open Chrome, plug the cable, done.

## Features

| Section | What it does |
|---|---|
| **Device** | USB-C cable and/or 2.4G receiver connection, command route probing, real-time battery, factory reset |
| **Lighting** | All 20 firmware effects, fixed + custom color, brightness/speed 1–5, direction, Colorful mode |
| **Performance** | Polling latency N1–N4, auto sleep, game mode (locks Win key — firmware behavior) |
| **Display** | Upload GIF/PNG/JPG/WebP to the 128×128 display (RGB565), 4 ready-made loop-perfect animations (F75 shine, Matrix cyan, Pulse EQ, Tetris), black screen, manual clock sync |
| **Keys** | Real-time key tester with history |
| **System** | Driver diagnostics and TX/RX packet console with full hexdump — same content as the browser F12 console |

### Highlights

- **Native protocol ported** — channels `0xFF13` (command), `0xFF68` (display) and `0xFF59/0xFF60` (2.4G receiver), with checksums and routes identical to the desktop driver.
- **Firmware-proof mini screen** — upload uses the only guaranteed flow (session → metadata → 4 KB blocks → commit, which already activates the slot). "Black screen" erases any GIF by overwriting the slot through the same path.
- **Faithful simulator** — the built-in 128×128 simulator decodes back the exact RGB565 frames the firmware will receive, at the device's real fps.
- **Transparent console** — every packet sent/received shows up with a complete hexdump in the app and in the browser console (`[F75]` filter).

## Requirements

- **Chromium** (Chrome, Edge, Brave, Opera, Chromium) — WebHID does not exist in Firefox/Safari
- Epomaker x Aula F75 Max keyboard

### Linux (udev)

Create `/etc/udev/rules.d/60-aula-f75-max.rules`:

```
# Aula F75 Max — cable (vendor 0x3554, product 0xf75a) and 2.4G receiver
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3554", ATTRS{idProduct}=="f75a", MODE="0660", TAG+="uaccess"
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3554", ATTRS{idProduct}=="f790", MODE="0660", TAG+="uaccess"
```

```bash
sudo udevadm control --reload && sudo udevadm trigger
```

## Running

```bash
bun install
bun run dev
```

Open the page, click **Conectar** (Connect) and check **all** "Aula F75 Max" entries in the browser device picker.

### Display art pack

The GIF pack lives in `public/art/` — exact RGB565 spectrum palette (zero banding), mathematically perfect loops:

```bash
bun scripts/gen-art.mjs
```

## Privacy

Nothing leaves your machine: no server, no analytics, no remote storage. Preferences live in the browser's `localStorage` and communication is exclusively local USB/HID.

## Notices

- Community project, not affiliated with Epomaker/Aula. Use at your own risk — factory reset wipes display, keymap, macros and lighting.
- The display uses channel `0xFF68`, available **on cable only** (the 2.4G receiver does not expose this channel).
