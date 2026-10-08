# Pruebas automáticas

> Tarea T012 (y las tareas de prueba de cada etapa: T113, T211, T308, T417).

Se trabajó con TDD: cada comportamiento tiene primero su prueba, que falla, y después el código
que la hace pasar.

## Cómo correrlas

```bash
npm run db:up          # la primera vez, o si la base no está levantada
npm test               # backend (Jest) y frontend (Vitest)
npm run verificar      # formato + lint + tipos + pruebas (lo mismo que corre CI)
```

Solo un lado: `npm test -w backend` o `npm test -w frontend`.

**Rendimiento (T702):** `npm run volumen:sembrar -w backend` y después
`npm run volumen:medir -w backend` (contra la base aparte `sgsm_volumen`, nunca la de pruebas):
un año de volumen y la tabla de tiempos en [rendimiento.md](rendimiento.md).

## Backend (Jest + supertest)

- **Unitarias** para la lógica pura: tokens de sesión, auditoría (`cambios`, `sanear`),
  paginación, cálculo de horarios, comparación de patrones faciales.
- **De integración** contra PostgreSQL real (base `sgsm_test`): cada endpoint se prueba con
  pedidos HTTP de verdad (supertest), con un usuario de cada rol.
- Antes de la suite, [`tests/soporte/preparar-base.ts`](../backend/tests/soporte/preparar-base.ts)
  vacía la base de pruebas y aplica las migraciones. **Se niega a correr contra una base que no
  termine en `_test`.**
- Cada prueba arranca con la base vacía (`limpiarBase`) y los roles y permisos cargados
  (`prepararBaseConSeguridad`). Las pruebas corren en serie (`maxWorkers: 1`) porque comparten la
  base.
- El tiempo se controla con `jest.spyOn(reloj, 'ahora')` ([`src/comun/reloj.ts`](../backend/src/comun/reloj.ts)):
  así se prueban la inactividad, los bloqueos, el plazo de 24 h y los horarios de toma sin esperar.
- Ayudantes: [`tests/soporte/`](../backend/tests/soporte/) (`crearUsuario`, `agenteConRol`,
  fábricas de pacientes, camas, insumos, `internarPaciente` y `crearPrescripcionBasica`).
- **Dos transacciones a la vez**: [`tests/soporte/concurrencia.ts`](../backend/tests/soporte/concurrencia.ts)
  deja una transacción abierta con sus bloqueos (`transaccionAbierta`) y manda un pedido mientras
  tanto (`mientrasEspera`): la prueba ve si el pedido esperó el bloqueo y qué respondió después.
  Así se prueban el orden de los bloqueos de las administraciones y los cambios de agenda (D121),
  el catálogo en uso (D116) y, con `Promise.all`, las carreras de usuarios (D120) y de dos
  enfermeras con la misma toma (D113).
- **Recordatorios (E5, T514)**: el ciclo del temporizador se prueba contra la base con el reloj
  simulado (`ejecutarCiclo()` a horas elegidas), incluida la concurrencia (varios ciclos a la vez
  con `Promise.all` no duplican nada). El temporizador se prueba con `jest.useFakeTimers()` y un
  ciclo simulado. **Las pruebas nunca arrancan el temporizador real**: lo arranca `servidor.ts`,
  no `crearApp()`.
- **Tiempo real**: [`tiempo-real.test.ts`](../backend/src/modulos/tiempo-real/tiempo-real.test.ts)
  levanta un servidor HTTP en un puerto libre y se conecta con el cliente de `ws` (cookie, origen,
  códigos de cierre); el latido se dispara a mano.

## Frontend (Vitest + Testing Library + MSW)

- Las pantallas se prueban **como las usa una persona**: se busca por rol y por etiqueta
  accesible, se escribe y se toca con `user-event`.
- La API se simula con **MSW** ([`src/pruebas/servidor.ts`](../frontend/src/pruebas/servidor.ts));
  un pedido no simulado hace fallar la prueba.
- **Contrato con el servidor** ([`src/pruebas/contrato.ts`](../frontend/src/pruebas/contrato.ts)):
  cada cuerpo que una pantalla manda (POST, PATCH, PUT) se valida con el **mismo esquema zod
  del backend** (`backend/src/modulos/*/*.esquemas.ts`). Si la pantalla manda algo que el
  servidor real rechazaría, la prueba falla aunque MSW haya contestado bien. Las respuestas
  reales las cubren las pruebas en navegador (`e2e/`), que corren contra el backend.
