# Endpoints de la API

> Convención general (formato, errores, paginación): [api.md](api.md).
> Todos exigen sesión salvo los marcados como públicos. La columna **Permiso** indica el permiso
> que exige el endpoint ([seguridad.md](seguridad.md)).

## Sistema

| Método | Ruta         | Permiso | Descripción      |
| ------ | ------------ | ------- | ---------------- |
| GET    | `/api/salud` | público | Estado de la API |

## Autenticación — T105, T112 · CU06

| Método | Ruta               | Permiso | Descripción                                                                                             |
| ------ | ------------------ | ------- | ------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/login`  | público | `{ nombreUsuario, contrasena }` → usuario con permisos y `inactividadMinutos`; deja la cookie de sesión |
| POST   | `/api/auth/logout` | público | Borra la cookie (y audita si la sesión seguía vigente)                                                  |
| GET    | `/api/auth/sesion` | sesión  | Usuario de la sesión activa                                                                             |

Errores: `401 CREDENCIALES_INVALIDAS`, `423 CUENTA_BLOQUEADA` (`detalles.bloqueadoHasta`),
`401 NO_AUTENTICADO`.

## Usuarios — T109 · CU01–CU05

| Método | Ruta                                     | Permiso                                    | Descripción                                                                       |
| ------ | ---------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| GET    | `/api/usuarios?texto&rol&activo&pagina`  | `usuarios.gestionar`                       | Búsqueda paginada (texto: apellido, nombre, usuario o DNI)                        |
| GET    | `/api/usuarios/:id`                      | `usuarios.gestionar`                       | Detalle, con `permisosDelRol` y `permisosAdicionales`                             |
| POST   | `/api/usuarios`                          | `usuarios.gestionar`                       | Alta: `nombreUsuario, contrasena, dni, nombre, apellido, email?, matricula?, rol` |
| PATCH  | `/api/usuarios/:id`                      | `usuarios.gestionar`                       | Modificación parcial (incluye cambio de contraseña)                               |
| DELETE | `/api/usuarios/:id`                      | `usuarios.gestionar`                       | Baja lógica                                                                       |
| PUT    | `/api/usuarios/:id/permisos-adicionales` | `usuarios.permisos`                        | `{ permisos: string[] }` reemplaza los adicionales                                |
| GET    | `/api/roles`                             | `usuarios.gestionar` o `usuarios.permisos` | Roles con sus permisos                                                            |
| GET    | `/api/permisos`                          | `usuarios.gestionar` o `usuarios.permisos` | Catálogo de permisos                                                              |

Errores: `409 DNI_DUPLICADO`, `409 USUARIO_DUPLICADO`, `409 USUARIO_INACTIVO`,
`422 BAJA_PROPIA`.

## Notificaciones — T112

| Método | Ruta                            | Permiso | Descripción                                                |
| ------ | ------------------------------- | ------- | ---------------------------------------------------------- |
| GET    | `/api/notificaciones`           | sesión  | Últimas 50 del usuario, no leídas primero; `meta.noLeidas` |
| PATCH  | `/api/notificaciones/:id/leida` | sesión  | Marca una notificación propia como leída                   |
