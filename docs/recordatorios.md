# Recordatorios de tomas y tiempo real

> E5 · T501–T508 · CU24–CU28 (casos de uso inferidos). Diseño aprobado en
> [diseno-e5.md](diseno-e5.md). Este documento es el **contrato** entre el backend y el frontend:
> forma de las respuestas, mensajes del tiempo real, códigos de cierre y errores. Los recordatorios
> de **estudios** (T504) tienen la misma forma; el contrato de los estudios está en
> [estudios.md](estudios.md).
>
> Código: [`modulos/recordatorios/`](../backend/src/modulos/recordatorios/) (prioridad, generación,
> ciclo, temporizador, API y atención) y [`modulos/tiempo-real/`](../backend/src/modulos/tiempo-real/)
> (bus y WebSocket); arranque en [`servidor.ts`](../backend/src/servidor.ts).

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
  (12 h) y se puede atender tarde. La notificación (`tipo: RECORDATORIO_VENCIDO`) dice qué, a qué
  hora de Argentina, el paciente y la cama; `datos` trae `recordatorioId`, `pacienteId` y
  `fechaHoraObjetivo`. Hay una por recordatorio y por administrador.
- **Atender** (T507 · S12): registrar la administración de esa toma (el recordatorio pasa a
  `ATENDIDO` con `suministroId` dentro de la misma transacción del suministro) o indicar **"No se
  administró"** con el motivo. No se pide el rostro para el motivo: queda auditado con el usuario.
- **Cancelar**: suspender, finalizar o modificar la frecuencia o el fin de una prescripción, o
  egresar al paciente, cancela sus recordatorios `PENDIENTE`. Si después se reanuda o cambia la
  agenda, el temporizador vuelve a generar los de las tomas nuevas. Esos cambios esperan el candado del ciclo
  dentro de su transacción (D30 de [estudios.md](estudios.md)), así una cancelación no se cruza con
  un ciclo que está generando el recordatorio de la misma toma.
- **Estudios** (T504): un recordatorio por estudio `PROGRAMADO` de un paciente internado, en la
  misma ventana que las tomas, siempre con prioridad `MEDIA`. Se atiende confirmando el estudio con
  el rostro (`POST /api/estudios/:id/confirmar`); reprogramarlo o cancelarlo cancela sus
  recordatorios sin atender, también el vencido (D28 de [estudios.md](estudios.md)).

```
PENDIENTE ─ administración de esa toma ─────────────► ATENDIDO (suministroId)
PENDIENTE ─ "No se administró" con motivo ──────────► ATENDIDO (motivoNoAdministrado)
PENDIENTE ─ estudio confirmado ─────────────────────► ATENDIDO
PENDIENTE ─ 60 min sin atención ────────────────────► VENCIDO (vencidoEn; avisa al administrador)
VENCIDO   ─ administración tardía o motivo ─────────► ATENDIDO (conserva vencidoEn)
PENDIENTE ─ suspender/finalizar/modificar/egresar ──► CANCELADO
PENDIENTE ─ estudio reprogramado o cancelado ───────► CANCELADO
VENCIDO   ─ estudio confirmado ─────────────────────► ATENDIDO (conserva vencidoEn)
VENCIDO   ─ estudio reprogramado o cancelado ───────► CANCELADO (conserva vencidoEn, D28)
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
  /** Solo en los de ESTUDIO (ver estudios.md). */
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

| HTTP | `codigo`                    | Cuándo                                                                                                     |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDACION`                | Filtro inválido o motivo vacío, de menos de 3 o de más de 255 caracteres                                   |
| 401  | `NO_AUTENTICADO`            | Sin sesión o sesión vencida                                                                                |
| 403  | `SIN_PERMISO`               | Sin `recordatorios.ver` (listar) o sin `recordatorios.atender` ("No se administró")                        |
| 404  | `NO_ENCONTRADO`             | El recordatorio no existe                                                                                  |
| 409  | `RECORDATORIO_NO_PENDIENTE` | Ya estaba atendido o cancelado (`detalles.estado`): el frontend vuelve a pedir la lista                    |
| 422  | `NO_ES_TOMA`                | Es un recordatorio de estudio: se atiende [confirmando el estudio](estudios.md), no con "No se administró" |

