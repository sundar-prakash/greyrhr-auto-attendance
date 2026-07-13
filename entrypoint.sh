#!/usr/bin/env bash
set -euo pipefail

LOG=/app/cron.log

# ── 1. Pass ALL env vars into cron's environment ──
# Cron runs in a minimal shell without Docker env vars,
# so we dump them into /etc/environment which cron sources.
printenv | grep -Ev '^(HOME|USER|LOGNAME|SHELL|TERM|SHLVL|_)=' > /etc/environment

# ── 2. Write crontab ──
# Three entries (Mon–Fri, IST by default):
#   • 9:20 AM  — morning sign-in  (script adds 0–BUFFER jitter)
#   • 10–18 h  — hourly safety net (instant, no delay)
#   • 6:30 PM  — evening sign-out  (script adds 0–BUFFER jitter)
cat <<'CRON' > /etc/cron.d/attendance
SHELL=/bin/bash

# Morning sign-in
20 9 * * 1-5    root  . /etc/environment; cd /app && /usr/local/bin/node index.js >> /app/cron.log 2>&1

# Hourly safety checks (10 AM – 6 PM)
0 10-18 * * 1-5 root  . /etc/environment; cd /app && /usr/local/bin/node index.js >> /app/cron.log 2>&1

# Evening sign-out
30 18 * * 1-5   root  . /etc/environment; cd /app && /usr/local/bin/node index.js >> /app/cron.log 2>&1
CRON

# Crontab file must end with newline and have correct perms
echo "" >> /etc/cron.d/attendance
chmod 0644 /etc/cron.d/attendance
crontab /etc/cron.d/attendance

# ── 3. Start cron + tail logs ──
echo "" >> "$LOG"
echo "========================================" >> "$LOG"
echo "[$(date)] ✅ Attendance container started. Cron is running." | tee -a "$LOG"
echo "[$(date)] Timezone: $(cat /etc/timezone)" | tee -a "$LOG"
echo "[$(date)] Next sign-in:  Mon–Fri 9:20 AM" | tee -a "$LOG"
echo "[$(date)] Safety checks: Mon–Fri every hour 10 AM–6 PM" | tee -a "$LOG"
echo "[$(date)] Next sign-out: Mon–Fri 6:30 PM" | tee -a "$LOG"
echo "========================================" >> "$LOG"

# Run cron in foreground and stream logs so `docker logs` works too
cron && tail -f "$LOG"
