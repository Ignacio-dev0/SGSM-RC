# Recordatorios de tomas y tiempo real

> E5 · T501–T508 · CU24–CU28 (casos de uso inferidos). Diseño aprobado en
> [diseno-e5.md](diseno-e5.md). Este documento es el **contrato** entre el backend y el frontend:
> forma de las respuestas, mensajes del tiempo real, códigos de cierre y errores. Los recordatorios
> de **estudios** (T504, T509–T513) se suman en la fase 3 con la misma forma.

## Cómo funciona

- **Temporizador** (T501): corre al iniciar el servidor y cada `RECORDATORIOS_INTERVALO_SEG`
  (60 s), sin superponerse y con un candado de PostgreSQL para que dos procesos no hagan el mismo
  ciclo. En cada ciclo: vence los atrasados, genera los nuevos y recalcula la prioridad de los
  pendientes; avisa al tiempo real **después** de confirmar la transacción.
- **Generación** (T502 · S9): un recordatorio por toma, `RECORDATORIO_ANTICIPACION_MIN` (30) antes
  de la hora, para las tomas de prescripciones vigentes de pacientes internados entre 30 min antes
  y 30 min después de ahora que todavía no tengan una administración (la toma de una
  administración es la más cercana, `tomaMasCercana`). Nunca hay dos recordatorios activos de la
  misma toma (índice único parcial). Tras una caída del servidor solo se recuperan las tomas de los
  últimos 30 min.
- **Prioridad** (T503 · S10): `BAJA` con más de 15 min hasta la toma, `MEDIA` entre 5 y 15, `ALTA`
  con 5 o menos o atrasada. Los de estudio, siempre `MEDIA`. Se recalcula en cada ciclo y no se
  audita (D12).
- **Vencimiento** (T503 · T508 · S11): a los `RECORDATORIO_VENCIMIENTO_MIN` (60) de generado sin
  atenderse pasa a `VENCIDO` (unos 30 min después de la toma), guarda `vencidoEn` y avisa a cada
  administrador activo con una notificación. Sigue en el panel `RECORDATORIO_VENCIDOS_VISIBLES_HORAS`
  (12 h) y se puede atender tarde.
- **Atender** (T507 · S12): registrar la administración de esa toma (el recordatorio pasa a
  `ATENDIDO` con `suministroId` dentro de la misma transacción del suministro) o indicar **"No se
  administró"** con el motivo. No se pide el rostro para el motivo: queda auditado con el usuario.
- **Cancelar**: suspender, finalizar o modificar la frecuencia o el fin de una prescripción, o
  egresar al paciente, cancela sus recordatorios `PENDIENTE`. Si después se reanuda o cambia la
  agenda, el temporizador vuelve a generar los de las tomas nuevas.

```
PENDIENTE ─ administración de esa toma ─────────────► ATENDIDO (suministroId)
PENDIENTE ─ "No se administró" con motivo ──────────► ATENDIDO (motivoNoAdministrado)
PENDIENTE ─ estudio confirmado ─────────────────────► ATENDIDO
PENDIENTE ─ 60 min sin atención ────────────────────► VENCIDO (vencidoEn; avisa al administrador)
VENCIDO   ─ administración tardía o motivo ─────────► ATENDIDO (conserva vencidoEn)
PENDIENTE ─ suspender/finalizar/modificar/egresar ──► CANCELADO
```

La base garantiza la coherencia ([modelo-de-datos.md](modelo-de-datos.md)): un recordatorio
atendido tiene `atendidoEn` y **una** resolución (la administración o el motivo; en un estudio, su
confirmación), uno vencido tiene `vencidoEn`, y el origen coincide con el tipo.

## API

Endpoints y permisos en [endpoints.md](endpoints.md). Esquemas
de entrada (zod, compartidos con el frontend):
[`recordatorios.esquemas.ts`](../backend/src/modulos/recordatorios/recordatorios.esquemas.ts).

### `GET /api/recordatorios?tipo&salaId` — `recordatorios.ver`

Los recordatorios **para atender** de todo el hospital (S13): los `PENDIENTE` y los `VENCIDO` de
las últimas 12 h, de pacientes internados. Filtros opcionales: `tipo` (`MEDICAMENTO` o `ESTUDIO`) y
`salaId` (sala de la cama actual). Orden por urgencia: prioridad (`ALTA`, `MEDIA`, `BAJA`), después
la hora de la toma (la más antigua primero).

```json
{
  "data": [
    { "id": 12, "tipo": "MEDICAMENTO", "estado": "PENDIENTE", "prioridad": "ALTA", "…": "…" }
  ],
  "meta": { "total": 7, "urgentes": 2, "ahora": "2026-10-07T12:00:00.000Z" }
}
```

- `meta.total`: cuántos hay para atender (con los filtros aplicados).
- `meta.urgentes`: cuántos tienen prioridad `ALTA` o están `VENCIDO`. La insignia de la barra
  muestra "Recordatorios: _total_ para atender, _urgentes_ urgentes".
