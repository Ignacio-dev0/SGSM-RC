# Interfaz del SGSM-RC servida con nginx por HTTPS (T007, T802 · docs/despliegue.md).
# Se construye desde la raíz del repositorio: docker compose build
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
# Solo `vite build` (con los modelos de face-api del prebuild), sin el `tsc -b` de `npm run build`:
# ese chequeo incluye las pruebas, que importan los esquemas del backend (pruebas/contrato.ts) y
# acá no están. Los tipos los controlan `npm run verificar` y la CI antes de llegar al servidor.
RUN npm run prebuild -w frontend && npm exec -w frontend -- vite build
# Hashes de los <script> en línea de index.html (el del tema) para la CSP.
COPY docker/nginx/csp-scripts.mjs docker/nginx/
RUN node docker/nginx/csp-scripts.mjs frontend/dist/index.html > csp-scripts.txt

FROM nginx:1.27-alpine
# La configuración es una plantilla: al arrancar se reemplaza solo ${HTTPS_PUERTO} (el puerto
# HTTPS que ve el navegador, para la redirección desde HTTP).
ENV HTTPS_PUERTO=443 \
    NGINX_ENVSUBST_FILTER=HTTPS_PUERTO \
    TZ=America/Argentina/Buenos_Aires
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY docker/nginx/seguridad.conf /etc/nginx/snippets/seguridad.conf
COPY --from=construccion /app/csp-scripts.txt /tmp/csp-scripts.txt
RUN sed -i "s|__CSP_SCRIPTS__|$(cat /tmp/csp-scripts.txt)|" /etc/nginx/snippets/seguridad.conf \
    && rm /tmp/csp-scripts.txt
# Antes de nginx: si falta el certificado, lo dice claro (los certificados se montan desde
# docker/certificados/nginx, no van en la imagen).
COPY --chmod=755 docker/nginx/05-verificar-certificados.sh /docker-entrypoint.d/
COPY --from=construccion /app/frontend/dist /usr/share/nginx/html
EXPOSE 80 443
