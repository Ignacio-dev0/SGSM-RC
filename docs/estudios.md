# Estudios programados

> E5 · T504, T509–T513 · CU29–CU31 (casos de uso inferidos) · S15. Versión mínima del prototipo
> ([diseno-e5.md](diseno-e5.md)). Este documento es el **contrato** entre el backend y el frontend
> para los estudios: forma de las respuestas, estados, errores y auditoría. Sus recordatorios
> tienen la forma de [recordatorios.md](recordatorios.md).
>
> Código: [`modulos/estudios/`](../backend/src/modulos/estudios/) (esquemas, servicio,
> confirmación y rutas); la generación de sus recordatorios está en el ciclo de
> [`modulos/recordatorios/`](../backend/src/modulos/recordatorios/ciclo.servicio.ts).

## Cómo funciona

- **Programar** (T511 · S15): el médico elige un **tipo de estudio** del catálogo
  (`GET /api/tipos-estudio`) y la fecha y hora. Solo a pacientes **internados**. El nombre y la
  preparación son opcionales: si no se indican, se usan los del tipo (D27).
- **Recordatorio** (T504 · D31): el temporizador genera **un** recordatorio por estudio
  `PROGRAMADO` de un paciente internado cuando su hora cae entre 30 min antes y 30 min después de
  ahora (la misma ventana que las tomas, `RECORDATORIO_ANTICIPACION_MIN`). Prioridad **siempre
  `MEDIA`**; vence igual que el de una toma (60 min después de generado, avisa a los
  administradores con "estudio _nombre_ de las HH:mm"). Programar no crea el recordatorio: aparece
  en el próximo ciclo (60 s como mucho).
- **Reprogramar** (T512): cambia la hora de un estudio programado. Sus recordatorios sin atender
  (pendiente y también vencido, D28) se cancelan; el temporizador genera el de la hora nueva
  cuando entra en la ventana.
- **Cancelar** (T512): con motivo; cancela el estudio y sus recordatorios sin atender.
- **Confirmar con el rostro** (T513 · S15): enfermería confirma que el estudio se realizó, con el
  comprobante de su validación facial (de quien confirma, vigente 120 s y de un solo uso, como en
  suministros: [biometria.md](biometria.md)). En la **misma transacción** el estudio pasa a
  `REALIZADO` (`realizadoEn` = ahora, `confirmadoPor`) y su recordatorio pendiente o vencido a
  `ATENDIDO` (D29). Así se **atiende** un recordatorio de estudio: "No se administró" no corresponde
  (`422 NO_ES_TOMA`).
- **Egreso** (T210): cancela los estudios programados (motivo "Egreso del paciente: …") y los
  recordatorios pendientes del paciente, incluidos los de estudio.
- Toda acción que cambia recordatorios avisa al **tiempo real** después del commit (un mensaje
  `recordatorios` con `nuevos: 0` y `vencidos: 0`; ver [recordatorios.md](recordatorios.md)).

```
PROGRAMADO ─ reprogramar (médico) ────────────────────► PROGRAMADO (otra fechaHora)
PROGRAMADO ─ confirmar con el rostro (enfermería) ────► REALIZADO (realizadoEn, confirmadoPor)
PROGRAMADO ─ cancelar con motivo (médico) ────────────► CANCELADO (motivoCancelacion)
PROGRAMADO ─ egreso del paciente (T210) ──────────────► CANCELADO ("Egreso del paciente: …")
```

Un estudio `REALIZADO` o `CANCELADO` ya no cambia (`409 ESTUDIO_NO_PROGRAMADO`). La base lo
garantiza ([modelo-de-datos.md](modelo-de-datos.md)): un realizado tiene `realizado_en` y
`confirmado_por_id`; un cancelado, `motivo_cancelacion`.

## Permisos (S15)

| Permiso              | Roles                       | Para qué                                  |
| -------------------- | --------------------------- | ----------------------------------------- |
| `estudios.ver`       | los tres                    | Tipos de estudio, estudios de un paciente |
| `estudios.gestionar` | médico y administración     | Programar, reprogramar y cancelar         |
| `estudios.confirmar` | enfermería y administración | Confirmar con el rostro que se realizó    |