- `meta.ahora`: la hora del servidor. El frontend calcula "Faltan 12 min" / "Atrasada 8 min" con
  la diferencia entre esta hora y la de la tablet, para no depender de su reloj (riesgo R6).

### `POST /api/recordatorios/:id/no-administrar` — `recordatorios.atender`

Cuerpo `{ "motivo": "Paciente en ayunas para un estudio" }` (3 a 255 caracteres, se recortan los
espacios). Pasa un recordatorio de toma `PENDIENTE` o `VENCIDO` a `ATENDIDO` con el motivo, el
usuario y la hora; un vencido conserva `vencidoEn`. Responde `200 { data: Recordatorio }` y avisa al
tiempo real.

### Forma de un recordatorio

```ts
interface Recordatorio {
  id: number;
  tipo: 'MEDICAMENTO' | 'ESTUDIO';
  /** El panel solo recibe PENDIENTE y VENCIDO; "No se administró" devuelve el ATENDIDO. */
  estado: 'PENDIENTE' | 'VENCIDO' | 'ATENDIDO' | 'CANCELADO';
  prioridad: 'ALTA' | 'MEDIA' | 'BAJA';
  /** Hora de la toma o del estudio (ISO 8601 en UTC, como todas las fechas de la API). */
  fechaHoraObjetivo: string;
  generadoEn: string;
  /** Cuándo venció; se conserva si después se atendió tarde. */
  vencidoEn: string | null;
  paciente: { id: number; apellido: string; nombre: string; dni: string };
  /** Cama actual del paciente (null si no tiene asignación activa). */
  cama: { numero: string; sala: { id: number; nombre: string } } | null;
  /** Solo en los de MEDICAMENTO: lo necesario para la tarjeta y para "Administrar". */
  prescripcion: {
    id: number;
    medicamento: string;
    presentacion: string;
    dosis: number;
    unidadDosis: string;
    via: string; // ViaAdministracion: ORAL, INTRAVENOSA…
    frecuenciaHoras: number;
  } | null;
  /** Solo en los de ESTUDIO (fase 3). */
  estudio: { id: number; nombre: string; tipoEstudio: string; preparacion: string | null } | null;
  /** Atención: quién, cuándo y cómo (null mientras no se atendió). */
  atendidoEn: string | null;
  atendidoPor: { id: number; nombre: string } | null; // nombre: "Apellido, Nombre"
  suministroId: number | null;
  motivoNoAdministrado: string | null;
}
```

**Administrar** desde el panel abre la pantalla de administración con `paciente.id` y
`prescripcion.id` elegidos; al registrarse el suministro (`POST /api/suministros/medicamentos`, sin
cambios en su contrato) el recordatorio se atiende solo.

### Errores

| HTTP | `codigo`                    | Cuándo                                                                                      |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------- |
| 400  | `VALIDACION`                | Filtro inválido o motivo vacío, de menos de 3 o de más de 255 caracteres                    |
| 401  | `NO_AUTENTICADO`            | Sin sesión o sesión vencida                                                                 |
| 403  | `SIN_PERMISO`               | Sin `recordatorios.ver` (listar) o sin `recordatorios.atender` ("No se administró")         |
| 404  | `NO_ENCONTRADO`             | El recordatorio no existe                                                                   |
| 409  | `RECORDATORIO_NO_PENDIENTE` | Ya estaba atendido o cancelado (`detalles.estado`): el frontend vuelve a pedir la lista     |
| 422  | `NO_ES_TOMA`                | Es un recordatorio de estudio: se atiende confirmando el estudio, no con "No se administró" |

### Auditoría

| Acción           | Entidad      | Cuándo                                                                                            |
| ---------------- | ------------ | ------------------------------------------------------------------------------------------------- |
| `GENERAR`        | Recordatorio | El temporizador lo crea (sin usuario; con el paciente)                                            |
| `VENCER`         | Recordatorio | Pasó el tiempo sin atenderse (sin usuario; con el paciente)                                       |
| `ATENDER`        | Recordatorio | Se registró la administración de su toma (usuario que administró, dentro de la misma transacción) |
| `NO_ADMINISTRAR` | Recordatorio | "No se administró", con el motivo en `detalle`                                                    |
| `CANCELAR`       | Recordatorio | Suspender, finalizar, modificar o egresar (ya existía: una entrada por grupo)                     |

El cambio de prioridad no se audita (D12). El volumen de `GENERAR`/`VENCER` es el riesgo R8.

## Tiempo real (T505)

`ws://<host>/api/tiempo-real` (`wss://` con HTTPS): mismo origen que la interfaz, para que viaje la
cookie de sesión (`path: /api`). En desarrollo Vite reenvía `/api` al backend (necesita
`ws: true`); en Docker, nginx necesita los encabezados `Upgrade` y `Connection` (riesgo R4).

**Los mensajes solo avisan que algo cambió** (D10): no llevan datos clínicos. Al recibir uno, el
cliente vuelve a pedir `GET /api/recordatorios`, que es la fuente de verdad; lo que se haya
perdido durante un corte se recupera igual.

