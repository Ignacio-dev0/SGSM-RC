# Variables de entorno

El backend lee su configuración de `backend/.env` (plantilla en
[`backend/.env.example`](../backend/.env.example)). Las pruebas usan
[`backend/.env.test`](../backend/.env.test). La lectura y los valores por defecto están en
[`backend/src/config.ts`](../backend/src/config.ts).

| Variable                 | Por defecto          | Para qué                                                      |
| ------------------------ | -------------------- | ------------------------------------------------------------- |
| `NODE_ENV`               | `development`        | `production` activa cookie segura y exige `JWT_SECRETO`       |
| `PORT`                   | `3000`               | Puerto de la API                                              |
| `DATABASE_URL`           | —                    | Conexión a PostgreSQL                                         |
| `JWT_SECRETO`            | valor de desarrollo  | Clave para firmar las sesiones. **Obligatoria en producción** |
| `SESION_INACTIVIDAD_MIN` | `15`                 | Minutos sin actividad que cierran la sesión                   |
| `SESION_MAXIMA_HORAS`    | `12`                 | Duración máxima de una sesión                                 |
| `COOKIE_SEGURA`          | `true` en producción | La cookie de sesión solo viaja por HTTPS                      |
| `BCRYPT_COSTO`           | `10`                 | Costo de bcrypt (las pruebas usan 4)                          |
| `LOGIN_MAX_INTENTOS`     | `3`                  | Intentos fallidos que bloquean la cuenta                      |
| `LOGIN_BLOQUEO_MIN`      | `15`                 | Minutos de bloqueo                                            |

Las variables de la biometría y de los suministros se agregan en
[biometria.md](biometria.md) y [suministros.md](suministros.md).

El frontend no necesita variables para desarrollo: Vite reenvía `/api` al backend en el puerto
3000 ([`frontend/vite.config.ts`](../frontend/vite.config.ts)).

## Base de datos

`docker-compose.yml` levanta PostgreSQL 17 en el puerto `5432` (cambiable con `DB_PUERTO`) con
dos bases: `sgsm` (desarrollo) y `sgsm_test` (pruebas automáticas, se vacía en cada corrida).
Usuario y contraseña de desarrollo: `sgsm` / `sgsm`.
