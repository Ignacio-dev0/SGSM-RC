# Variables de entorno

El backend lee su configuración de `backend/.env` (plantilla en
[`backend/.env.example`](../backend/.env.example)). Las pruebas usan
[`backend/.env.test`](../backend/.env.test). La lectura y los valores por defecto están en
[`backend/src/config.ts`](../backend/src/config.ts).

| Variable                            | Por defecto          | Para qué                                                      |
| ----------------------------------- | -------------------- | ------------------------------------------------------------- |
| `NODE_ENV`                          | `development`        | `production` activa cookie segura y exige `JWT_SECRETO`       |
| `PORT`                              | `3000`               | Puerto de la API                                              |
| `DATABASE_URL`                      | —                    | Conexión a PostgreSQL                                         |
| `JWT_SECRETO`                       | valor de desarrollo  | Clave para firmar las sesiones. **Obligatoria en producción** |
| `SESION_INACTIVIDAD_MIN`            | `15`                 | Minutos sin actividad que cierran la sesión                   |
| `SESION_MAXIMA_HORAS`               | `12`                 | Duración máxima de una sesión                                 |
| `COOKIE_SEGURA`                     | `true` en producción | La cookie de sesión solo viaja por HTTPS                      |
| `BCRYPT_COSTO`                      | `10`                 | Costo de bcrypt (las pruebas usan 4)                          |
| `LOGIN_MAX_INTENTOS`                | `3`                  | Intentos fallidos que bloquean la cuenta                      |
| `LOGIN_BLOQUEO_MIN`                 | `15`                 | Minutos de bloqueo                                            |
| `BIOMETRIA_UMBRAL`                  | `0.5`                | Distancia máxima entre patrones para aceptar el rostro        |
| `BIOMETRIA_MAX_INTENTOS`            | `3`                  | Validaciones fallidas seguidas que cancelan la operación      |
| `BIOMETRIA_VALIDEZ_SEG`             | `120`                | Vigencia del comprobante de validación facial                 |
| `SUMINISTRO_PLAZO_CORRECCION_HORAS` | `24`                 | Plazo para corregir un suministro                             |

### Recordatorios y tiempo real (E5)

Valores de [diseno-e5.md](diseno-e5.md) (supuestos S9–S11); el detalle de cada regla está en
[recordatorios.md](recordatorios.md).

| Variable                               | Por defecto | Para qué                                                                                         |
| -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `RECORDATORIOS_TEMPORIZADOR`           | `true`      | El servidor corre el temporizador de recordatorios (`false` lo apaga; las pruebas nunca lo usan) |
| `RECORDATORIOS_INTERVALO_SEG`          | `60`        | Segundos entre dos ciclos del temporizador                                                       |
| `RECORDATORIO_ANTICIPACION_MIN`        | `30`        | Minutos antes de la toma en que aparece su recordatorio                                          |
| `RECORDATORIO_VENCIMIENTO_MIN`         | `60`        | Minutos desde que se generó tras los que vence sin atender                                       |
| `RECORDATORIO_PRIORIDAD_ALTA_MIN`      | `5`         | Con esta cantidad de minutos o menos hasta la toma (o atrasada) la prioridad es ALTA             |
| `RECORDATORIO_PRIORIDAD_MEDIA_MIN`     | `15`        | Hasta esta cantidad de minutos es MEDIA; con más, BAJA                                           |
| `RECORDATORIO_VENCIDOS_VISIBLES_HORAS` | `12`        | Horas que un recordatorio vencido sigue en el panel para atenderlo tarde                         |
| `TIEMPO_REAL_LATIDO_SEG`               | `30`        | Segundos entre latidos del WebSocket (revisan la sesión y el permiso de cada conexión)           |
| `TIEMPO_REAL_ORIGENES`                 | (vacío)     | Orígenes aceptados además del propio, separados por comas (ej.: `http://localhost:8080`)         |

Frontend: `VITE_BIOMETRIA_MODO` (`camara` por defecto o `simulado`), en
`frontend/.env.development.local` (plantilla en `frontend/.env.example`). Ver
[biometria.md](biometria.md).

El frontend no necesita variables para desarrollo: Vite reenvía `/api` al backend en el puerto
3000 ([`frontend/vite.config.ts`](../frontend/vite.config.ts)).

## Base de datos

`docker-compose.yml` levanta PostgreSQL 17 en el puerto `5432` (cambiable con `DB_PUERTO`) con
dos bases: `sgsm` (desarrollo) y `sgsm_test` (pruebas automáticas, se vacía en cada corrida).
Usuario y contraseña de desarrollo: `sgsm` / `sgsm`.
