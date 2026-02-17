# xiao.sh - OpenTUI Portfolio

Terminal-first portfolio built with [`@opentui/core`](https://github.com/anomalyco/opentui/tree/main/packages/core).

## Stack

- Bun
- TypeScript
- `@opentui/core`
- Optional Convex metrics store

## Local development

```bash
npm install
bun run dev
```

## Controls

- `Tab`: switch focus between section list and item list
- `Arrow keys`: move selection
- `Enter` or `O`: open selected link
- `R`: refresh projects from GitHub
- `1-4`: jump to section
- `Q`: quit

## Environment

Copy `.env.example` to `.env` and configure:

- `GITHUB_TOKEN` (optional): higher GitHub API rate limits
- `CONVEX_URL` (optional): persist launch count and uptime
- `OPENTUI_FORCE_EXPLICIT_WIDTH=false` (optional): compatibility for terminals that do not support OSC 66

## Convex function names

When `CONVEX_URL` is set, the app calls:

- `portfolio:trackVisit`
- `portfolio:getSiteStartTime`

Without Convex, it falls back to local in-memory state.

## Hosting on Raspberry Pi with xiao.sh

This app is not serverless-friendly (it is an interactive terminal process).  
Recommended setup:

- Run app locally on Pi behind `ttyd`
- Expose via Cloudflare Tunnel on `xiao.sh`
- Protect with Cloudflare Access

### 1) Run web terminal locally

```bash
ttyd -i 127.0.0.1 -p 7681 -W bun run src/tui/index.ts
```

### 2) Route `xiao.sh` through Cloudflare Tunnel

- Create a Cloudflare Tunnel in Zero Trust
- Publish hostname `xiao.sh` (or `tui.xiao.sh`) to `http://localhost:7681`
- Enable Cloudflare Access policy for your identity

### 3) Keep it running with systemd

Create `/etc/systemd/system/xiao-tui.service`:

```ini
[Unit]
Description=xiao.sh OpenTUI via ttyd
After=network-online.target
Wants=network-online.target

[Service]
User=pi
WorkingDirectory=/home/pi/xiao.sh
EnvironmentFile=/home/pi/xiao.sh/.env
ExecStart=/usr/bin/ttyd -i 127.0.0.1 -p 7681 -W /home/pi/.bun/bin/bun run src/tui/index.ts
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now xiao-tui
```
