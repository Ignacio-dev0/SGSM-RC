# Interfaz del SGSM-RC servida con nginx, para el entorno completo en Docker (T007, versión local).
FROM node:24-alpine AS construccion
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci -w frontend --include-workspace-root=false
COPY tsconfig.base.json ./
COPY frontend frontend
# camara (por defecto) o simulado para demostraciones sin cámara.
ARG VITE_BIOMETRIA_MODO=camara
ENV VITE_BIOMETRIA_MODO=$VITE_BIOMETRIA_MODO
RUN npm run build -w frontend

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=construccion /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
