# ============================================================
# DEAR DOLLAR Customer Frontend — Production Dockerfile
# Multi-stage build with Next.js standalone output
# Deployable on any Linux VPS (Hostinger KVM, Ubuntu, etc.)
# ============================================================

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile --production=false

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* variables are baked in at BUILD time
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN yarn build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
