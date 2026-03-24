# subconverter-vless-fix

Web UI + fix proxy for [MetaCubeX/subconverter](https://github.com/MetaCubeX/subconverter) that resolves the VLESS subscription parsing bug.

## Problem

The original [tindy2013/subconverter](https://github.com/tindy2013/subconverter) does not support VLESS protocol ([#779](https://github.com/tindy2013/subconverter/issues/779)).

The MetaCubeX fork supports VLESS, but has a bug: when loading subscriptions via URL, it calls `urlSafeBase64Decode()` on plain-text content, corrupting VLESS links.

## Solution

This project provides:

- **Fix proxy** — fetches the subscription, base64-encodes it, and passes it to subconverter as a local file
- **Web UI** — dark-themed interface for generating subscription links
- **Control panel** — CLI menu for managing services

## Quick Start

### 1. Download MetaCubeX subconverter

Download `subconverter.exe` from [MetaCubeX/releases](https://github.com/MetaCubeX/subconverter/releases) (v0.9.2 or newer) and place it in the project folder.

### 2. Run

```bash
python control.py
```

Or double-click `start.bat` on Windows.

### 3. Open Web UI

Go to [http://127.0.0.1:25502](http://127.0.0.1:25502)

## Architecture

```
┌─────────────┐     ┌────────────┐     ┌──────────────┐
│   Web UI    │────▶│ Fix Proxy  │────▶│ SubConverter │
│  :25502     │     │  :25501    │     │   :25500     │
└─────────────┘     └────────────┘     └──────────────┘
                          │
                    ┌─────┴─────┐
                    │ 1. Fetch  │
                    │ 2. Base64 │
                    │ 3. Pass   │
                    └───────────┘
```

## Features

- **VLESS / VMess / SS / SSR / Trojan** — all supported protocols
- **Multiple subscriptions** — merge several sources into one config
- **Preset sources** — one-click selection of popular subscriptions
- **Preview** — see proxy nodes before generating
- **Copy to clipboard** — paste directly into Clash Verge Rev
- **Multiple targets** — Clash, Surge, Quantumult X, Loon, etc.

## Usage

### Web UI

1. Open [http://127.0.0.1:25502](http://127.0.0.1:25502)
2. Select preset sources or enter custom URLs
3. Choose target format (Clash by default)
4. Click **Generate**
5. Click **Copy to Clipboard**
6. Paste into Clash Verge Rev (Profiles → Import from URL)

### Control Panel

```
[1] Start all (SubConverter + Proxy + WebUI)
[2] Copy URL to clipboard (BLACK VLESS)
[3] Enter custom URL and copy
[4] Open Web UI in browser
[5] Stop everything
[0] Exit
```

### API

```
# Single subscription
http://127.0.0.1:25501/sub?target=clash&url=https://example.com/subscription.txt

# Multiple subscriptions (merged)
http://127.0.0.1:25501/sub?target=clash&url=https://example.com/sub1.txt|https://example.com/sub2.txt
```

## Requirements

- Python 3.8+
- MetaCubeX/subconverter binary
- No external Python packages (uses only stdlib)

## Ports

| Service       | Port  | Description              |
|---------------|-------|--------------------------|
| SubConverter  | 25500 | Core conversion engine   |
| Fix Proxy     | 25501 | Fixes VLESS parsing bug  |
| Web UI        | 25502 | Browser interface        |

## Known Issues

- Cyrillic characters in file paths may cause issues — use ASCII paths
- The fix proxy adds a slight delay for base64 encoding large subscriptions
- Only tested on Windows; Linux/macOS may need minor adjustments

## Credits

- [tindy2013/subconverter](https://github.com/tindy2013/subconverter) — original project
- [MetaCubeX/subconverter](https://github.com/MetaCubeX/subconverter) — fork with VLESS support

## License

MIT