### Auditoría

| Acción           | Entidad      | Cuándo                                                                                                                           |
| ---------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `GENERAR`        | Recordatorio | El temporizador lo crea (sin usuario; con el paciente)                                                                           |
| `VENCER`         | Recordatorio | Pasó el tiempo sin atenderse (sin usuario; con el paciente)                                                                      |
| `ATENDER`        | Recordatorio | Se registró la administración de su toma o se confirmó su estudio (usuario que lo hizo, dentro de la misma transacción)          |
| `NO_ADMINISTRAR` | Recordatorio | "No se administró", con el motivo en `detalle`                                                                                   |
| `CANCELAR`       | Recordatorio | Suspender, finalizar, modificar o egresar (una entrada por grupo); reprogramar o cancelar un estudio (una por recordatorio, D34) |

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

Mientras el servidor se apaga, un pedido de conexión nuevo recibe HTTP 503.

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
del temporizador manda **un** mensaje; atender, "No se administró", las cancelaciones y
confirmar, reprogramar o cancelar un estudio mandan uno con `nuevos: 0` y `vencidos: 0`. Lo reciben todas las conexiones de usuarios con
`recordatorios.ver`; los filtros (tipo, sala) los aplica el cliente al volver a pedir la lista.

### Latido y cierre

Cada `TIEMPO_REAL_LATIDO_SEG` (30 s) el servidor revisa cada conexión: primero vuelve a validar
el token de la conexión y a leer al usuario de la base (4001 o 4003 si no corresponde seguir);
después, si la conexión no contestó el _ping_ anterior la termina, y si contestó le manda otro (el
navegador contesta solo).

| Código | Quién          | Cuándo                                                                                                        | Qué hace el cliente                                                                                                                                 |
| ------ | -------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1000   | cliente        | Cierre normal (salir, cerrar sesión)                                                                          | Nada                                                                                                                                                |
| 1001   | servidor       | El servidor se apaga o se reinicia                                                                            | Reconecta con espera creciente                                                                                                                      |
| 1006   | (nadie: corte) | Se cortó la red, o el cliente no contestó el latido y el servidor terminó la conexión                         | Reconecta con espera creciente (1 s a 30 s) y, mientras tanto, consulta la lista cada 30 s                                                          |
| 4001   | servidor       | La sesión de la conexión venció (inactividad o 12 h), el usuario se dio de baja o no había sesión al conectar | Reconecta una vez: la cookie pudo haberse renovado con otros pedidos. Si la nueva conexión también cierra con 4001, la sesión terminó (como un 401) |
| 4003   | servidor       | El usuario no tiene (o perdió) `recordatorios.ver`                                                            | No reconecta; vuelve a pedir la sesión (`GET /api/auth/sesion`) para actualizar los permisos                                                        |

### Qué hace el cliente ante un 4001

**La conexión no renueva la sesión** (D14): la sesión se mantiene viva solo con pedidos HTTP, y el
cierre por inactividad de la tablet sigue igual (riesgo R1). El token de la conexión es el de la
cookie en el momento de conectar, así que vence a los 15 min de abierta **aunque la persona siga
usando la tablet**, y el latido la cierra con 4001. Por eso:

1. Si la conexión ya había recibido `conectado` y se cierra con 4001, el cliente **reconecta
   enseguida, una sola vez**: el navegador manda la cookie que renovaron los últimos pedidos.
2. Si esa nueva conexión se cierra con 4001 **sin haber recibido `conectado`**, la sesión terminó:
   el cliente hace lo mismo que con un 401 (por ejemplo, vuelve a pedir `GET /api/auth/sesion` y,
   si responde 401, va al ingreso). No sigue reconectando.