## API

Endpoints en [endpoints.md](endpoints.md). Esquemas de entrada (zod, compartidos con el frontend):
[`estudios.esquemas.ts`](../backend/src/modulos/estudios/estudios.esquemas.ts). Todas las fechas
viajan en ISO 8601 con zona (`2026-10-08T10:00:00-03:00` o en UTC).

### `GET /api/tipos-estudio` — `estudios.ver`

Los tipos **activos**, por nombre: `{ data: [{ id, nombre, preparacionPorDefecto }] }`. La
semilla carga ocho (laboratorio, radiografía, ecografía, electrocardiograma, tomografía,
resonancia, videodeglución, interconsulta).

### `GET /api/pacientes/:id/estudios?estado` — `estudios.ver`

`{ data: Estudio[] }`: primero los `PROGRAMADO` (el más próximo arriba) y después los realizados
y cancelados (el más reciente arriba). `estado` opcional: `PROGRAMADO`, `REALIZADO` o
`CANCELADO`.

### `POST /api/pacientes/:id/estudios` — `estudios.gestionar`

```json
{
  "tipoEstudioId": 3,
  "fechaHora": "2026-10-08T10:00:00-03:00",
  "nombre": "Rx de tórax frente y perfil",
  "preparacion": "Retirar alhajas",
  "observaciones": "Trasladar en silla de ruedas"
}
```

- `nombre` (hasta 120): si se omite o va vacío, el del tipo.
- `preparacion` (hasta 500): si se **omite**, la preparación por defecto del tipo; `null` o `""`,
  sin preparación.
- `observaciones` (hasta 500): opcional.
- `fechaHora`: desde 5 min antes de ahora hasta 90 días después (D26).

Responde `201 { data: Estudio }`.

### `GET /api/estudios/:id` — `estudios.ver`

`{ data: Estudio }`.

### `PATCH /api/estudios/:id` — `estudios.gestionar` (reprogramar)

`{ "fechaHora": "2026-10-08T15:00:00-03:00" }`. Solo un `PROGRAMADO`; la misma hora responde
`422 SIN_CAMBIOS`. Cancela sus recordatorios sin atender. Responde `200 { data: Estudio }`.

### `POST /api/estudios/:id/cancelar` — `estudios.gestionar`

`{ "motivo": "Se suspendió el turno" }` (3 a 255 caracteres, se recortan los espacios). Solo un
`PROGRAMADO`. Cancela sus recordatorios sin atender. Responde `200 { data: Estudio }`.

### `POST /api/estudios/:id/confirmar` — `estudios.confirmar` (con el rostro)

`{ "validacionToken": "…", "observaciones": "Sin novedad" }`. El comprobante sale de
`POST /api/biometria/validar` (con `operacion`, por ejemplo "Confirmar estudio Rx de tórax").
Solo un `PROGRAMADO`; se puede confirmar antes de su hora. Responde `200 { data: Estudio }` con
`estado: REALIZADO`.

### Forma de un estudio

```ts
interface Estudio {
  id: number;
  pacienteId: number;
  tipoEstudio: { id: number; nombre: string };
  /** El del tipo o el que precisó el médico ("Rx de tórax frente y perfil"). */
  nombre: string;
  /** Fecha y hora programada (ISO 8601 en UTC, como todas las fechas de la API). */
  fechaHora: string;
  preparacion: string | null;
  /** De quien lo programó. */
  observaciones: string | null;
  estado: 'PROGRAMADO' | 'REALIZADO' | 'CANCELADO';
  /** Solo en un CANCELADO (también por el egreso). */
  motivoCancelacion: string | null;
  /** Cuándo se confirmó que se realizó (solo en un REALIZADO). */
  realizadoEn: string | null;
  confirmadoPor: { id: number; nombre: string } | null; // nombre: "Apellido, Nombre"
  /** De quien confirmó. */
  observacionesRealizacion: string | null;
  creadoPor: { id: number; nombre: string };
  creadoEn: string;
}
```

