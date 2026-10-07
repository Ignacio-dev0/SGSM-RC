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
`429 DEMASIADOS_INTENTOS` (límite de fallidos por IP: encabezado `Retry-After` y
`detalles.reintentarEnSegundos`; ver [seguridad.md](seguridad.md#límite-de-intentos-por-ip)),
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
| GET    | `/api/biometria/usuarios/:id/foto` | `biometria.gestionar` | Foto de referencia descifrada (sin caché, con su tipo)                                                                        |
| PUT    | `/api/biometria/usuarios/:id`      | `biometria.gestionar` | Registra o actualiza: `{ patron: number[128], foto: dataURL }`                                                                |
| DELETE | `/api/biometria/usuarios/:id`      | `biometria.gestionar` | Elimina patrón y foto                                                                                                         |
| POST   | `/api/biometria/validar`           | sesión                | `{ patron, operacion? }` → `{ valido: true, validacionToken, similitud }` o `{ valido: false, intentosRestantes, cancelada }` |

El patrón y la foto se guardan cifrados (T705 · [seguridad.md](seguridad.md#cifrado-del-dato-biométrico-en-reposo-rnf06)); la foto
tiene que ser de verdad del tipo declarado (JPEG, PNG o WebP) y el cuerpo del `PUT` puede llegar a
unos 715 KB.

Errores: `422 SIN_BIOMETRIA`, `500 BIOMETRIA_ILEGIBLE` (el dato guardado no se puede descifrar:
hay que registrar el rostro de nuevo). Acciones de auditoría: `REGISTRAR_BIOMETRIA`,
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

## Recordatorios — T501–T508 · CU24–CU28

Contrato completo (forma de las respuestas, prioridad, vencimiento, mensajes del tiempo real y
códigos de cierre) en [recordatorios.md](recordatorios.md).

| Método | Ruta                                    | Permiso                 | Descripción                                                                                                                                  |
| ------ | --------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/recordatorios?tipo&salaId`        | `recordatorios.ver`     | Para atender: `PENDIENTE` y `VENCIDO` de las últimas 12 h de pacientes internados, por urgencia; `meta.total`, `meta.urgentes`, `meta.ahora` |
| POST   | `/api/recordatorios/:id/no-administrar` | `recordatorios.atender` | `{ motivo }`: "No se administró"; la toma pasa a `ATENDIDO` con el motivo                                                                    |
| GET    | `/api/tiempo-real` (WebSocket)          | `recordatorios.ver`     | Avisos sin datos clínicos de que los recordatorios cambiaron; cierra con 4001 (sesión) o 4003 (permiso)                                      |

Atender por administración no cambia el contrato de `POST /api/suministros/medicamentos`: el
registro marca `ATENDIDO` el recordatorio de la toma más cercana dentro de su transacción.

Errores: `409 RECORDATORIO_NO_PENDIENTE` (`detalles.estado`), `422 NO_ES_TOMA`. Acciones de
auditoría: `GENERAR`, `VENCER`, `ATENDER`, `NO_ADMINISTRAR`, `CANCELAR` (Recordatorio). Un
recordatorio que vence genera una notificación `RECORDATORIO_VENCIDO` para cada administrador
activo (`GET /api/notificaciones`, T508). Los recordatorios de estudios se atienden confirmando
el estudio (`POST /api/estudios/:id/confirmar`).

## Estudios — T504, T509–T513 · CU29–CU31

Contrato completo (forma de un estudio, estados, efectos sobre los recordatorios y decisiones
D26–D35) en [estudios.md](estudios.md). El médico programa, enfermería confirma con su rostro
(S15).

| Método | Ruta                                 | Permiso              | Descripción                                                                                                          |
| ------ | ------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/tipos-estudio`                 | `estudios.ver`       | Tipos activos por nombre, con `preparacionPorDefecto`                                                                |
| GET    | `/api/pacientes/:id/estudios?estado` | `estudios.ver`       | Estudios del paciente: programados primero (el más próximo arriba), después el resto (el más reciente arriba)        |
| POST   | `/api/pacientes/:id/estudios`        | `estudios.gestionar` | Programar a un internado: `{ tipoEstudioId, fechaHora, nombre?, preparacion?, observaciones? }`                      |
| GET    | `/api/estudios/:id`                  | `estudios.ver`       | Detalle                                                                                                              |
| PATCH  | `/api/estudios/:id`                  | `estudios.gestionar` | Reprogramar un `PROGRAMADO`: `{ fechaHora }`; cancela sus recordatorios sin atender                                  |
| POST   | `/api/estudios/:id/cancelar`         | `estudios.gestionar` | `{ motivo }`: `PROGRAMADO` → `CANCELADO`; cancela sus recordatorios sin atender                                      |
| POST   | `/api/estudios/:id/confirmar`        | `estudios.confirmar` | `{ validacionToken, observaciones? }`: `PROGRAMADO` → `REALIZADO` y su recordatorio a `ATENDIDO` (misma transacción) |

Errores: `409 PACIENTE_NO_INTERNADO`, `409 ESTUDIO_NO_PROGRAMADO` (`detalles.estado`),
`422 TIPO_ESTUDIO_NO_DISPONIBLE`, `422 FECHA_ESTUDIO_INVALIDA` (más de 5 min en el pasado o más de
90 días adelante), `422 SIN_CAMBIOS`, `403 VALIDACION_FACIAL_REQUERIDA`. Acciones de auditoría:
`PROGRAMAR`, `REPROGRAMAR`, `CANCELAR`, `CONFIRMAR` (Estudio); `CANCELAR`, `ATENDER`
(Recordatorio). Reprogramar, cancelar y confirmar avisan al tiempo real si cambiaron
recordatorios.

## Reportes y estadísticas — T601–T603 · CU32–CU34

Contrato completo (parámetros, forma de las respuestas, archivos exportados y decisiones
D40–D49) en [reportes.md](reportes.md). Parámetros comunes: `desde` y `hasta` (días `AAAA-MM-DD`
en hora de Argentina, ambos incluidos; por defecto los últimos 7 días; como mucho 366), `salaId`
(sala en la que estaba el paciente en ese momento) y `tipo` (`MEDICAMENTO` o `INSUMO`).

| Método | Ruta                                            | Permiso             | Descripción                                                                                                                    |
| ------ | ----------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/reportes/suministros?…&agruparPor`        | `reportes.ver`      | Filas por `paciente` (por defecto), `insumo`, `usuario` o `dia` con suministros y unidades; `meta.parametros` y `meta.totales` |
| GET    | `/api/reportes/estadisticas?…`                  | `reportes.ver`      | Totales, 10 insumos más usados, consumo por tipo, evolución diaria (días en cero incluidos) y recordatorios del período        |
| GET    | `/api/reportes/suministros/exportar?formato&…`  | `reportes.exportar` | Archivo `pdf` o `xlsx` del reporte: `Content-Disposition: attachment; filename="reporte-suministros-AAAAMMDD.pdf"`             |
| GET    | `/api/reportes/estadisticas/exportar?formato&…` | `reportes.exportar` | Archivo `pdf` o `xlsx` de las estadísticas: `estadisticas-AAAAMMDD.xlsx`                                                       |

Errores: `400 VALIDACION` (fechas, rango de más de 366 días, agrupación o formato),
`404 NO_ENCONTRADO` (la sala no existe). Acción de auditoría: `EXPORTAR` (Reporte, con los
parámetros en `valorNuevo` y en `detalle`).

## Auditoría — T604 · CU35

| Método | Ruta                                                                           | Permiso         | Descripción                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/auditoria?desde&hasta&usuarioId&pacienteId&accion&entidad&pagina&tamano` | `auditoria.ver` | De la más reciente a la más vieja; `tamano` 50 por defecto, 100 como mucho (acepta también `porPagina`); usuario, paciente y valores con las claves sensibles ocultas |
| GET    | `/api/auditoria/opciones`                                                      | `auditoria.ver` | `{ acciones, entidades }` que hay en la base, para armar los filtros                                                                                                  |

Contrato en [reportes.md](reportes.md#auditoría).
