# API del SGSM-RC para el despliegue con Docker (T007, T801 · docs/despliegue.md).
# Se construye desde la raíz del repositorio: docker compose build
FROM node:24-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY backend/prisma backend/prisma
# Con las dependencias de desarrollo: el CLI de Prisma (migraciones al arrancar) y tsx (semilla
# de demostración) son devDependencies.
RUN npm ci -w backend --include-workspace-root=false
COPY tsconfig.base.json ./
COPY backend backend
RUN npm run build -w backend
WORKDIR /app/backend
# npx no sale a internet a buscar versiones nuevas de npm en cada arranque.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
# Sin privilegios de root: la API no escribe en disco (los registros van a la salida estándar).
USER node
EXPOSE 3000
# Aplica las migraciones pendientes y arranca la API. Con exec, node recibe el SIGTERM de
# `docker compose stop` y cierra ordenado (WebSocket con 1001, temporizador detenido).
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/server.js"]
