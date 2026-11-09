# syntax=docker/dockerfile:1
# dautu: NestJS (web + worker cùng 1 image, chọn bằng lệnh chạy) + React (frontend/dist) + Prisma.
# Build context = thư mục gốc repo donghanhdautu.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

FROM base AS web
WORKDIR /app
COPY contracts/ contracts/
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM base AS api
WORKDIR /app
COPY contracts/ contracts/
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
# Giữ devDependencies: cần prisma CLI để chạy `prisma migrate deploy` (initContainer)
RUN npx prisma generate && npm run build

FROM base
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4200 TZ=Asia/Ho_Chi_Minh
WORKDIR /app/backend
COPY --from=api /app/contracts /app/contracts
COPY --from=api /app/backend ./
COPY --from=web /app/frontend/dist /app/frontend/dist
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
USER node
EXPOSE 4200
# web: node dist/main.js  |  worker: node dist/worker.js  |  migrate: npx prisma migrate deploy
CMD ["node", "dist/main.js"]