3. Si la nueva conexión recibe `conectado`, vuelve a pedir la lista y sigue normal.

### Proxys

El navegador abre el WebSocket contra el mismo origen de la interfaz; el proxy tiene que dejar
pasar el _upgrade_ (riesgo R4):

- **Vite** (`frontend/vite.config.ts`): `proxy: { '/api': { target: 'http://localhost:3000', ws: true } }`.
  Vite conserva el `Host` (`localhost:5173`), que coincide con el `Origin`: no hace falta
  `TIEMPO_REAL_ORIGENES`.
- **nginx** (`frontend/nginx.conf`), en `location /api/`: `proxy_http_version 1.1;`,
  `proxy_set_header Upgrade $http_upgrade;` y `proxy_set_header Connection $connection_upgrade;`
  (con `map $http_upgrade $connection_upgrade { default upgrade; '' close; }` fuera del bloque
  `server`). Además, `proxy_set_header Host $http_host;` en lugar de `$host` para conservar el
  puerto (`localhost:8080`) y que coincida con el `Origin`; si no, hay que poner
  `TIEMPO_REAL_ORIGENES=http://localhost:8080` en el servicio `backend` de `docker-compose.yml`.
  El latido manda tráfico cada 30 s, así que alcanza el `proxy_read_timeout` por defecto (60 s).

## Interfaz (fase 2)

Código: [`api/recordatorios.ts`](../frontend/src/api/recordatorios.ts) (tipos y API),
[`tiempoReal/`](../frontend/src/tiempoReal/) (conexión, proveedor y avisos),
[`paginas/recordatorios/`](../frontend/src/paginas/recordatorios/) (pantalla) e
[`InsigniaRecordatorios.tsx`](../frontend/src/navegacion/InsigniaRecordatorios.tsx).

### Pantalla Recordatorios (`/recordatorios`, `recordatorios.ver`)

Se llega desde el menú (después de Inicio), la insignia de la barra y, para quien atiende, la
primera tarea del inicio ("Tomas y estudios para atender").

- **Tarjetas en el orden del servidor** (ya vienen por urgencia), tomas y estudios mezclados: una
  columna en teléfono; en tablet y PC, tantas columnas de al menos 300 px como entren. Cada una:
  chip de urgencia, **hora grande** (24 h), "Faltan 12 min" / "Atrasada 8 min" / "Toca ahora" (con
  la hora del servidor, se recalcula sola cada 30 s), paciente "Apellido, Nombre" con DNI, cama y
  sala, y qué se hace, con su ícono:
  - **Toma** (ícono de medicamento): medicamento con dosis, vía y presentación (número y unidad
    sin cortes). La tarjeta se nombra "Toma de las 11:52 · Benítez, Rosa".
  - **Estudio** (ícono de microscopio, distinto del de medicamento): nombre del estudio, tipo (si
    el nombre lo precisa) y "Preparación: …" si tiene. Se nombra "Estudio de las 12:05 · Benítez,
    Rosa" y concuerda en masculino: "Atrasado 8 min", "Vencido", "Programado".
- **Chip de urgencia** (ícono y texto, nunca verde ni rojo); las tarjetas urgentes y vencidas
  llevan además el borde de advertencia:

  | Recordatorio        | Chip (toma / estudio)   | Aspecto            |
  | ------------------- | ----------------------- | ------------------ |
  | `VENCIDO`           | Vencida / Vencido       | Relleno `warning`  |
  | `PENDIENTE` `ALTA`  | Urgente                 | Relleno `warning`  |
  | `PENDIENTE` `MEDIA` | Pronto                  | Contorno `primary` |
  | `PENDIENTE` `BAJA`  | Programada / Programado | Contorno neutro    |

  "Urgente" y "Vencida" son justamente los que cuenta `meta.urgentes`. Un estudio siempre llega
  con prioridad `MEDIA` ("Pronto") o vencido.

