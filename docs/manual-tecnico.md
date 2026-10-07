# Manual técnico · SGSM-RC

> E8 · T809 · RNF08. Puerta de entrada para quien instala, mantiene o continúa el desarrollo del
> sistema. Cada tema está desarrollado en su documento; acá está lo esencial y dónde seguir. El
> mapa del código está en [INDEX.md](../INDEX.md).

## Qué es y cómo está armado

Aplicación web para tablets con dos piezas y una base de datos, todo en una PC servidor del
hospital con Docker Compose:

| Pieza    | Tecnología                                                              | Dónde                 |
| -------- | ----------------------------------------------------------------------- | --------------------- |
| Interfaz | React 19, Vite 7, MUI 7, TanStack Query, react-router (router de datos) | `frontend/`           |
| API      | Node.js 22+, Express 5, TypeScript, Prisma 6, zod 4, `ws` (tiempo real) | `backend/`            |
| Base     | PostgreSQL 17                                                           | servicio `db`         |
| Proxy    | nginx: HTTPS con CA propia, encabezados de seguridad, WebSocket         | `frontend/nginx.conf` |

- Capas, módulos y rutas: [arquitectura.md](arquitectura.md).
- Convención de la API (respuestas, errores, paginación): [api.md](api.md); lista de endpoints y
  permisos: [endpoints.md](endpoints.md).
- Componentes de la interfaz y sus reglas: [componentes.md](componentes.md); dirección visual:
  [DESIGN.md](../DESIGN.md); producto, actores y glosario: [PRODUCT.md](../PRODUCT.md).

## Instalación

Paso a paso en [despliegue.md](despliegue.md#primera-instalación): preparar la PC, `.env` desde
`.env.ejemplo`, `bash scripts/certificado.sh`, `docker compose --profile completo up --build -d
--wait`, el **instalador** (`docker compose run --rm backend node dist/scripts/instalar.js`, con
el primer administrador y la carga de salas, catálogo y personal desde CSV: ejemplos en
[ejemplos/](ejemplos/)) y la CA en cada tablet (sin HTTPS la cámara no funciona).

Para desarrollar: [README](../README.md#instalación) (`npm install`, `npm run db:up`,
migraciones, semilla de prueba y los dos servidores).

## Modelo de datos

Tablas, relaciones, restricciones en la base (índices únicos parciales, `CHECK`, auditoría
inalterable) e índices de rendimiento: [modelo-de-datos.md](modelo-de-datos.md). Esquema:
[`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma); migraciones versionadas en
`backend/prisma/migrations/` (se aplican solas al arrancar la API con `prisma migrate deploy`).
**Nunca** correr `prisma migrate reset` sobre una base con datos.

## Variables de entorno

Todas, con su valor por defecto: [entorno.md](entorno.md). Las imprescindibles en producción:
`JWT_SECRETO`, `BIOMETRIA_CLAVE` (cifra el rostro: **guardar una copia fuera del servidor**; si se
pierde hay que volver a registrar todos los rostros), `POSTGRES_CLAVE`, el nombre y la IP del
servidor para el certificado.

## Respaldo y restauración

Respaldo diario automático (`pg_dump`, retención configurable) y a pedido con
`bash scripts/respaldar.sh`; restauración con `bash scripts/restaurar.sh` (pide confirmación y
hace un resguardo antes): [despliegue.md](despliegue.md#respaldos-t801). Copiar los respaldos
fuera de la PC con la frecuencia que defina el hospital.

## Operación diaria

- Estado de todo (contenedores, último respaldo, disco, certificado): `bash scripts/estado.sh`.
- Salud de la API (incluye la base): `GET /api/salud`.
- Actualizar a una versión nueva: `bash scripts/actualizar.sh` (respaldo, imágenes nuevas,
  migraciones, instalador para sincronizar permisos) y cómo volver atrás:
  [despliegue.md](despliegue.md#actualizar-a-una-versión-nueva).
- Rotar la clave biométrica: [seguridad.md](seguridad.md) y
  [despliegue.md](despliegue.md#rotar-la-clave-biométrica).

## Seguridad

Sesión en cookie httpOnly con cierre por inactividad, bloqueo por intentos, permisos por código,
auditoría inalterable, rostro cifrado con AES-256-GCM, encabezados y límites:
[seguridad.md](seguridad.md) (incluye riesgos residuales). Reconocimiento facial 1:1 y su
comprobante: [biometria.md](biometria.md).

## Módulos funcionales

| Módulo                             | Documento                            |
| ---------------------------------- | ------------------------------------ |
| Suministros (administrar, insumos) | [suministros.md](suministros.md)     |
| Recordatorios y tiempo real        | [recordatorios.md](recordatorios.md) |
| Estudios                           | [estudios.md](estudios.md)           |
| Reportes, estadísticas y auditoría | [reportes.md](reportes.md)           |

## Pruebas y calidad

`npm run verificar` (formato, lint, tipos y pruebas, lo mismo que CI) y las pruebas en navegador
contra el servidor real (`npm run e2e`): [pruebas.md](pruebas.md). Rendimiento con un año de
volumen y cómo volver a medirlo: [rendimiento.md](rendimiento.md).

## Decisiones, supuestos y trazabilidad

- Supuestos de dominio S1–S20 y decisiones técnicas D1–D8: [supuestos.md](supuestos.md); las
  siguientes están junto a cada diseño o módulo (D9–D106, numeradas por documento).
- Qué tarea del plan cubre cada parte, con su código y sus pruebas:
  [trazabilidad.md](trazabilidad.md).
- Manuales de uso: [manuales/](manuales/).