- `renderizarApp(ruta, usuario)` ([`src/pruebas/renderizar.tsx`](../frontend/src/pruebas/renderizar.tsx))
  monta la aplicación completa (rutas, sesión, tema) con el usuario indicado; los usuarios de
  ejemplo por rol están en [`src/pruebas/datos.ts`](../frontend/src/pruebas/datos.ts) y los
  datos de cada módulo en `datosPacientes.ts`, `datosPrescripciones.ts`, `datosSuministros.ts`,
  `datosRecordatorios.ts` y `datosEstudios.ts`.
- Las esperas asíncronas (`findBy…`, `waitFor`) llegan hasta **5 s**
  ([`configurar.ts`](../frontend/src/pruebas/configurar.ts)): con todos los archivos en
  paralelo, 1 s no siempre alcanzaba.
- `renderizarApp` usa un **router de datos** (`createMemoryRouter`), como la aplicación, y
  devuelve el `router` para probar el botón Atrás (`router.navigate(-1)`) y el `cliente` de
  consultas, para comprobar qué quedó invalidado en pantallas que no están a la vista. En `configurar.ts` el
  `Request` de Node se envuelve para que acepte la señal de cancelación de jsdom, que el router
  de datos pasa en cada navegación.
- El `QueryClient` de `renderizarApp` no vuelve a pedir al volver a la pantalla
  (`refetchOnWindowFocus: false`), igual que `App.tsx`: una pantalla que lo necesita (Administrar,
  D151) lo pide ella, y la prueba lo comprueba despachando `visibilitychange`. El audio y la vibración
  falsos de los avisos están en [`audioFalso.ts`](../frontend/src/pruebas/audioFalso.ts).
- Además de los cuerpos (`contrato.ts`), el formulario de usuario compara su regla y su mensaje del
  nombre de usuario con el esquema del backend (D160).
- El **tiempo real** se simula con `ws.link` de MSW (`canalTiempoReal` en `servidor.ts`, que
  acepta y manda `conectado`); `datosRecordatorios.ts` trae `avisarCambio()` y
  `registrarConexiones()`. La lógica de reconexión se prueba aparte con un WebSocket falso
  ([`conexion.test.ts`](../frontend/src/tiempoReal/conexion.test.ts)).
- Pruebas transversales: [`cambiosSinGuardar.test.tsx`](../frontend/src/paginas/cambiosSinGuardar.test.tsx)
  (las 7 pantallas con formulario), [`listasQueFallan.test.tsx`](../frontend/src/paginas/listasQueFallan.test.tsx)
  (selectores con Reintentar) y [`chipsDeEstado.test.tsx`](../frontend/src/paginas/chipsDeEstado.test.tsx).
- Lo que depende de la hora ("toca ahora", "atrasada") se arma **relativo a ahora**
  (`enMinutos()`), nunca con fechas fijas.
- Un archivo por pantalla o tema; **ningún archivo pasa de 1000 líneas** (regla `max-lines`
  de ESLint).

## En navegador real (Playwright)

[`e2e/`](../e2e/) recorre la aplicación levantada con los datos de la semilla (backend en
:3000, frontend en :5173 o `E2E_URL`) en Chromium, en **teléfono (375 px), tablet (768 px) y
PC (1366 px)**, con **tema claro y oscuro**:

```bash
npx playwright install chromium   # una sola vez
npm run e2e
```

