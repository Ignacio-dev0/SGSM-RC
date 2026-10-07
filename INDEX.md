# INDEX · Mapa del código

Índice navegable de los archivos del proyecto. Para la visión general ver
[README.md](README.md); para la relación con el plan de trabajo,
[docs/trazabilidad.md](docs/trazabilidad.md).

## Raíz

| Archivo                                                                                                                  | Descripción                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [package.json](package.json)                                                                                             | Workspaces `backend` y `frontend`; scripts `dev:*`, `db:up`, `test`, `verificar` |
| [docker-compose.yml](docker-compose.yml)                                                                                 | PostgreSQL 17 de desarrollo (crea también `sgsm_test`)                           |
| [docker/postgres/init/](docker/postgres/init/)                                                                           | SQL que corre al crear el contenedor                                             |
| [eslint.config.mjs](eslint.config.mjs) · [.prettierrc.json](.prettierrc.json) · [tsconfig.base.json](tsconfig.base.json) | Convenciones de código (T002)                                                    |
| [.github/workflows/ci.yml](.github/workflows/ci.yml)                                                                     | CI: formato, lint, tipos y pruebas con PostgreSQL de servicio                    |

## Backend (`backend/`)

### Entrada y piezas comunes

| Archivo                                                                    | Símbolos                                                       | Descripción                                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [src/server.ts](backend/src/server.ts)                                     | —                                                              | Levanta la API en `PORT`                                                                      |
| [src/app.ts](backend/src/app.ts)                                           | `crearApp()`                                                   | Arma Express: seguridad de cabeceras, JSON, cookies, rutas de cada módulo y manejo de errores |
| [src/config.ts](backend/src/config.ts)                                     | `config`                                                       | Variables de entorno con valores por defecto ([docs/entorno.md](docs/entorno.md))             |
| [src/db.ts](backend/src/db.ts)                                             | `prisma`, `ClienteDb`                                          | Cliente único de Prisma; `ClienteDb` acepta cliente o transacción                             |
| [src/comun/errores.ts](backend/src/comun/errores.ts)                       | `ErrorApi`, `noEncontrado()`, `conflicto()`, `reglaNegocio()`… | Errores con código y estado HTTP                                                              |
| [src/comun/middleware-errores.ts](backend/src/comun/middleware-errores.ts) | `manejarErrores`, `rutaNoEncontrada`                           | Traduce errores al formato `{ error: { codigo, mensaje } }`                                   |
| [src/comun/validacion.ts](backend/src/comun/validacion.ts)                 | `validar()`                                                    | Valida con zod y responde 400 con detalles por campo                                          |
| [src/comun/paginacion.ts](backend/src/comun/paginacion.ts)                 | `leerPaginacion()`, `respuestaPaginada()`                      | Paginación de la convención de la API                                                         |
| [src/comun/parametros.ts](backend/src/comun/parametros.ts)                 | `idDeRuta()`                                                   | Lee `:id` numérico                                                                            |
| [src/comun/reloj.ts](backend/src/comun/reloj.ts)                           | `reloj.ahora()`                                                | Hora actual; las pruebas la reemplazan                                                        |

### Módulos (`src/modulos/`)