### Conexión

1. **Origen**: el encabezado `Origin` tiene que coincidir con el `Host` del pedido (mismo origen)
   o estar en `TIEMPO_REAL_ORIGENES`. Si no, el servidor rechaza el pedido con **HTTP 403** y no
   abre la conexión.
2. **Sesión y permiso**: se leen de la cookie `sgsm_sesion` al conectar. Sin sesión válida la
   conexión se abre y se cierra enseguida con **4001**; sin `recordatorios.ver`, con **4003** (un
   navegador no puede leer el estado HTTP de un WebSocket rechazado, el código de cierre sí).
3. Al quedar abierta, el servidor manda `{ "tipo": "conectado", "momento": "…" }`. El cliente
   vuelve a pedir la lista (resincroniza) cada vez que lo recibe.

### Mensajes del servidor

Texto JSON. El cliente no manda nada (lo que mande se ignora).

```ts
type MensajeTiempoReal =
  | { tipo: 'conectado'; momento: string }
  | {
      tipo: 'recordatorios';
      /** Recordatorios que aparecieron con este cambio: tono y vibración para quien atiende (S16). */
      nuevos: number;
      /** Recordatorios que vencieron con este cambio: un administrador vuelve a pedir sus notificaciones. */
      vencidos: number;
      momento: string;
    };
```

`momento` es la hora del servidor (sirve para corregir el reloj de la tablet, R6). Un mismo ciclo
del temporizador manda **un** mensaje; atender, "No se administró" y las cancelaciones mandan uno
con `nuevos: 0` y `vencidos: 0`. Lo reciben todas las conexiones de usuarios con
`recordatorios.ver`; los filtros (tipo, sala) los aplica el cliente al volver a pedir la lista.

### Latido y cierre

Cada `TIEMPO_REAL_LATIDO_SEG` (30 s) el servidor manda un _ping_ (el navegador contesta solo) y
vuelve a leer al usuario de la base:

| Código | Quién          | Cuándo                                                                                                        | Qué hace el cliente                                                                                                                                 |
| ------ | -------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1000   | cliente        | Cierre normal (salir, cerrar sesión)                                                                          | Nada                                                                                                                                                |
| 1001   | servidor       | El servidor se apaga o se reinicia                                                                            | Reconecta con espera creciente                                                                                                                      |
| 1006   | (nadie: corte) | Se cortó la red, o el cliente no contestó el latido y el servidor terminó la conexión                         | Reconecta con espera creciente (1 s a 30 s) y, mientras tanto, consulta la lista cada 30 s                                                          |
| 4001   | servidor       | La sesión de la conexión venció (inactividad o 12 h), el usuario se dio de baja o no había sesión al conectar | Reconecta una vez: la cookie pudo haberse renovado con otros pedidos. Si la nueva conexión también cierra con 4001, la sesión terminó (como un 401) |
| 4003   | servidor       | El usuario no tiene (o perdió) `recordatorios.ver`                                                            | No reconecta; vuelve a pedir la sesión (`GET /api/auth/sesion`) para actualizar los permisos                                                        |

**La conexión no renueva la sesión** (D14): la sesión se mantiene viva solo con pedidos HTTP (y
el cierre por inactividad de la tablet sigue igual, riesgo R1). Por eso el token de la conexión
vence a los 15 min de abierta aunque la persona siga usando la tablet: el servidor cierra con 4001
y el cliente reconecta con la cookie renovada.

## Decisiones del contrato (fase 0)

Tomadas al bajar el diseño al código; complementan D9–D14 de [diseno-e5.md](diseno-e5.md).

| #   | Decisión                                                                                                                       | Por qué                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| D15 | Atendido = `atendidoEn` + **exactamente una** resolución en una toma (administración o motivo); ninguna en un estudio (CHECK). | El recordatorio dice cómo se resolvió sin ambigüedad; la confirmación del estudio vive en `estudios`.                        |
| D16 | Sin sesión o sin permiso, el WebSocket se abre y se cierra con 4001/4003; un origen ajeno se rechaza con HTTP 403.             | El navegador no ve el estado HTTP de un WebSocket rechazado; el código de cierre le dice si reconectar o no.                 |
| D17 | Origen aceptado: el mismo `Host` del pedido o la lista `TIEMPO_REAL_ORIGENES`.                                                 | Funciona detrás de Vite sin configurar nada; detrás de un proxy que cambia el `Host` (nginx) se agrega el origen a la lista. |
| D18 | Los mensajes llevan cantidades (`nuevos`, `vencidos`) y la hora del servidor, nunca datos del paciente.                        | Alcanza para decidir el tono, la vibración y si recargar notificaciones; la hora corrige el reloj de la tablet (R6).         |
| D19 | El panel muestra solo pacientes internados; un vencido de un paciente egresado deja de verse.                                  | El egreso cancela los pendientes pero no los vencidos (diagrama de estados); no tiene sentido atenderlos tras el alta.       |
