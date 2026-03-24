# SubConverter Wrapper

Convert VLESS/VMess/SS/SSR/Trojan subscriptions to Clash format — **100% free, no hosting needed.**

## Live Demo

**https://eugeneofficial.github.io/subconverter-wrapper/**

## How It Works

```
GitHub Pages (UI)  →  Cloudflare Worker (proxy)  →  Subscription Source
    Free forever          Free (100k req/day)           Your link
```

The Cloudflare Worker:
1. Fetches your subscription
2. Parses VLESS/VMess/SS/SSR/Trojan links
3. Generates Clash YAML config
4. Returns it directly (no subconverter binary needed!)

## Deploy (5 minutes)

### 1. Deploy Cloudflare Worker

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → Sign up (free)
2. Click **Workers & Pages** → **Create** → **Create Worker**
3. Name it `subconverter-wrapper`
4. Delete all code in the editor
5. Copy-paste the contents of [`cloudflare-worker/worker.js`](cloudflare-worker/worker.js)
6. Click **Deploy**
7. Copy your Worker URL (e.g., `https://subconverter-wrapper.your-name.workers.dev`)

### 2. Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main`, folder: `/docs`
4. Click **Save**
5. Your site: `https://your-name.github.io/subconverter-wrapper/`

### 3. Use It

1. Open your GitHub Pages URL
2. Paste your Worker URL in **Settings → Backend URL**
3. Select subscriptions (BLACK VLESS is pre-checked)
4. Click **Generate**
5. Copy the URL → Paste into Clash Verge Rev

## Local Usage (no cloud needed)

```bash
# 1. Download subconverter.exe from MetaCubeX/releases
# 2. Run:
python control.py
# 3. Open http://127.0.0.1:25502
```

## Architecture

| Component | Free Provider | Purpose |
|-----------|--------------|---------|
| Web UI | GitHub Pages | Static HTML/CSS/JS |
| Proxy | Cloudflare Worker | Parse subscriptions, generate config |
| Subscription | GitHub (raw) | Source links |

## Supported Protocols

- ✅ VLESS (reality, xtls, ws, grpc, http)
- ✅ VMess
- ✅ Shadowsocks (SS)
- ✅ ShadowsocksR (SSR)
- ✅ Trojan

## Supported Targets

- Clash / ClashR
- Surge 4
- Quantumult X
- Loon
- Surfboard
- V2Ray

## Files

```
├── cloudflare-worker/
│   ├── worker.js         # Cloudflare Worker (fix proxy)
│   └── wrangler.toml     # Worker config
├── docs/
│   └── index.html        # GitHub Pages UI
├── control.py            # Local CLI panel
├── fix_sub.py            # Local fix proxy (Python)
├── webui_server.py       # Local web server
├── webui/
│   └── index.html        # Local web UI
└── start.bat             # Windows launcher
```

## Credits

- [tindy2013/subconverter](https://github.com/tindy2013/subconverter) — original project
- [MetaCubeX/subconverter](https://github.com/MetaCubeX/subconverter) — fork with VLESS support

## License

MIT