| Módulo         | Archivos                                                                                                                                                                                                                                                                                                                                                                                           | Descripción                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| auth           | [auth.rutas.ts](backend/src/modulos/auth/auth.rutas.ts), [auth.servicio.ts](backend/src/modulos/auth/auth.servicio.ts), [auth.middleware.ts](backend/src/modulos/auth/auth.middleware.ts), [tokens.ts](backend/src/modulos/auth/tokens.ts), [sesion.ts](backend/src/modulos/auth/sesion.ts), [contrasenas.ts](backend/src/modulos/auth/contrasenas.ts)                                             | Login, logout, sesión deslizante por inactividad, bloqueo por intentos (T105, T112)                               |
| seguridad      | [catalogo-permisos.ts](backend/src/modulos/seguridad/catalogo-permisos.ts), [permisos.ts](backend/src/modulos/seguridad/permisos.ts), [seguridad.rutas.ts](backend/src/modulos/seguridad/seguridad.rutas.ts)                                                                                                                                                                                       | Catálogo de permisos y roles, `requierePermiso()`, endpoints de roles y permisos (T106)                           |
| auditoria      | [auditoria.servicio.ts](backend/src/modulos/auditoria/auditoria.servicio.ts)                                                                                                                                                                                                                                                                                                                       | `registrarAuditoria()`, `cambios()`, `sanear()` (T104)                                                            |
| notificaciones | [notificaciones.servicio.ts](backend/src/modulos/notificaciones/notificaciones.servicio.ts), [notificaciones.rutas.ts](backend/src/modulos/notificaciones/notificaciones.rutas.ts)                                                                                                                                                                                                                 | Avisos a los administradores (T112)                                                                               |
| camas          | [camas.rutas.ts](backend/src/modulos/camas/camas.rutas.ts), [camas.servicio.ts](backend/src/modulos/camas/camas.servicio.ts)                                                                                                                                                                                                                                                                       | Camas y salas; `asignarCama()`, `liberarCama()`, `asignacionActiva()` (T201)                                      |
| pacientes      | [pacientes.rutas.ts](backend/src/modulos/pacientes/pacientes.rutas.ts), [pacientes.servicio.ts](backend/src/modulos/pacientes/pacientes.servicio.ts), [movimientos.servicio.ts](backend/src/modulos/pacientes/movimientos.servicio.ts), [historial.servicio.ts](backend/src/modulos/pacientes/historial.servicio.ts), [pacientes.esquemas.ts](backend/src/modulos/pacientes/pacientes.esquemas.ts) | Alta con cama, búsqueda sin tildes, modificación, reingreso, traslado, egreso con efectos e historial (T202–T210) |
| usuarios       | [usuarios.rutas.ts](backend/src/modulos/usuarios/usuarios.rutas.ts), [usuarios.servicio.ts](backend/src/modulos/usuarios/usuarios.servicio.ts), [usuarios.esquemas.ts](backend/src/modulos/usuarios/usuarios.esquemas.ts)                                                                                                                                                                          | ABM de usuarios y permisos adicionales (T109, CU01–CU05)                                                          |

### Base de datos y semillas

| Archivo                                                                    | Descripción                                                                                                                                   |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [prisma/schema.prisma](backend/prisma/schema.prisma)                       | Esquema completo (T101)                                                                                                                       |
| [prisma/migrations/](backend/prisma/migrations/)                           | Migraciones versionadas: esquema inicial, restricciones de negocio (T102), auditoría inalterable, extensión `unaccent` para buscar sin tildes |
| [prisma/seed.ts](backend/prisma/seed.ts)                                   | Semilla de desarrollo (`npm run db:sembrar -w backend`)                                                                                       |
| [src/semillas/catalogo-base.ts](backend/src/semillas/catalogo-base.ts)     | `sembrarSeguridad()`, `sembrarCatalogoBase()`: roles, permisos, salas, camas, insumos, tipos de estudio (T103)                                |
| [src/semillas/usuarios-prueba.ts](backend/src/semillas/usuarios-prueba.ts) | `USUARIOS_DE_PRUEBA`: un usuario por rol, solo desarrollo                                                                                     |

### Pruebas (`backend/tests/`)

| Archivo                                                                  | Descripción                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| [tests/soporte/preparar-base.ts](backend/tests/soporte/preparar-base.ts) | Vacía `sgsm_test` y aplica migraciones antes de la suite                       |
| [tests/soporte/base.ts](backend/tests/soporte/base.ts)                   | `limpiarBase()`                                                                |
| [tests/soporte/sesion.ts](backend/tests/soporte/sesion.ts)               | `crearUsuario()`, `agenteDe()`, `agenteConRol()`, `prepararBaseConSeguridad()` |
| [tests/soporte/fabricas.ts](backend/tests/soporte/fabricas.ts)           | Fábricas de usuarios, camas, pacientes e insumos                               |
| [tests/integracion/](backend/tests/integracion/)                         | Esquema, restricciones y semillas                                              |

Las pruebas de cada módulo están junto a su código (`*.test.ts`).

## Frontend (`frontend/`)

