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
  fábricas de pacientes, camas e insumos).

## Frontend (Vitest + Testing Library + MSW)

- Las pantallas se prueban **como las usa una persona**: se busca por rol y por etiqueta
  accesible, se escribe y se toca con `user-event`.
- La API se simula con **MSW** ([`src/pruebas/servidor.ts`](../frontend/src/pruebas/servidor.ts));
  un pedido no simulado hace fallar la prueba.
- `renderizarApp(ruta, usuario)` ([`src/pruebas/renderizar.tsx`](../frontend/src/pruebas/renderizar.tsx))
  monta la aplicación completa (rutas, sesión, tema) con el usuario indicado; los usuarios de
  ejemplo por rol están en [`src/pruebas/datos.ts`](../frontend/src/pruebas/datos.ts).

## Control de permisos con los tres roles

La definición de terminado del plan pide verificar los permisos con los tres roles. Cada módulo
del backend tiene un bloque "control de acceso" que prueba Administrador, Médico y Enfermero
contra sus endpoints.

## Lo que no cubren

- La captura real de la cámara y el modelo de reconocimiento facial en el navegador (ver
  [biometria.md](biometria.md)): se prueban la comparación de patrones en el backend y el flujo
  de la pantalla con un motor simulado.
- Pruebas en tablets reales, de rendimiento y de usabilidad: corresponden a la etapa E7.
