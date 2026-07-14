# ---------- Base ----------
FROM node:20-slim AS base

# Avoid interactive prompts during package installs
ENV DEBIAN_FRONTEND=noninteractive

# System timezone — cron uses this; defaults to IST
ENV TZ=Asia/Kolkata

# Install cron, timezone data, and dos2unix
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        cron \
        tzdata \
        dos2unix \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---------- Dependencies ----------
COPY package.json ./
RUN npm install --omit=dev

# Install Playwright Chromium browser binary and OS dependencies
RUN npx playwright install chromium && \
    npx playwright install-deps chromium

# ---------- App ----------
COPY index.js ./
COPY entrypoint.sh ./

# Fix Windows CRLF → Unix LF (the #1 reason cron silently fails on Windows-built images)
RUN dos2unix entrypoint.sh && chmod +x entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