| Archivo                                                                                       | Símbolos                                                                                                                             | Descripción                                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| [src/main.tsx](frontend/src/main.tsx)                                                         | —                                                                                                                                    | Punto de entrada                                    |
| [src/App.tsx](frontend/src/App.tsx)                                                           | `App`                                                                                                                                | Proveedores: TanStack Query, tema, router, sesión   |
| [src/RutasApp.tsx](frontend/src/RutasApp.tsx)                                                 | `RutasApp`                                                                                                                           | Mapa de pantallas y permisos de cada una            |
| [src/tema.ts](frontend/src/tema.ts)                                                           | `tema`, `TAMANO_TACTIL_MINIMO`                                                                                                       | Diseño visual base (T009)                           |
| [src/api/cliente.ts](frontend/src/api/cliente.ts)                                             | `api`, `ErrorApi`, `erroresPorCampo()`                                                                                               | Cliente HTTP de la API                              |
| [src/api/tipos.ts](frontend/src/api/tipos.ts)                                                 | —                                                                                                                                    | Tipos de los datos de la API                        |
| [src/api/usuarios.ts](frontend/src/api/usuarios.ts)                                           | `usuariosApi`, `useRoles()`, `usePermisos()`                                                                                         | Llamadas del módulo de usuarios                     |
| [src/auth/ContextoSesion.tsx](frontend/src/auth/ContextoSesion.tsx)                           | `ProveedorSesion`                                                                                                                    | Sesión, login/logout, cierre por inactividad        |
| [src/auth/useSesion.ts](frontend/src/auth/useSesion.ts)                                       | `useSesion()`, `useUsuario()`                                                                                                        | Acceso a la sesión desde las pantallas              |
| [src/auth/useInactividad.ts](frontend/src/auth/useInactividad.ts)                             | `useInactividad()`                                                                                                                   | Temporizador de inactividad                         |
| [src/auth/RutaProtegida.tsx](frontend/src/auth/RutaProtegida.tsx)                             | `RutaProtegida`, `ConPermiso`                                                                                                        | Protección de rutas                                 |
| [src/navegacion/menu.tsx](frontend/src/navegacion/menu.tsx)                                   | `OPCIONES_DEL_MENU`, `opcionesDelMenu()`                                                                                             | Menú por permisos (T108)                            |
| [src/navegacion/Disposicion.tsx](frontend/src/navegacion/Disposicion.tsx)                     | `Disposicion`                                                                                                                        | Plantilla con menú, usuario, notificaciones y salir |
| [src/navegacion/CampanaNotificaciones.tsx](frontend/src/navegacion/CampanaNotificaciones.tsx) | `CampanaNotificaciones`                                                                                                              | Avisos al usuario                                   |
| [src/componentes/](frontend/src/componentes/)                                                 | `Boton`, `CampoTexto`, `Selector`, `Tabla`, `ModalConfirmacion`, `Alerta`, `EncabezadoPagina`, `PlantillaTablet`                     | Componentes reutilizables (T010)                    |
| [src/paginas/Ingreso.tsx](frontend/src/paginas/Ingreso.tsx)                                   | `Ingreso`                                                                                                                            | Inicio de sesión (T107)                             |
| [src/paginas/Inicio.tsx](frontend/src/paginas/Inicio.tsx)                                     | `Inicio`                                                                                                                             | Saludo y accesos directos por rol                   |
| [src/api/pacientes.ts](frontend/src/api/pacientes.ts)                                         | `pacientesApi`, `useCamasLibres()`, `useSalas()`, `usePaciente()`                                                                    | Llamadas del módulo de pacientes                    |
| [src/paginas/pacientes/](frontend/src/paginas/pacientes/)                                     | `BusquedaPacientes`, `RegistroPaciente`, `EdicionPaciente`, `FichaPaciente`, `DialogoTraslado`, `DialogoEgreso`, `HistorialPaciente` | Gestión de pacientes (T205–T209)                    |
| [src/paginas/usuarios/](frontend/src/paginas/usuarios/)                                       | `ListaUsuarios`, `FormularioUsuario`, `PermisosUsuario`                                                                              | Gestión de usuarios y permisos (T110, T111)         |
| [src/utilidades/](frontend/src/utilidades/)                                                   | `formatearFecha()`, `useRetardo()`…                                                                                                  | Formatos de fecha (hora de Argentina) y utilidades  |
| [src/pruebas/](frontend/src/pruebas/)                                                         | `servidor`, `renderizarApp()`, `ADMIN`/`MEDICO`/`ENFERMERO`                                                                          | Soporte de pruebas (MSW)                            |

## Documentación (`docs/`)

| Archivo                                       | Contenido                                    |
| --------------------------------------------- | -------------------------------------------- |
| [arquitectura.md](docs/arquitectura.md)       | Componentes y flujo de un pedido             |
| [api.md](docs/api.md)                         | Convención de la API (T011)                  |
| [endpoints.md](docs/endpoints.md)             | Endpoints por módulo                         |
| [modelo-de-datos.md](docs/modelo-de-datos.md) | DER, tablas y restricciones                  |
| [seguridad.md](docs/seguridad.md)             | Sesión, bloqueo, permisos por rol, auditoría |
| [diseno-visual.md](docs/diseno-visual.md)     | Tema para tablet (T009)                      |
| [componentes.md](docs/componentes.md)         | Guía de componentes (T010)                   |
| [entorno.md](docs/entorno.md)                 | Variables de entorno                         |
| [pruebas.md](docs/pruebas.md)                 | Estrategia y ejecución de pruebas            |
| [supuestos.md](docs/supuestos.md)             | Supuestos de dominio y decisiones técnicas   |
| [trazabilidad.md](docs/trazabilidad.md)       | Tareas del plan → código → pruebas           |
