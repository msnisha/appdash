# appdash

A small, fast, **JSON-driven static dashboard** for self-hosted apps. No
build step, no framework, no database — just an HTML/CSS/JS bundle served
by Caddy that reads a single `apps.json` file.

- **Two URLs per app** — show an internal IP *and* a public domain
  side-by-side (e.g. Proxmox at `192.168.1.2:8006` and `pve.example.com`).
- **Two categories out of the box** — `Internal & Infrastructure` vs
  `Company & Public Apps`. Add your own in `apps.json`.
- **Live status badges** — direct fetch where CORS allows, with an opt-in
  Caddy reverse-proxy fallback for everything else.
- **No build tooling** — vanilla JS + custom CSS. Edit `apps.json`,
  refresh, done.
- **Container is ~50 MB** — `caddy:2-alpine` + ~30 KB of static files.

![screenshot placeholder](docs/screenshot.png)

## Quick start

```bash
git clone https://github.com/msnisha/appdash.git
cd appdash

# 1. Copy the example config and edit it for your apps
cp public/apps.example.json public/apps.json
$EDITOR public/apps.json

# 2. Run it
docker compose up -d --build

# 3. Open http://localhost:8080
```

You probably want to put the container behind your existing reverse proxy
(Traefik, Caddy, nginx, Cloudflare Tunnel, …). Drop the `ports:` block in
`docker-compose.yml` and add your own labels/networks.

## Configuring apps

`public/apps.json` is the only file you need to edit. Schema:

```jsonc
{
  "title": "My Homelab",
  "subtitle": "Self-hosted services",
  "brand": {
    "initial": "H",                          // letter shown in the logo box
    "gradient": "linear-gradient(...)"       // CSS background for the logo
  },
  "repoUrl": "https://github.com/you/appdash",

  "categories": [
    { "id": "infra",   "name": "Infrastructure", "description": "..." },
    { "id": "company", "name": "Company Apps" }
  ],

  "apps": [
    {
      "id": "proxmox",
      "name": "Proxmox VE",
      "category": "infra",
      "description": "Hypervisor & VM management.",
      "icon": "🖥️",                          // emoji, single char, or "img:<url>"
      "color": "#e57000",                    // tints the icon tile
      "urls": [
        { "label": "Internal", "url": "https://192.168.1.10:8006" },
        { "label": "Domain",   "url": "https://pve.example.com" }
      ],
      "health": {                            // optional
        "url": "/healthproxy/proxmox/api2/json/version",
        "expect": [200, 401]
      }
    }
  ]
}
```

See [`public/apps.example.json`](public/apps.example.json) for examples
covering single URL, two URLs, image icons, and all three health-check
modes.

## Health checks

The frontend tries to fetch `health.url` for each app and toggles the
status dot accordingly. Three modes:

| Mode | What it tells you | When to use |
| ---- | ----------------- | ----------- |
| **CORS direct** — `health.url` points at the app, `expect: [...]` listed | Real HTTP status code | App returns proper `Access-Control-Allow-Origin` |
| **opaque (`noCors: true`)** | Reachable, but status unknown | Cross-origin app without CORS — better than nothing |
| **proxy** — `health.url` is a path like `/healthproxy/<id>/...` | Real HTTP status code, no CORS issue | Internal apps you don't want to expose CORS for |

For proxy mode, uncomment a `handle_path` block in [`Caddyfile`](Caddyfile)
for each app you want to check. Caddy reverse-proxies the upstream so the
browser sees a same-origin response.

```caddy
handle_path /healthproxy/proxmox/* {
    reverse_proxy https://192.168.1.2:8006 {
        transport http {
            tls
            tls_insecure_skip_verify
        }
    }
}
```

If a request times out (default 4 s) or fails, the dot turns red. Checks
re-run every 60 s.

## Files

```
appdash/
├── public/
│   ├── index.html           # markup
│   ├── styles.css           # custom dark theme, ~250 lines
│   ├── app.js               # vanilla JS renderer + health checks
│   ├── apps.json            # YOUR config (gitignored)
│   └── apps.example.json    # reference config (committed)
├── Caddyfile
├── Dockerfile               # caddy:2-alpine + COPY public /srv
├── docker-compose.yml
└── .gitignore               # ignores public/apps.json
```

`apps.json` is **gitignored** so you can keep your real infrastructure
list private. `apps.example.json` is committed and acts as the schema
reference / starter template.

## Customising the look

Theme variables live at the top of `public/styles.css`. Override colours,
radius, or shadows there. The dashboard auto-switches to a light theme
based on `prefers-color-scheme`.

## Why custom CSS instead of Tailwind?

Zero dependencies, no CDN call, no build pipeline. The whole frontend is
three files totalling under 30 KB unminified.

## License

MIT — see [LICENSE](LICENSE).
