# One image, two processes. Web: `node server.js`. Worker: `npx tsx src/worker/index.ts`.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json package.json drizzle.config.ts ./
COPY drizzle ./drizzle
EXPOSE 3000
# App Service: set the startup command to `npx tsx src/worker/index.ts` for the worker app.
CMD ["node", "server.js"]