El recordatorio de un estudio trae `estudio: { id, nombre, tipoEstudio, preparacion }` (con
`tipoEstudio` como texto) y `prescripcion: null`; el panel lo atiende abriendo la confirmación con
`estudio.id`.

### Errores

| HTTP | `codigo`                      | Cuándo                                                                          |
| ---- | ----------------------------- | ------------------------------------------------------------------------------- |
| 400  | `VALIDACION`                  | Cuerpo o filtro inválido (`detalles` con el campo y el mensaje)                 |
| 401  | `NO_AUTENTICADO`              | Sin sesión o sesión vencida                                                     |
| 403  | `SIN_PERMISO`                 | Sin el permiso del endpoint                                                     |
| 403  | `VALIDACION_FACIAL_REQUERIDA` | Confirmar sin comprobante, vencido, de otra persona o ya usado                  |
| 404  | `NO_ENCONTRADO`               | El paciente, el estudio o el tipo de estudio no existe                          |
| 409  | `PACIENTE_NO_INTERNADO`       | Programar a un paciente egresado                                                |
| 409  | `ESTUDIO_NO_PROGRAMADO`       | Reprogramar, cancelar o confirmar uno realizado o cancelado (`detalles.estado`) |
| 422  | `TIPO_ESTUDIO_NO_DISPONIBLE`  | El tipo está dado de baja                                                       |
| 422  | `FECHA_ESTUDIO_INVALIDA`      | Más de 5 min en el pasado o más de 90 días adelante                             |
| 422  | `SIN_CAMBIOS`                 | Reprogramar a la misma fecha y hora                                             |

Un pedido rechazado por las reglas del estudio no consume el comprobante facial (D33): se puede
reintentar con el mismo mientras esté vigente.

### Auditoría

| Acción        | Entidad      | Cuándo                                                                                  |
| ------------- | ------------ | --------------------------------------------------------------------------------------- |
| `PROGRAMAR`   | Estudio      | Alta: tipo, nombre, fecha, preparación y observaciones                                  |
| `REPROGRAMAR` | Estudio      | Fecha anterior y nueva                                                                  |
| `CANCELAR`    | Estudio      | Con el motivo en `valorNuevo` y en `detalle` (el egreso también lo audita)              |
| `CONFIRMAR`   | Estudio      | `REALIZADO`, `realizadoEn`, `validadoBiometricamente: true`; observaciones en `detalle` |
| `CANCELAR`    | Recordatorio | Uno por recordatorio, al reprogramar o cancelar el estudio (D34)                        |
| `ATENDER`     | Recordatorio | Uno por recordatorio, al confirmar el estudio, con el usuario que confirmó              |
| `GENERAR`     | Recordatorio | El temporizador lo crea (sin usuario; `valorNuevo.estudioId`)                           |
| `VENCER`      | Recordatorio | Pasó el tiempo sin confirmarse (sin usuario)                                            |

## Decisiones

Continúan las de [recordatorios.md](recordatorios.md) (D15–D25). Tomadas al implementar el backend
de la fase 3.

