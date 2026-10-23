# Quant Plus web app (TanStack Start SSR server + paper-order worker).
# Runs as one long-lived container: the worker evaluates resting orders and
# protections even when no browser is open, so a serverless host is not suitable.
#
# Build-time: only PUBLIC browser values (VITE_*) are read, from
# .env.production.local in the build context. Server secrets are runtime env.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    MARKET_CACHE_DIR=/tmp/quantplus/market-cache
COPY --from=build /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
