# Build stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /calcom

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

# Install dependencies including devDependencies for build
RUN yarn install

# Build stage 2: Build the application
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /calcom

COPY --from=deps /calcom/node_modules ./node_modules
COPY --from=deps /calcom/.yarn ./.yarn
COPY . .

# Set build-time environment variables
ARG NEXT_PUBLIC_LICENSE_CONSENT
ARG NEXT_PUBLIC_WEBSITE_TERMS_URL
ARG NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL
ARG CALCOM_TELEMETRY_DISABLED
ARG DATABASE_URL
ARG NEXTAUTH_SECRET=secret
ARG CALENDSO_ENCRYPTION_KEY=secret
ARG MAX_OLD_SPACE_SIZE=4096
ARG NEXT_PUBLIC_API_V2_URL
ARG CSP_POLICY
ARG NEXT_PUBLIC_SINGLE_ORG_SLUG
ARG ORGANIZATIONS_ENABLED
ARG NEXT_PUBLIC_THRES_WEBHOOK_URL
ARG NEXT_PUBLIC_THRESHOLD_MODE
ARG NEXT_PUBLIC_GAS_CHECK_URL
ARG NEXT_PUBLIC_GAS_SAVE_URL
ARG NEXT_PUBLIC_GAS_TOKEN

ENV NEXT_PUBLIC_WEBAPP_URL=http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER \
    NEXT_PUBLIC_API_V2_URL=$NEXT_PUBLIC_API_V2_URL \
    NEXT_PUBLIC_LICENSE_CONSENT=$NEXT_PUBLIC_LICENSE_CONSENT \
    NEXT_PUBLIC_WEBSITE_TERMS_URL=$NEXT_PUBLIC_WEBSITE_TERMS_URL \
    NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL=$NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL \
    CALCOM_TELEMETRY_DISABLED=$CALCOM_TELEMETRY_DISABLED \
    DATABASE_URL=$DATABASE_URL \
    DATABASE_DIRECT_URL=$DATABASE_URL \
    NEXTAUTH_SECRET=${NEXTAUTH_SECRET} \
    CALENDSO_ENCRYPTION_KEY=${CALENDSO_ENCRYPTION_KEY} \
    NEXT_PUBLIC_SINGLE_ORG_SLUG=$NEXT_PUBLIC_SINGLE_ORG_SLUG \
    ORGANIZATIONS_ENABLED=$ORGANIZATIONS_ENABLED \
    NODE_OPTIONS=--max-old-space-size=${MAX_OLD_SPACE_SIZE} \
    BUILD_STANDALONE=true \
    NEXT_PUBLIC_THRES_WEBHOOK_URL=$NEXT_PUBLIC_THRES_WEBHOOK_URL \
    NEXT_PUBLIC_THRESHOLD_MODE=$NEXT_PUBLIC_THRESHOLD_MODE \
    NEXT_PUBLIC_GAS_CHECK_URL=$NEXT_PUBLIC_GAS_CHECK_URL \
    NEXT_PUBLIC_GAS_SAVE_URL=$NEXT_PUBLIC_GAS_SAVE_URL \
    NEXT_PUBLIC_GAS_TOKEN=$NEXT_PUBLIC_GAS_TOKEN \
    CSP_POLICY=$CSP_POLICY

RUN yarn workspace @calcom/trpc run build
RUN yarn --cwd packages/embeds/embed-core workspace @calcom/embed-core run build
RUN yarn --cwd apps/web workspace @calcom/web run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /calcom

ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat openssl

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /calcom/apps/web/public ./apps/web/public
COPY --from=builder /calcom/apps/web/.next/standalone ./
COPY --from=builder /calcom/apps/web/.next/static ./apps/web/.next/static

# Copy prisma schema and engines for runtime migrations
COPY --from=builder /calcom/packages/prisma ./packages/prisma
COPY --from=builder /calcom/scripts ./scripts
COPY --from=builder /calcom/package.json ./package.json

RUN chmod +x scripts/*

ARG NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000
ENV NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL \
    BUILT_NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL

# Perform placeholder replacement
RUN scripts/replace-placeholder.sh http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER ${NEXT_PUBLIC_WEBAPP_URL}

USER nextjs

EXPOSE 3000
ENV PORT 3000

HEALTHCHECK --interval=30s --timeout=30s --retries=5 \
    CMD wget --spider http://localhost:3000 || exit 1

CMD ["/calcom/scripts/start.sh"]