- **Acciones de una toma**, solo con `recordatorios.atender`: **No se administró** (texto) abre la
  confirmación con motivo obligatorio (3 a 255; el campo no deja escribir más) y hace el `POST`;
  **Administrar** (con contorno, pide además `suministros.registrar`) abre
  `/suministros/medicamento?pacienteId=…&prescripcionId=…&desde=recordatorios`, que deja elegidos
  el paciente y la prescripción, y lleva en el estado de la navegación (`volverA`) los filtros del
  panel. Un 409 cierra el diálogo, avisa "Ese recordatorio ya fue atendido por otra persona" (o que
  se canceló, si `detalles.estado` es `CANCELADO`) y vuelve a pedir la lista; un 422 explica que un
  estudio se atiende confirmándolo; cualquier otro error queda dentro del diálogo, sin perder el
  motivo escrito.
- **Acción de un estudio**, solo con `estudios.confirmar`: **Confirmar que se realizó** (con
  contorno, ícono del rostro) abre `useConfirmacionEstudio` con `estudio.id` y el paciente del
  recordatorio (nombre, DNI y cama); se confirma con el rostro. Al terminar, el hook renueva
  `['recordatorios']` (el estudio sale de la lista) y el panel muestra su aviso (éxito, o el 409
  "Este estudio ya fue confirmado o cancelado por otra persona"). Un estudio no ofrece "No se
  administró" ni "Administrar".
- **Volver al panel después de administrar** (`desde=recordatorios` en la administración): la flecha
  Volver lleva a `/recordatorios` con los filtros que tenía ("Volver a Recordatorios"); al registrar
  con éxito, el aviso ofrece **Volver a Recordatorios** como acción principal, al final, junto a
  "Ir a la ficha". Con algo cargado sin registrar, la flecha pregunta antes (`useCambiosSinGuardar`);
  cambiar de paciente conserva el camino de vuelta. El recordatorio de la toma lo atiende el
  servidor al registrar el suministro; la pantalla solo renueva `['recordatorios']` (la insignia se
  actualiza aunque no haya tiempo real).
- **Foco del resultado**: el aviso de "No se administró" o de la confirmación del estudio (también el
  409/422) usa `Alerta` con `enfocar`. Al cerrarse el diálogo MUI devuelve el foco al botón de la
  tarjeta, que desaparece al recargarse la lista: sin esto el foco caería en la página.
- **Estados**: cargando; error con Reintentar (si ya había una lista, queda a la vista con su
  hora); vacío según el filtro ("No hay tomas ni estudios para atender ahora", "No hay tomas…" o
  "No hay estudios…", con "en _sala_" si se filtró, y a qué hora se actualizó); franja "Sin conexión
  en tiempo real: la lista se actualiza cada 30 s". La lista se nombra "Recordatorios para
  atender" ("Tomas para atender" o "Estudios para atender" con el filtro).
- **Filtros en la URL**: **Tipo** (`?tipo=MEDICAMENTO|ESTUDIO`: Todos, Tomas, Estudios; un valor
  desconocido se ignora y no se manda) para todos, y **Sala** (`?salaId=2`) solo con `pacientes.ver`
  (las salas salen de `GET /api/salas`). Van juntos, de a dos desde tablet.
- **Interruptor "Sonido de avisos"** (solo quien atiende): se recuerda en la tablet
  (`localStorage` `sgsm.sonidoAvisos = 'no'`; sin almacenamiento disponible, vale mientras la
  pantalla esté abierta). Al prenderlo suena una vez, con el toque, para comprobar el audio.
- **Insignia** de la barra: la misma consulta que la lista sin filtros (`['recordatorios', {}]`),
  con `aria-label` "Recordatorios: N para atender, M urgentes" (o "1 urgente"). La cantidad va
  rellena de advertencia solo si hay urgentes; si no, con contorno neutro.