| #   | Decisión                                                                                                                                                                                                                                                                                                                                       | Por qué                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D26 | La fecha "razonable" la controla el servicio con el reloj del servidor: desde 5 min antes de ahora hasta 90 días después (`422 FECHA_ESTUDIO_INVALIDA`). El esquema zod solo exige ISO 8601 con zona.                                                                                                                                          | El esquema es contrato compartido con el frontend y no puede depender de la hora (ni del reloj simulado de las pruebas). 5 min absorben el reloj de la tablet (R6); 90 días cubren una internación.    |
| D27 | Nombre y preparación son opcionales al programar: por defecto, los del tipo. `preparacion` omitida = la del tipo; `null` o vacía = sin preparación.                                                                                                                                                                                            | El médico elige el tipo y listo; puede precisar el estudio sin un catálogo más fino.                                                                                                                   |
| D28 | Reprogramar y cancelar un estudio cancelan sus recordatorios `PENDIENTE` **y `VENCIDO`** (el vencido conserva `vencidoEn`). En una toma, el vencido queda para atenderlo tarde.                                                                                                                                                                | El recordatorio de una hora que ya no vale no se puede atender (un estudio se atiende confirmándolo) y quedaría 12 h en el panel; además, el índice parcial impediría volver a recordar esa hora.      |
| D29 | Confirmar guarda `realizadoEn` = hora del servidor al confirmar (no hay `confirmadoEn` aparte) y se puede hacer antes de la hora programada. Atiende todos los recordatorios sin atender del estudio con `atendidoEn` = `realizadoEn`; si todavía no hay recordatorio, igual confirma.                                                         | Como D24: el estudio pudo adelantarse. Una sola hora, la del servidor (R6).                                                                                                                            |
| D30 | Reprogramar, cancelar y confirmar **esperan** el candado del ciclo (`pg_advisory_xact_lock`, el mismo número que el ciclo pide sin esperar). También el egreso y suspender, finalizar o modificar una prescripción, que cancelan recordatorios pendientes ([`cancelacion.test.ts`](../backend/src/modulos/recordatorios/cancelacion.test.ts)). | Sin él, un ciclo que está insertando el recordatorio y una cancelación simultánea dejan un pendiente de un estudio cancelado (la cancelación no ve la fila sin confirmar). El ciclo saltea ese minuto. |
| D31 | El recordatorio del estudio lo genera solo el temporizador, con la ventana, el vencimiento y la auditoría de las tomas y prioridad `MEDIA` fija (S10); programar no lo crea.                                                                                                                                                                   | Una sola regla de generación y un solo `INSERT … ON CONFLICT DO NOTHING` por ciclo; aparece en el siguiente ciclo (≤ 60 s).                                                                            |
| D32 | Columnas nuevas `observaciones` (quien programa) y `observaciones_realizacion` (quien confirma); `CHECK`: realizado con `realizado_en` y `confirmado_por_id`, cancelado con `motivo_cancelacion`.                                                                                                                                              | Cada observación queda con su momento y su autor; la base es la última barrera (D5).                                                                                                                   |
| D33 | Se comprueba que el estudio exista y esté programado **antes** de consumir el comprobante facial.                                                                                                                                                                                                                                              | Un pedido que se iba a rechazar no gasta la validación (como en suministros).                                                                                                                          |
| D34 | Los recordatorios de un estudio se auditan uno por uno (`CANCELAR`, `ATENDER` con `entidadId`), no como grupo.                                                                                                                                                                                                                                 | Un estudio tiene uno (a lo sumo dos) por vez: queda claro cuál se canceló o atendió.                                                                                                                   |
| D35 | El listado muestra primero los programados (el más próximo arriba) y después el resto (el más reciente arriba).                                                                                                                                                                                                                                | Lo que hay que preparar está arriba; la historia, de lo más nuevo a lo más viejo.                                                                                                                      |

## Pruebas

- [`estudios.esquemas.test.ts`](../backend/src/modulos/estudios/estudios.esquemas.test.ts): cuerpos
  válidos e inválidos con sus mensajes.
- [`estudios.test.ts`](../backend/src/modulos/estudios/estudios.test.ts): tipos, programar (fechas
  límite, internados, tipo de baja), listado y detalle, reprogramar y cancelar (recordatorios,
  auditoría y aviso después del commit) y permisos de los tres roles.
- [`confirmacion.test.ts`](../backend/src/modulos/estudios/confirmacion.test.ts): confirmar con el
  rostro (comprobante ajeno, usado o faltante), recordatorio atendido en la misma transacción,
  flujo completo programar → temporizador → panel → confirmar, y el candado del ciclo (D30).
- [`ciclo.test.ts`](../backend/src/modulos/recordatorios/ciclo.test.ts) · "estudios (T504)":
  generación con reloj simulado, prioridad fija, vencimiento con aviso, recuperación tras una
  caída, estudios cancelados, realizados o de egresados, y reprogramados.
- [`restricciones.test.ts`](../backend/tests/integracion/restricciones.test.ts): los `CHECK` de
  la migración `estudios_e5`.

## Interfaz

