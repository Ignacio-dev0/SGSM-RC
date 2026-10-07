# SGSM-RC

**Sistema de Gestión de Suministros Médicos y Recordatorios Clínicos** para el Hospital Zonal
Especializado en Rehabilitación "El Dique". Seminario Integrador 2026 — UTN Facultad Regional
La Plata.

Aplicación web para tablets: el personal de enfermería registra la administración de
medicamentos e insumos al lado de la cama, confirmando su identidad con reconocimiento facial,
sobre las prescripciones que carga el equipo médico.

## Estado del prototipo

| Etapa | Contenido                                                      | Estado                                      |
| ----- | -------------------------------------------------------------- | ------------------------------------------- |
| E0    | Entorno de trabajo, convenciones, componentes base             | ✅ (despliegue en la nube fuera de alcance) |
| E1    | Base de datos, inicio de sesión, permisos, auditoría, usuarios | ✅                                          |
| E2    | Pacientes y camas                                              | en curso                                    |
| E3    | Prescripciones y catálogo                                      | pendiente                                   |
| E4    | Biometría y registro de suministros                            | pendiente                                   |
| E5–E8 | Recordatorios, reportes, integración, despliegue               | fuera del prototipo                         |

El detalle de qué tarea del plan cubre cada parte está en [docs/trazabilidad.md](docs/trazabilidad.md).

## Requisitos

- **Node.js 22 o superior** (probado con Node 24) y npm.
- **Docker** con Docker Compose (para PostgreSQL).

## Instalación

```bash
git clone <url-del-repositorio> sgsm-rc
cd sgsm-rc
npm install                                   # instala backend y frontend (workspaces)
cp backend/.env.example backend/.env          # en Windows: copy backend\.env.example backend\.env
npm run db:up                                 # levanta PostgreSQL en Docker (puerto 5432)
npm run db:aplicar -w backend                 # crea las tablas (migraciones)
npm run db:sembrar -w backend                 # carga roles, camas, catálogo y usuarios de prueba
```

## Ejecutar en desarrollo

En dos terminales:

```bash
npm run dev:backend      # API en http://localhost:3000
npm run dev:frontend     # interfaz en http://localhost:5173
```

Abrir <http://localhost:5173> e ingresar con uno de los **usuarios de prueba** que crea la
semilla (uno por rol). Los nombres de usuario y las contraseñas están en
[`backend/src/semillas/usuarios-prueba.ts`](backend/src/semillas/usuarios-prueba.ts). Son solo
para desarrollo: la semilla se niega a correr con `NODE_ENV=production`.

## Pruebas y calidad

```bash
npm test                 # pruebas de backend (Jest) y frontend (Vitest)
npm run verificar        # formato + lint + tipos + pruebas (lo que corre CI)
```

Las pruebas del backend usan la base `sgsm_test` del mismo contenedor. Ver
[docs/pruebas.md](docs/pruebas.md).

## Estructura

```
backend/     API REST: Node.js + Express 5 + TypeScript + Prisma (PostgreSQL)
frontend/    Interfaz para tablet: React 19 + Vite + MUI
docs/        Documentación técnica
docker/      Scripts de inicialización de PostgreSQL
```

El mapa archivo por archivo está en [INDEX.md](INDEX.md).

## Documentación

| Documento                                          | Contenido                            |
| -------------------------------------------------- | ------------------------------------ |
| [INDEX.md](INDEX.md)                               | Mapa del código                      |
| [docs/arquitectura.md](docs/arquitectura.md)       | Cómo está armado el sistema          |
| [docs/api.md](docs/api.md)                         | Convención de la API                 |
| [docs/endpoints.md](docs/endpoints.md)             | Endpoints por módulo                 |
| [docs/modelo-de-datos.md](docs/modelo-de-datos.md) | DER y restricciones                  |
| [docs/seguridad.md](docs/seguridad.md)             | Sesión, permisos por rol y auditoría |
| [docs/diseno-visual.md](docs/diseno-visual.md)     | Tema visual para tablets             |
| [docs/componentes.md](docs/componentes.md)         | Guía de componentes                  |
| [docs/entorno.md](docs/entorno.md)                 | Variables de entorno                 |
| [docs/pruebas.md](docs/pruebas.md)                 | Estrategia de pruebas                |
| [docs/supuestos.md](docs/supuestos.md)             | Supuestos y decisiones técnicas      |
| [docs/trazabilidad.md](docs/trazabilidad.md)       | Tareas del plan → código → pruebas   |

## Convenciones

- Código, base de datos y documentación en español; TypeScript estricto.
- Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) y la tarea del
  plan en el pie (`Refs: T202, CU11`).
- Ramas: `main` (estable) y `develop` (integración). Plantilla de PR en
  [.github/pull_request_template.md](.github/pull_request_template.md).