### Cliente de tiempo real

- [`conexion.ts`](../frontend/src/tiempoReal/conexion.ts): sin React, con la fábrica del socket
  y el reloj inyectables. Valida cada mensaje (lo que no entiende lo ignora) y expone el estado
  (`conectando`, `conectado`, `sin-conexion`). Cierres: 1001, 1006 y cualquier otro inesperado
  reconectan con espera de 1, 2, 4… hasta 30 s (vuelve a 1 s con cada `conectado`); 4001
  reconecta enseguida una vez y, si la nueva conexión vuelve a cerrar con 4001 sin `conectado`,
  avisa que la sesión terminó; 4003 no reconecta y avisa; 1000, nada. Si está esperando para
  reconectar y vuelve la red (`online`) o la pantalla (`visibilitychange`), reconecta ya.
- [`ProveedorTiempoReal`](../frontend/src/tiempoReal/ProveedorTiempoReal.tsx), montado en
  `Disposicion` (la plantilla de toda pantalla con sesión): se conecta solo con
  `recordatorios.ver`. Cada mensaje (también `conectado`) invalida `['recordatorios']`; si
  `vencidos > 0`, también `['notificaciones']`. Sin conexión, invalida la lista cada 30 s. Ante
  4001 dos veces o 4003 vuelve a pedir la sesión (`refrescarSesion`): un 401 lleva al ingreso y un
  permiso perdido saca el menú, la insignia y la conexión.
- **Reloj (R6)**: desfase = hora del servidor − hora de la tablet, con `meta.ahora` de cada
  respuesta de la lista y `momento` de cada mensaje (diferencias de menos de 1 s se ignoran).
