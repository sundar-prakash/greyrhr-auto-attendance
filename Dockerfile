# ---------- Base ----------
FROM node:20-slim AS base

# Avoid interactive prompts during package installs
ENV DEBIAN_FRONTEND=noninteractive

# System timezone — cron uses this; defaults to IST
ENV TZ=Asia/Kolkata

# Install cron, timezone data, and Playwright system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        cron \
        tzdata \
        # Playwright Chromium system deps (matches `npx playwright install-deps chromium`)
        libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
        libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
        libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
        fonts-liberation fonts-noto-color-emoji \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------- Dependencies ----------
COPY package.json ./
RUN npm install --omit=dev

# Install Playwright Chromium browser binary
RUN npx playwright install chromium

# ---------- App ----------
COPY index.js ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh



ENTRYPOINT ["/app/entrypoint.sh"]
