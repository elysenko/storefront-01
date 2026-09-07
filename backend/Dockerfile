# Storefront API — NestJS 10-style module layout on Nest 11 + Prisma/Postgres.
# Stage 1 compiles TypeScript and generates the Prisma client; stage 2 carries the
# compiled output plus node_modules (dev deps included on purpose: the deploy
# pipeline's migrate Job runs `npx prisma migrate deploy` inside this image, which
# needs the Prisma CLI available offline).
FROM node:22-alpine AS builder
WORKDIR /app
# Dummy URL satisfies the datasource block at generate time — no real DB needed.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY package*.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npx prisma generate
# nest build exits 0 even when it emits nothing (a stale *.tsbuildinfo will do
# that), so assert the entrypoint exists rather than discovering it at runtime.
RUN npm run build \
    && test -f dist/main.js \
    || (echo 'ERROR: dist/main.js missing after build — check tsconfig.build.json rootDir and *.tsbuildinfo' && exit 1)

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./
# 3000 matches the template's nginx upstream, 3001 matches colossus.yaml; the
# process serves the same handler on both (see src/main.ts).
EXPOSE 3000
EXPOSE 3001
CMD ["node", "dist/main.js"]
