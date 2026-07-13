# GreytHR Auto Sign-In / Sign-Out

Node.js + Playwright script that logs into GreytHR and signs you **in** during office hours (or before) and **out** after office hours. Skips weekends and configured leave dates.

Runs fine on a small Linux VPS or laptop: each hourly run is short-lived (headless Chromium), then exits — it does **not** keep a browser open all day.

## Requirements

- Linux (Ubuntu/Debian recommended)
- Node.js 18+ (`node -v`)
- Cron

## 1. Install

```bash
# Node.js (if missing) — Ubuntu/Debian example
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Project
cd /path/to/test   # folder that contains index.js and package.json
npm install
npx playwright install chromium
sudo npx playwright install-deps chromium   # system libraries for headless Chromium
```

## 2. Configure

```bash
cp .env.example .env
nano .env   # or any editor
```

| Variable | Purpose |
|----------|---------| 
| `GREYTHR_URL` | GreytHR URL |
| `LOGIN_ID` / `PASSWORD` | Login credentials |
| `LEAVE_DATES` | Comma-separated dates to skip (`YYYY-MM-DD`) |
| `OFFICE_START_HOUR` / `OFFICE_START_MINUTE` | Office start (default 9:30) |
| `OFFICE_END_HOUR` / `OFFICE_END_MINUTE` | Office end (default 18:30) |
| `BUFFER_MAX_MINUTES` | Max random jitter in minutes (default 10). Sign-in/out times are randomised within this window each run. |
| `HEADLESS` | `true` (default) or `false` to show the browser |

Behavior by local time:

- **Before start** → ensure **Sign In**
- **Work hours** → ensure **Sign In**
- **After end** → ensure **Sign Out**
- **Weekend / leave** → exit without doing anything

The script adds a random delay of **0 – BUFFER_MAX_MINUTES** before acting, so actual sign-in/out times are never the same two days in a row.

Do not commit `.env` (it is gitignored).

## 3. Test manually

```bash
cd /path/to/test
node index.js
```

To watch the browser while debugging, set in `.env`:

```env
HEADLESS=false
```

Or one-off:

```bash
HEADLESS=false node index.js
```

## 4. Cron — targeted sign-in/out + hourly safety checks

Schedule **three cron entries**: one for morning sign-in (with jitter), hourly checks during work hours (instant, no delay), and evening sign-out (with jitter).

```bash
crontab -e
```

Add (replace paths with yours):

```cron
# GreytHR attendance (Mon–Fri)
#
# 1. Morning sign-in at 9:20 AM (script adds 0–10 min jitter → 9:20–9:30 AM)
# 2. Hourly safety checks 10 AM – 6 PM (instant — catches accidental sign-outs)
# 3. Evening sign-out at 6:30 PM (script adds 0–10 min jitter → 6:30–6:40 PM)
20 9 * * 1-5    cd /path/to/test && /usr/bin/node index.js >> /path/to/test/cron.log 2>&1
0 10-18 * * 1-5 cd /path/to/test && /usr/bin/node index.js >> /path/to/test/cron.log 2>&1
30 18 * * 1-5   cd /path/to/test && /usr/bin/node index.js >> /path/to/test/cron.log 2>&1
```

Find your Node binary if unsure:

```bash
which node
```

### Timezone

Cron uses the system timezone. Check/set if needed:

```bash
timedatectl
# e.g. sudo timedatectl set-timezone Asia/Kolkata
```

### Verify cron

```bash
crontab -l
tail -f /path/to/test/cron.log
```

## Resource use

| Mode | Notes |
|------|--------|
| Headless (default) | Light: Chromium starts, does login + click, exits (~30–90s). Fine for hourly cron. |
| `HEADLESS=false` | Needs a display; use only for debugging. |

No always-on browser process — only one short run per hour.

## Troubleshooting

- **Neither Sign In nor Sign Out detected** — dashboard widget slow or UI changed; run with `HEADLESS=false` once and confirm the button text.
- **Cron runs but nothing in log** — wrong path to `node` or project; use absolute paths.
- **Playwright browser missing** — re-run `npx playwright install chromium` as the same user that owns the crontab.
