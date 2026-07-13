# GreytHR Auto Sign-In / Sign-Out

Node.js + Playwright script that logs into GreytHR and signs you **in** during office hours (or before) and **out** after office hours. Skips weekends and configured leave dates.

Each run is short-lived (headless Chromium → login → click → exit in ~30–90 s). No always-on browser.

---

## Quick Start (Docker) ⚡

> The easiest way to run — just `docker compose up`.

### Prerequisites

- Docker Engine 20+ and Docker Compose v2 (`docker compose version`)

### 1. Configure

```bash
cp .env.example .env
nano .env          # fill in your GreytHR credentials + leave dates
```

### 2. Start

```bash
docker compose up -d          # build & start in background
```

That's it. The container runs a cron daemon internally with this schedule (Mon–Fri, IST):

| Time | Action |
|------|--------|
| **9:20 AM** | Morning sign-in (+ 0–10 min random jitter) |
| **10 AM – 6 PM** (hourly) | Safety-net check (instant, no delay) |
| **6:30 PM** | Evening sign-out (+ 0–10 min random jitter) |

### 3. Monitor

```bash
docker logs -f greythr-attendance     # live log stream
```

### 4. Stop

```bash
docker compose down                   # stop & remove container
```

### 5. Update leave dates or credentials

Edit `.env`, then restart:

```bash
docker compose down && docker compose up -d
```

### One-off test run

Run the script immediately (outside cron) to verify your credentials:

```bash
docker compose run --rm attendance node index.js
```

---

## Environment Variables

```bash
cp .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `GREYTHR_URL` | GreytHR portal URL |
| `LOGIN_ID` / `PASSWORD` | Login credentials |
| `LEAVE_DATES` | Comma-separated dates to skip (`YYYY-MM-DD`) |
| `OFFICE_START_HOUR` / `OFFICE_START_MINUTE` | Office start (default 9:30) |
| `OFFICE_END_HOUR` / `OFFICE_END_MINUTE` | Office end (default 18:30) |
| `BUFFER_MAX_MINUTES` | Max random jitter in minutes (default 10) |
| `HEADLESS` | `true` (default) or `false` to show browser |

Behavior by local time:

- **Before start** → ensure **Sign In**
- **Work hours** → ensure **Sign In**
- **After end** → ensure **Sign Out**
- **Weekend / leave** → skip

The script adds a random delay of **0 – BUFFER_MAX_MINUTES** before acting, so actual sign-in/out times vary each day.

> **Do not commit `.env`** — it is gitignored.

---

## Manual Setup (without Docker)

<details>
<summary>Click to expand — Node.js + system cron</summary>

### Requirements

- Linux (Ubuntu/Debian recommended)
- Node.js 18+
- Cron

### Install

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

cd /path/to/attendance
npm install
npx playwright install chromium
sudo npx playwright install-deps chromium
```

### Test manually

```bash
node index.js
# Or with visible browser:
HEADLESS=false node index.js
```

### Cron schedule

```bash
crontab -e
```

```cron
# GreytHR attendance (Mon–Fri)
20 9 * * 1-5    cd /path/to/attendance && /usr/bin/node index.js >> cron.log 2>&1
0 10-18 * * 1-5 cd /path/to/attendance && /usr/bin/node index.js >> cron.log 2>&1
30 18 * * 1-5   cd /path/to/attendance && /usr/bin/node index.js >> cron.log 2>&1
```

### Timezone

```bash
timedatectl
# sudo timedatectl set-timezone Asia/Kolkata
```

</details>

---

## Resource Usage

| Mode | Notes |
|------|-------|
| Headless (default) | Chromium starts → login + click → exits (~30–90 s). Fine for hourly cron. |
| `HEADLESS=false` | Needs a display; debugging only. |

## Troubleshooting

- **Neither Sign In nor Sign Out detected** — dashboard widget slow or UI changed; test with `HEADLESS=false`.
- **Container exits immediately** — check `docker logs greythr-attendance` for errors.
- **Wrong timezone** — set `TZ=Asia/Kolkata` in `docker-compose.yml` (default).
- **Playwright browser missing** — rebuild: `docker compose build --no-cache`.
