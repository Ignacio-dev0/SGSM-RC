# Diseño de E5 · Recordatorios de medicamentos y estudios

> Plan de implementación de la etapa E5 del plan de trabajo (T501–T514, sección 3.6), hecho
> antes de empezar. Recordatorios de medicamentos es núcleo del prototipo (sección 6 del plan);
> estudios va en versión mínima. Los casos de uso CU24–CU31 son inferidos (Actividad 6 no
> disponible).

## Condiciones que encontramos en el código

1. `tomaProgramada` no se guarda: `aDtoSuministro` la calcula con `tomaMasCercana`. Se reutiliza
   esa regla para vincular una administración con su recordatorio.
2. Ya existen la tabla `recordatorios` (estados PENDIENTE/ATENDIDO/VENCIDO/CANCELADO,
   prioridades ALTA/MEDIA/BAJA, tipo MEDICAMENTO/ESTUDIO), `estudios` y `tipos_estudio`.
3. El índice único total `(prescripcionId, fechaHoraObjetivo)` impide regenerar una toma
   cancelada al reanudar o modificar: se reemplaza por un **índice único parcial** que excluye
   CANCELADO (igual para estudios).
4. `generadoEn @default(now())` usa el reloj de la base: pasar siempre `reloj.ahora()`.
5. La cookie `sgsm_sesion` tiene `path: /api`: el WebSocket cuelga de `/api/tiempo-real`; Vite
   (`ws: true`) y nginx (Upgrade/Connection) lo tienen que dejar pasar.
6. El egreso y la suspensión ya cancelan recordatorios pendientes; falta avisar al tiempo real.
7. `movimientos.test.ts` crea un recordatorio ATENDIDO sin `atendidoEn`: hay que corregir el dato
   cuando entren las restricciones nuevas.
8. El cierre por inactividad (15 min) deja de recibir avisos en una tablet quieta (riesgo R1).
9. Todo lo que monte `Disposicion` necesita respuestas simuladas por defecto en
   `simularSesion()`; MSW 2 trae `ws.link` para WebSocket.

## Alcance

| Tarea           | Objetivo                                                                            | Prototipo                              |
| --------------- | ----------------------------------------------------------------------------------- | -------------------------------------- |
| T501            | Temporizador cada minuto                                                            | Sí                                     |
| T502            | Recordatorio 30 min antes de cada toma, sin duplicar                                | Sí                                     |
| T503            | Prioridad según lo que falta; vence a los 60 min sin atender                        | Sí                                     |
| T505            | WebSocket que avisa recordatorios nuevos y cambios                                  | Sí                                     |
| T506            | Panel por urgencia, con filtros por tipo y sala                                     | Sí                                     |
| T507            | Atender: administrar desde el panel                                                 | Sí                                     |
| T508            | Avisar al administrador cuando un recordatorio vence                                | Sí                                     |
| T514            | Pruebas con reloj simulado                                                          | Sí                                     |
| T504, T509–T513 | Estudios: recordatorio, API, programar, reprogramar, cancelar, confirmar con rostro | Mínimo: pestaña en la ficha y diálogos |

Fuera de E5: notificaciones push con el navegador cerrado (requiere HTTPS, T802), tiempo real
con varias instancias (LISTEN/NOTIFY), asignación por turno, escalamiento al médico, cortes de
Wi-Fi (T704, E7) y la prueba en tablet real.

## Modelo de datos

Sin tablas nuevas. En `Recordatorio`: índices simples en lugar de los `@@unique`, y columnas
`vencidoEn` y `motivoNoAdministrado`. Migración creada con `--create-only` y revisada:

```sql
CREATE UNIQUE INDEX "recordatorios_toma_activa_key"
  ON "recordatorios" ("prescripcion_id", "fecha_hora_objetivo") WHERE "estado" <> 'CANCELADO';
CREATE UNIQUE INDEX "recordatorios_estudio_activo_key"
  ON "recordatorios" ("estudio_id", "fecha_hora_objetivo") WHERE "estado" <> 'CANCELADO';
-- CHECK: origen coherente con el tipo; ATENDIDO con atendido_en y resolución; VENCIDO con vencido_en.
```

Estados:

```
PENDIENTE ─ administración de esa toma ─────────────► ATENDIDO (suministroId)
PENDIENTE ─ "No se administró" con motivo ──────────► ATENDIDO (motivoNoAdministrado)
PENDIENTE ─ estudio confirmado ─────────────────────► ATENDIDO
PENDIENTE ─ 60 min sin atención ────────────────────► VENCIDO (vencidoEn; avisa al administrador)
VENCIDO   ─ administración tardía o motivo ─────────► ATENDIDO (conserva vencidoEn)
PENDIENTE ─ suspender/finalizar/modificar/egresar ──► CANCELADO
```

## Generación (backend, `modulos/recordatorios/`)

- `prioridad.ts`: BAJA con más de 15 min; MEDIA entre 5 y 15; ALTA con 5 o menos o atrasada;
  estudio siempre MEDIA.
- `generacion.ts`: tomas en ±30 min de ahora que no tengan administración (`tomasEntre`,
  `tomaMasCercana`).
- `ciclo.servicio.ts` · `ejecutarCiclo(ahora)`: en una transacción con candado de PostgreSQL
  (`pg_try_advisory_xact_lock`): vencer (y notificar a los administradores), generar con
  `createManyAndReturn({ skipDuplicates: true })`, repriorizar; publicar al tiempo real
  **después** del commit.
