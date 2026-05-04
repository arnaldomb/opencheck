FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.14.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json              ./apps/api/
COPY apps/web/package.json              ./apps/web/
COPY packages/database/package.json    ./packages/database/
COPY packages/shared/package.json      ./packages/shared/
COPY packages/ui/package.json          ./packages/ui/
COPY packages/asaas-sdk/package.json   ./packages/asaas-sdk/
COPY packages/ezviz-sdk/package.json   ./packages/ezviz-sdk/
COPY packages/ctrlsafe-sdk/package.json ./packages/ctrlsafe-sdk/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm --filter @alerta-vigia/database db:generate
RUN pnpm --filter @alerta-vigia/database build
RUN pnpm --filter @alerta-vigia/asaas-sdk build
RUN pnpm --filter @alerta-vigia/ezviz-sdk build
RUN pnpm --filter @alerta-vigia/api build

FROM node:20-alpine AS production
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist                   ./apps/api/dist
COPY --from=builder /app/packages/database/dist          ./packages/database/dist
COPY --from=builder /app/packages/database/package.json  ./packages/database/package.json
COPY --from=builder /app/packages/database/prisma        ./packages/database/prisma
COPY --from=builder /app/packages/asaas-sdk/dist         ./packages/asaas-sdk/dist
COPY --from=builder /app/packages/asaas-sdk/package.json ./packages/asaas-sdk/package.json
COPY --from=builder /app/packages/ezviz-sdk/dist         ./packages/ezviz-sdk/dist
COPY --from=builder /app/packages/ezviz-sdk/package.json ./packages/ezviz-sdk/package.json
COPY --from=builder /app/node_modules                        ./node_modules
COPY --from=builder /app/apps/api/node_modules               ./apps/api/node_modules
COPY --from=builder /app/packages/database/node_modules      ./packages/database/node_modules
COPY --from=builder /app/packages/asaas-sdk/node_modules     ./packages/asaas-sdk/node_modules
COPY --from=builder /app/packages/ezviz-sdk/node_modules     ./packages/ezviz-sdk/node_modules

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s \
  CMD node -e "require('http').get('http://127.0.0.1:3001/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]
