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

## Camas y salas — T201 · CU15 · RN02

| Método | Ruta                       | Permiso         | Descripción                                                                                                     |
| ------ | -------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/camas?salaId&estado` | `pacientes.ver` | Camas con sala, `ocupada` y el paciente que la ocupa. `estado`: `libre` (habilitada y sin paciente) u `ocupada` |
| GET    | `/api/salas`               | `pacientes.ver` | Salas con cantidad de camas y camas libres                                                                      |

## Pacientes — T202–T210 · CU11–CU16

| Método | Ruta                                                          | Permiso               | Descripción                                                                                                                    |
| ------ | ------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/pacientes?texto&dni&apellido&cama&salaId&estado&pagina` | `pacientes.ver`       | Búsqueda paginada. `texto` busca por apellido o nombre (sin importar tildes), por comienzo del DNI o por número de cama actual |
| GET    | `/api/pacientes/:id`                                          | `pacientes.ver`       | Ficha con la cama actual                                                                                                       |
| POST   | `/api/pacientes`                                              | `pacientes.gestionar` | Alta con cama: datos personales + `camaId` (+ `fechaIngreso` opcional)                                                         |
| PATCH  | `/api/pacientes/:id`                                          | `pacientes.gestionar` | Modificación de datos personales                                                                                               |
| POST   | `/api/pacientes/:id/reingresar`                               | `pacientes.gestionar` | Reingreso de un egresado en su misma ficha: `camaId` + datos a actualizar                                                      |
| POST   | `/api/pacientes/:id/trasladar`                                | `pacientes.gestionar` | `{ camaId }`: cierra la asignación actual y abre la nueva (motivo TRASLADO)                                                    |
| POST   | `/api/pacientes/:id/egresar`                                  | `pacientes.gestionar` | `{ motivo, fechaEgreso? }`: baja lógica con los efectos de T210                                                                |
| GET    | `/api/pacientes/:id/historial?desde&hasta`                    | `pacientes.ver`       | Asignaciones de cama, modificaciones (auditoría) y suministros                                                                 |

Errores: `409 DNI_DUPLICADO`, `409 PACIENTE_EGRESADO` (`detalles.pacienteId`: ofrecer el reingreso),
`409 CAMA_OCUPADA`, `422 CAMA_NO_HABILITADA`, `409 PACIENTE_INTERNADO`, `409 PACIENTE_NO_INTERNADO`,
`422 MISMA_CAMA`, `422 FECHA_EGRESO_INVALIDA`.

**Efectos del egreso (T210)**, en una sola transacción: libera la cama, pasa las prescripciones
`VIGENTE` a `SUSPENDIDA` (motivo "Egreso del paciente: …"), cancela los estudios `PROGRAMADO` y
los recordatorios `PENDIENTE`. Cada cambio queda auditado.

Acciones de auditoría del módulo: `CREAR`, `MODIFICAR`, `REINGRESAR`, `TRASLADAR`, `EGRESAR`
(Paciente), `ASIGNAR_CAMA`, `LIBERAR_CAMA` (AsignacionCama), `SUSPENDER` (Prescripcion),
`CANCELAR` (Estudio, Recordatorio).