- **Avisos de nuevos (S16)**, solo a quien tiene `recordatorios.atender`: texto ("2 recordatorios
  nuevos") en una región `aria-live="polite"` que está siempre en la página, a la vista 15 s
  abajo al centro con "Ver recordatorios" y Cerrar; tono corto de dos notas (Web Audio) y
  vibración si la tablet no los apagó. Como mucho un aviso cada 10 s: lo que llega antes se suma
  al siguiente. El audio se habilita con el primer toque en la pantalla (R7); sin Web Audio o sin
  vibración (iOS) queda solo el texto.

### Pruebas

- [`pruebas/servidor.ts`](../frontend/src/pruebas/servidor.ts) trae respuestas por defecto para
  lo que monta la plantilla: `GET */api/recordatorios` vacío con su `meta` y el WebSocket simulado
  con `ws.link('*/api/tiempo-real')` de MSW (funciona en jsdom), que acepta y manda `conectado`.
  Datos y ayudas en [`datosRecordatorios.ts`](../frontend/src/pruebas/datosRecordatorios.ts)
  (`simularRecordatorios`, `avisarCambio`, `registrarConexiones`, `fijarHoraTablet`).
- Unitarias: `tiempoReal/conexion.test.ts` (cada código de cierre con un socket falso),
  `tiempoReal/avisos.test.ts` y `paginas/recordatorios/urgencia.test.ts` (también las etiquetas en
  masculino de los estudios). De pantalla: `paginas/recordatorios/panel.test.tsx` (tomas y
  estudios, confirmar un estudio con el rostro y su 409, filtro por tipo, foco del resultado y
  volver con los filtros), `paginas/suministros/administracion.test.tsx` ("volver al panel de
  recordatorios"), `tiempoReal/tiempoReal.test.tsx` y `navegacion/insignia.test.tsx`.
  `recordatorioDeEstudio()` (en `datosRecordatorios.ts`) es el del estudio 60 de
  `datosEstudios.ts`.
- Mientras se hace la primera carga de la lista, React Query reutiliza ese pedido si llega
  `conectado` (no pide dos veces); las pruebas que cuentan pedidos esperan a que la lista esté
  cargada antes de mandar avisos.

## Decisiones

Tomadas al bajar el diseño al código; complementan D9–D14 de [diseno-e5.md](diseno-e5.md). D15–D19
son del contrato (fase 0); D20–D25, de la implementación del backend (fase 1). Siguen D26–D35 en
[estudios.md](estudios.md#decisiones).

| #   | Decisión                                                                                                                                                                                                                                              | Por qué                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D15 | Atendido = `atendidoEn` + **exactamente una** resolución en una toma (administración o motivo); ninguna en un estudio (CHECK).                                                                                                                        | El recordatorio dice cómo se resolvió sin ambigüedad; la confirmación del estudio vive en `estudios`.                                                                                 |
| D16 | Sin sesión o sin permiso, el WebSocket se abre y se cierra con 4001/4003; un origen ajeno se rechaza con HTTP 403.                                                                                                                                    | El navegador no ve el estado HTTP de un WebSocket rechazado; el código de cierre le dice si reconectar o no.                                                                          |
| D17 | Origen aceptado: el mismo `Host` del pedido o la lista `TIEMPO_REAL_ORIGENES`.                                                                                                                                                                        | Funciona detrás de Vite sin configurar nada; detrás de un proxy que cambia el `Host` (nginx) se agrega el origen a la lista.                                                          |
| D18 | Los mensajes llevan cantidades (`nuevos`, `vencidos`) y la hora del servidor, nunca datos del paciente.                                                                                                                                               | Alcanza para decidir el tono, la vibración y si recargar notificaciones; la hora corrige el reloj de la tablet (R6).                                                                  |
| D19 | El panel muestra solo pacientes internados; un vencido de un paciente egresado deja de verse.                                                                                                                                                         | El egreso cancela los pendientes pero no los vencidos (diagrama de estados); no tiene sentido atenderlos tras el alta.                                                                |
| D20 | Un pedido de conexión sin `Origin` se acepta.                                                                                                                                                                                                         | Los navegadores siempre lo mandan (el control de origen protege de páginas ajenas abiertas en el navegador); un cliente que no es navegador igual necesita una cookie válida.         |
| D21 | El latido revisa primero la sesión y el permiso, y después si la conexión contestó el _ping_.                                                                                                                                                         | El cliente recibe el código que le dice qué hacer (4001/4003) en lugar de un corte (1006).                                                                                            |
| D22 | `GENERAR` y `VENCER` se auditan uno por recordatorio, sin usuario y con el paciente; la notificación de vencido es una por recordatorio y por administrador activo.                                                                                   | La auditoría por paciente queda completa (RN06) y el aviso dice exactamente qué toma se perdió; el volumen es el riesgo R8.                                                           |
| D23 | La atención por administración toma como `atendidoEn` la hora del suministro y solo atiende el pendiente o vencido de su toma más cercana; uno ya atendido con motivo no cambia. Toda actualización de estado lleva el estado esperado en el `WHERE`. | Misma regla que el historial (`tomaMasCercana`). Una atención, un vencimiento y un "No se administró" simultáneos no se pisan: el segundo no encuentra la fila en el estado esperado. |
| D24 | "No se administró" se puede registrar antes de la hora de la toma.                                                                                                                                                                                    | Enfermería puede saber de antemano que una toma no se va a dar (ayuno, estudio, rechazo).                                                                                             |
| D25 | El temporizador y el tiempo real los arranca `levantarServidor()` en `servidor.ts`; `server.ts` solo la llama y apaga ordenado con SIGTERM o SIGINT (las conexiones cierran con 1001).                                                                | `crearApp()` sigue sin efectos: las pruebas de la API no corren el temporizador.                                                                                                      |

Cómo se cuentan los recordatorios en las estadísticas (a tiempo, tarde, no administrados, vencidos
sin atender): [reportes.md](reportes.md), D45 y supuesto S20.
