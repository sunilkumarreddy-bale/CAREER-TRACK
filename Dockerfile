# syntax=docker/dockerfile:1

# ---- Build the React client ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --no-audit --no-fund
COPY client client
RUN npm run build -w client

# ---- Install production server dependencies only ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w server --include-workspace-root=false --no-audit --no-fund

# ---- Runtime image ----
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=5000
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node server/package.json server/
COPY --chown=node:node server/src server/src
COPY --from=build --chown=node:node /app/client/dist client/dist
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1
CMD ["node", "server/src/server.js"]
