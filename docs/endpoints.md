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
| POST   | `/api/usuarios/:id/reactivar`            | `usuarios.gestionar`                       | Deshace la baja (`409 USUARIO_ACTIVO` si ya estaba activo); se audita `REACTIVAR` |
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

## Catálogo de insumos y medicamentos — T303

| Método | Ruta                             | Permiso              | Descripción                                                             |
| ------ | -------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| GET    | `/api/insumos?texto&tipo&activo` | `catalogo.ver`       | Catálogo completo, sin paginar (es chico). `activo` por defecto `true`  |
| GET    | `/api/insumos/:id`               | `catalogo.ver`       | Un insumo                                                               |
| POST   | `/api/insumos`                   | `catalogo.gestionar` | Alta: `nombre, tipo (MEDICAMENTO / INSUMO), unidadMedida, presentacion` |
| PATCH  | `/api/insumos/:id`               | `catalogo.gestionar` | Modificación (incluye `activo: true` para reactivar)                    |
| DELETE | `/api/insumos/:id`               | `catalogo.gestionar` | Baja lógica                                                             |

Errores: `409 INSUMO_DUPLICADO` (mismo nombre y presentación).

## Prescripciones — T301, T302, T307 · CU17–CU19

| Método | Ruta                                       | Permiso                    | Descripción                                                                                                             |
| ------ | ------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/pacientes/:id/prescripciones?estado` | `prescripciones.ver`       | Prescripciones del paciente, vigentes primero, con `proximaToma` y `ultimasAdministraciones`                            |
| POST   | `/api/pacientes/:id/prescripciones`        | `prescripciones.gestionar` | Alta: `insumoId, dosis, unidadDosis, frecuenciaHoras, via, fechaInicio, fechaFin?, observaciones?, confirmarDuplicada?` |
| GET    | `/api/prescripciones/:id`                  | `prescripciones.ver`       | Detalle con `agenda` (tomas de las próximas 24 h)                                                                       |
| PATCH  | `/api/prescripciones/:id`                  | `prescripciones.gestionar` | Modificación de una vigente: dosis, unidad, frecuencia, vía, fin, observaciones + `motivo` obligatorio                  |
| POST   | `/api/prescripciones/:id/estado`           | `prescripciones.gestionar` | `{ estado, motivo }`: VIGENTE → SUSPENDIDA o FINALIZADA; SUSPENDIDA → VIGENTE o FINALIZADA                              |

Errores: `409 PACIENTE_NO_INTERNADO`, `422 NO_ES_MEDICAMENTO`, `422 MEDICAMENTO_NO_DISPONIBLE`,
`409 PRESCRIPCION_DUPLICADA` (`detalles.prescripciones`: las vigentes del mismo medicamento; se
vuelve a enviar con `confirmarDuplicada: true` para cargarla igual), `409 PRESCRIPCION_NO_VIGENTE`,
`409 TRANSICION_INVALIDA`, `422 FECHA_FIN_INVALIDA`.

**Horarios (T302).** La toma _k_ es `fechaInicio + k × frecuenciaHoras` (k ≥ 0) mientras no pase
`fechaFin`. `proximaToma` es la primera toma desde ahora (incluida la que corresponde justo
ahora) y solo existe si la prescripción está vigente. Código:
[`agenda.ts`](../backend/src/modulos/prescripciones/agenda.ts).

**Efecto sobre los recordatorios (E5).** Cuando la prescripción deja de estar vigente, o cambian
su frecuencia o su fin, los recordatorios pendientes se cancelan (el temporizador de E5 los
volverá a generar con la agenda nueva).

Acciones de auditoría: `CREAR`, `MODIFICAR` (con el motivo en `detalle`), `SUSPENDER`,
`REANUDAR`, `FINALIZAR` (Prescripcion); `CREAR`, `MODIFICAR`, `BAJA` (Insumo).

## Biometría — T403, T404, T407 · CU07–CU10

| Método | Ruta                               | Permiso               | Descripción                                                                                                                   |
| ------ | ---------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/biometria/usuarios`          | `biometria.gestionar` | Personal activo con `registrado` y `actualizadoEn`                                                                            |
| GET    | `/api/biometria/usuarios/:id`      | `biometria.gestionar` | Estado biométrico de un usuario, con nombre, usuario y rol                                                                    |
| GET    | `/api/biometria/usuarios/:id/foto` | `biometria.gestionar` | Foto de referencia (sin caché)                                                                                                |
| PUT    | `/api/biometria/usuarios/:id`      | `biometria.gestionar` | Registra o actualiza: `{ patron: number[128], foto: dataURL }`                                                                |
| DELETE | `/api/biometria/usuarios/:id`      | `biometria.gestionar` | Elimina patrón y foto                                                                                                         |
| POST   | `/api/biometria/validar`           | sesión                | `{ patron, operacion? }` → `{ valido: true, validacionToken, similitud }` o `{ valido: false, intentosRestantes, cancelada }` |

Errores: `422 SIN_BIOMETRIA`. Acciones de auditoría: `REGISTRAR_BIOMETRIA`,
`ACTUALIZAR_BIOMETRIA`, `ELIMINAR_BIOMETRIA` (DatoBiometrico), `VALIDACION_FACIAL_FALLIDA`,
`OPERACION_CANCELADA` (Usuario).

## Suministros — T408–T412 · CU20–CU23

| Método | Ruta                                                                  | Permiso                 | Descripción                                                                           |
| ------ | --------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| POST   | `/api/suministros/medicamentos`                                       | `suministros.registrar` | `{ pacienteId, prescripcionId, cantidad?, observaciones?, validacionToken }`          |
| POST   | `/api/suministros/insumos`                                            | `suministros.registrar` | `{ pacienteId, items: [{ insumoId, cantidad }], observaciones?, validacionToken }`    |
| GET    | `/api/suministros?pacienteId&usuarioId&tipoInsumo&desde&hasta&pagina` | `suministros.ver`       | Historial paginado, lo más reciente primero                                           |
| GET    | `/api/suministros/responsables`                                       | `suministros.ver`       | Usuarios que registraron suministros (para el filtro)                                 |
| GET    | `/api/suministros/:id`                                                | `suministros.ver`       | Detalle, con `tomaProgramada` y `corregibleHasta`                                     |
| PATCH  | `/api/suministros/:id`                                                | `suministros.corregir`  | `{ motivo, cantidad? \| items?, observaciones?, validacionToken }` dentro de las 24 h |

Errores: `403 VALIDACION_FACIAL_REQUERIDA` (falta, vencido, ajeno o ya usado),
`409 PACIENTE_NO_INTERNADO`, `422 SIN_PRESCRIPCION_VIGENTE`, `422 INSUMO_NO_DISPONIBLE`,
`422 FUERA_DE_PLAZO`, `422 CORRECCION_INVALIDA`, `422 SIN_CAMBIOS`. Acciones de auditoría:
`REGISTRAR`, `CORREGIR` (Suministro). Reglas en [suministros.md](suministros.md).