Pestaña **Estudios** de la ficha del paciente (`/pacientes/:id?pestana=estudios`, con
`estudios.ver`). Código en [`paginas/estudios/`](../frontend/src/paginas/estudios/) y
[`api/estudios.ts`](../frontend/src/api/estudios.ts) (tipos y llamadas).

- **Lista** (`EstudiosPaciente`, `TarjetasEstudios`): una tarjeta por estudio en una sola columna
  (en teléfono los datos y los botones también van en una columna). Dos secciones en el orden del
  servidor (D35): **Programados** y **Realizados y cancelados**. Cada tarjeta: nombre, tipo (si el
  nombre lo precisa), fecha y hora en 24 h sin cortes, preparación, observaciones, quién programó;
  en el realizado, quién confirmó y cuándo (y sus observaciones); en el cancelado, el motivo.
  Carga, error con Reintentar y vacío ("No tiene estudios programados", con Programar estudio a
  quien puede) son estados distintos.
- **Estado**: `ChipEstadoEstudio`, con la regla de `estadosChip.ts` pero aparte de `ESTADOS_CHIP`
  (es propio de los estudios): Programado con contorno neutro; Realizado y Cancelado con relleno
  neutro (cerrados). Nunca verde; la etiqueta dice el estado.
- **Acciones**, solo en un `PROGRAMADO` y según el permiso: Programar estudio (`gestionar`, solo
  paciente internado), Reprogramar y Cancelar estudio (`gestionar`), Confirmar que se realizó
  (`confirmar`). El botón de cada tarjeta nombra el estudio para el lector de pantalla.
- **Programar** (`DialogoProgramarEstudio`): tipo con el selector nativo, fecha y hora
  (`datetime-local`, revisada mientras se elige: "entre 5 min atrás y 90 días adelante"), nombre y
  preparación precargados del tipo (al cambiar de tipo se reemplaza lo precargado, no lo escrito a
  mano; preparación borrada = sin preparación) y observaciones. Foco en el primer error.
- **Reprogramar**: `ModalConfirmacion` con la fecha actual cargada; no se confirma hasta elegir
  otra. **Cancelar**: `ModalConfirmacion` peligroso con motivo obligatorio y "Volver" (no
  "Cancelar", que se confundiría con la acción).
- **Confirmar** (`useConfirmacionEstudio`, reutilizable desde el panel de recordatorios): pide el
  estudio por id (estado actual), muestra qué se confirma y al paciente (nombre, DNI y cama), pide
  el rostro con `useValidacionFacial` como en suministros y manda el comprobante.
- **Errores en palabras**: `PACIENTE_NO_INTERNADO`, `TIPO_ESTUDIO_NO_DISPONIBLE` (en el campo, y se
  vuelve a pedir la lista de tipos), `FECHA_ESTUDIO_INVALIDA` y `SIN_CAMBIOS` (en el campo de la
  fecha), `VALIDACION_FACIAL_REQUERIDA` ("La validación del rostro venció o no corresponde; vuelva
  a validarla") y `409 ESTUDIO_NO_PROGRAMADO` ("Este estudio ya fue confirmado o cancelado por otra
  persona": cierra el diálogo, avisa y recarga).
- Después de cada acción se renuevan `['estudios']`, `['estudio', id]`, `['historial', pacienteId]`
  y `['recordatorios']` (`useRefrescarEstudios`).
- Pruebas: [`lista.test.tsx`](../frontend/src/paginas/estudios/lista.test.tsx) (orden, datos,
  chips, carga, error, vacío, permisos de los tres roles, objetivos táctiles),
  [`programar.test.tsx`](../frontend/src/paginas/estudios/programar.test.tsx),
  [`acciones.test.tsx`](../frontend/src/paginas/estudios/acciones.test.tsx) (reprogramar, cancelar,
  confirmar con el rostro, 403 y 409) y
  [`confirmacionEstudio.test.tsx`](../frontend/src/paginas/estudios/confirmacionEstudio.test.tsx)
  (el hook usado fuera de la ficha). Los cuerpos se validan contra los esquemas del backend
  (`pruebas/contrato.ts`).