- `temporizador.ts`: corre al iniciar y cada minuto, sin superponerse; lo arranca `servidor.ts`,
  nunca `crearApp()` (las pruebas no lo arrancan).
- Configuración: `RECORDATORIOS_TEMPORIZADOR`, `RECORDATORIOS_INTERVALO_SEG` (60),
  `RECORDATORIO_ANTICIPACION_MIN` (30), `RECORDATORIO_VENCIMIENTO_MIN` (60), umbrales de
  prioridad (5 y 15), vencidos visibles 12 h.

## Tiempo real

- Librería `ws` (T505 pide WebSocket). `/api/tiempo-real`, sesión por la cookie, origen
  verificado, destinatarios por **permiso** (`recordatorios.ver`), latido cada 30 s que cierra con
  4003 si el usuario perdió el permiso y con 4001 si venció el token.
- Los mensajes **solo avisan que algo cambió**; la fuente de verdad es `GET /api/recordatorios`
  (no viajan datos clínicos por el socket y lo perdido en un corte se resincroniza).
- Cliente con reconexión creciente (1–30 s), reconexión al volver la red o la pantalla, y
  consulta cada 30 s mientras no hay conexión.

## Endpoints

| Método | Ruta                                    | Permiso                 |
| ------ | --------------------------------------- | ----------------------- |
| GET    | `/api/recordatorios?tipo&salaId`        | `recordatorios.ver`     |
| POST   | `/api/recordatorios/:id/no-administrar` | `recordatorios.atender` |
| GET    | `/api/tipos-estudio`                    | `estudios.ver`          |
| GET    | `/api/pacientes/:id/estudios`           | `estudios.ver`          |
| POST   | `/api/pacientes/:id/estudios`           | `estudios.gestionar`    |
| GET    | `/api/estudios/:id`                     | `estudios.ver`          |
| PATCH  | `/api/estudios/:id` (reprogramar)       | `estudios.gestionar`    |
| POST   | `/api/estudios/:id/cancelar`            | `estudios.gestionar`    |
| POST   | `/api/estudios/:id/confirmar` (rostro)  | `estudios.confirmar`    |

Atender por administración no cambia el contrato: `registrarAdministracion()` marca ATENDIDO el
recordatorio de la toma más cercana dentro de su transacción.

Permisos nuevos: `recordatorios.ver` (los tres roles), `recordatorios.atender` (enfermería y
administración), `estudios.ver` (los tres), `estudios.gestionar` (médico y administración),
`estudios.confirmar` (enfermería y administración).

## Interfaz

- Pantalla **Recordatorios** (`/recordatorios`), opción de menú e insignia en la barra con
  "Recordatorios: N para atender, M urgentes"; primera tarea del inicio de enfermería.
- Tarjetas por urgencia (chip con ícono y texto, nunca solo color), hora grande, "Faltan 12 min"
  / "Atrasada 8 min", paciente, cama, medicamento; **Administrar** abre la pantalla con paciente y
  prescripción elegidos; **No se administró** pide motivo.
- Estados: cargando, error con Reintentar, vacío, y aviso de "sin conexión en tiempo real".
- Aviso de recordatorio nuevo por región `aria-live`, tono corto y vibración solo para quien
  atiende, como mucho cada 10 s y desactivable por tablet. El sonido nunca es la única señal.

## Orden de trabajo (TDD) y reparto

0. **Contrato (en serie):** permisos, migración con sus pruebas de restricciones, configuración,
   esquemas zod con pruebas, `docs/recordatorios.md`, reglas en `frontend/src/pruebas/contrato.ts`.
1. **Backend (agente A):** formato de hora, prioridad, generación, bus, ciclo contra la base con
   reloj simulado (incluida la concurrencia), temporizador, API, atención por administración,
   avisos de cancelación, WebSocket, `servidor.ts`.
2. **Frontend (agente B, en paralelo):** tipos y API, conexión de tiempo real con pruebas,
   panel, atender, "No se administró", navegación e insignia, avisos, proxys de Vite y nginx.
3. **Estudios (A y B).**
4. **Integración:** flujo completo con reloj simulado, e2e de recordatorios, documentación,
   `npm run verificar` y `npm run e2e`.

## Supuestos y riesgos

- S9 recordatorio 30 min antes; tras una caída solo se recuperan los últimos 30 min.
- S10 umbrales de prioridad (15 y 5 min); estudios en MEDIA.
- S11 vence a los 60 min desde que se generó (unos 30 min después de la toma, cuando la ficha deja
  de mostrarla); queda visible 12 h y se puede atender tarde.
- S12 atender = administrar o registrar por qué no (sin rostro, auditado). Validar con enfermería.
- S13 recordatorios de todo el hospital, filtrables por sala, sin turnos.
- S14 ven los tres roles; atienden enfermería y administración; el vencido avisa a todo
  administrador activo.
- S15 estudios: el médico programa, enfermería confirma con su rostro.
- S16 sonido y vibración solo para quien atiende, desactivables por tablet.
- Decisiones: `ws` (D9), avisos sin datos con resincronización (D10), temporizador en proceso con
  candado e índice parcial (D11), prioridad automática sin auditar (D12), índices parciales (D13),
  la conexión no renueva la sesión (D14).
- Riesgos: cierre por inactividad en tablets quietas (R1), bus en memoria (R2), Wi-Fi (R3),
  proxys (R4), Prisma e índices parciales (R5), reloj de la tablet (R6), audio bloqueado y sin
  vibración en iOS (R7), volumen de auditoría (R8), frecuencia de 1 h (R9), barra en teléfono
  (R10), casos de uso inferidos (R11).
