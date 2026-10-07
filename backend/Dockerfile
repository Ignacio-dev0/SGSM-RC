# API del SGSM-RC para el entorno completo en Docker (T007, versión local).
# Se construye desde la raíz del repositorio: docker compose --profile completo up --build
FROM node:24-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY backend/prisma backend/prisma
RUN npm ci -w backend --include-workspace-root=false
COPY tsconfig.base.json ./
COPY backend backend
RUN npm run build -w backend
WORKDIR /app/backend
EXPOSE 3000
# Aplica las migraciones pendientes y arranca la API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