| Archivo                                                 | Qué verifica                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`responsive.spec.ts`](../e2e/responsive.spec.ts)       | Las pantallas principales de cada rol (también Recordatorios, Estudios, Reportes y Auditoría), en claro y oscuro: sin desplazamiento lateral, nada fuera de la pantalla y controles táctiles de al menos 44 px. Incluye un control que comprueba que el medidor sí detecta un desborde.                                                                                                                                                                                                                         |
| [`teclado.spec.ts`](../e2e/teclado.spec.ts)             | Con Tab se llega a Administrar con foco visible y Enter lo abre; un diálogo retiene el foco y Escape lo cierra devolviéndolo; las filas se abren con Enter.                                                                                                                                                                                                                                                                                                                                                     |
| [`tactil.spec.ts`](../e2e/tactil.spec.ts)               | En el teléfono: el menú en cajón, las tarjetas de prescripción y las pestañas responden al toque.                                                                                                                                                                                                                                                                                                                                                                                                               |
| [`barrido.spec.ts`](../e2e/barrido.spec.ts)             | Con los datos reales de la semilla: en cada paciente internado, usuario e ítem del catálogo, guardar sin tocar no cambia nada; corregir y deshacer la obra social de un paciente y la dosis de una prescripción deja el dato como estaba. Modifica la base de desarrollo y la deja igual (quedan entradas de auditoría).                                                                                                                                                                                        |
| [`ciclo.spec.ts`](../e2e/ciclo.spec.ts)                 | Ciclo completo desde el inicio, solo con lo que ofrece la interfaz: administrar un medicamento confirmando con el rostro (modo demostración), encontrarlo en el historial del paciente, corregir la cantidad y deshacer la corrección.                                                                                                                                                                                                                                                                          |
| [`tareas.spec.ts`](../e2e/tareas.spec.ts)               | Las 15 tareas núcleo de PRODUCT.md (T1–T15), cada una desde el inicio y solo tocando lo que ofrece la interfaz: prueba que se **encuentran**, no solo que funcionan. Incluye "Tomas y estudios para atender", programar un estudio, reportes (el administrador descarga, el médico no) y "Ver quién cambió algo" hasta el antes y después.                                                                                                                                                                      |
| [`recordatorios.spec.ts`](../e2e/recordatorios.spec.ts) | Contra el servidor real con el temporizador: el médico indica una toma para dentro de 10 min; con el panel ya abierto, la tarjeta aparece **sola** por el tiempo real (sin recargar), con "Faltan N min"; Administrar desde la tarjeta llega con paciente y prescripción elegidos, se confirma con el rostro y el recordatorio queda atendido. Al final el médico finaliza la indicación. Tarda hasta un ciclo del temporizador (60 s). Una segunda prueba registra **"No se administró"** con el motivo (T12). |
| [`estudios.spec.ts`](../e2e/estudios.spec.ts)           | T13 de punta a punta: el médico programa un estudio desde la ficha y enfermería, en otra sesión, confirma con su rostro que se realizó.                                                                                                                                                                                                                                                                                                                                                                         |
| [`conexion.spec.ts`](../e2e/conexion.spec.ts)           | T704, cortes de conexión: si se corta el tiempo real la pantalla lo dice (franja e insignia) y se reconecta sola; si la red se cae justo al registrar una administración, dice "No se sabe si quedó registrada".                                                                                                                                                                                                                                                                                                |

Los usuarios son los de la semilla de desarrollo (se pueden cambiar con `E2E_USUARIO_*` y
`E2E_CLAVE_*`). No corren en la integración continua porque necesitan la base sembrada y los
dos servidores; se corren antes de cerrar un cambio de interfaz. Con `E2E_URL` se apuntan a otra
interfaz (por ejemplo una compilación fija servida con `vite preview` en el puerto 4173).

Última corrida completa (2026-10-07, compilación fija contra el servidor real): 59 de 59 en PC
(las que se recorren una vez) y la matriz responsive 27 de 27 en teléfono, tablet y PC, en claro
y oscuro. Suites unitarias y de integración: backend 644 pruebas en 68 archivos, frontend 1300 en 92 (corrida del 2026-10-08, después de la revisión F1–F20).

## Control de permisos con los tres roles

La definición de terminado del plan pide verificar los permisos con los tres roles. Cada módulo
del backend tiene un bloque "control de acceso" que prueba Administrador, Médico y Enfermero
contra sus endpoints.

## Lo que no cubren

- La captura real de la cámara y el modelo de reconocimiento facial en el navegador (ver
  [biometria.md](biometria.md)): se prueban la comparación de patrones en el backend y el flujo
  de la pantalla con un motor simulado.
- Pruebas en tablets reales y de usabilidad: corresponden a la etapa E7. El rendimiento con un año
  de volumen se mide aparte, con un script ([rendimiento.md](rendimiento.md)); la suite solo
  comprueba que las consultas reescritas para el volumen devuelven lo mismo.
