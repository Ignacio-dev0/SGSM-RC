# Variables de entorno

El backend lee su configuración de `backend/.env` (plantilla en
[`backend/.env.example`](../backend/.env.example)). Las pruebas usan
[`backend/.env.test`](../backend/.env.test). La lectura y los valores por defecto están en
[`backend/src/config.ts`](../backend/src/config.ts).

| Variable                            | Por defecto          | Para qué                                                                                                                    |
| ----------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                          | `development`        | `production` activa cookie segura y exige `JWT_SECRETO` y `BIOMETRIA_CLAVE`                                                 |
| `PORT`                              | `3000`               | Puerto de la API                                                                                                            |
| `DATABASE_URL`                      | —                    | Conexión a PostgreSQL                                                                                                       |
| `JWT_SECRETO`                       | valor de desarrollo  | Clave para firmar las sesiones. **Obligatoria en producción**                                                               |
| `SESION_INACTIVIDAD_MIN`            | `15`                 | Minutos sin actividad que cierran la sesión                                                                                 |
| `SESION_MAXIMA_HORAS`               | `12`                 | Duración máxima de una sesión                                                                                               |
| `COOKIE_SEGURA`                     | `true` en producción | La cookie de sesión solo viaja por HTTPS; también activa HSTS (se sirve por HTTPS)                                          |
| `BCRYPT_COSTO`                      | `10`                 | Costo de bcrypt (las pruebas usan 4)                                                                                        |
| `LOGIN_MAX_INTENTOS`                | `3`                  | Intentos fallidos que bloquean la cuenta                                                                                    |
| `LOGIN_BLOQUEO_MIN`                 | `15`                 | Minutos de bloqueo                                                                                                          |
| `LOGIN_IP_MAX_FALLIDOS`             | `10`                 | Fallidos desde una misma IP que frenan el login con 429 (`0` lo desactiva)                                                  |
| `LOGIN_IP_VENTANA_MIN`              | `15`                 | Minutos de la ventana deslizante del límite por IP                                                                          |
| `CONFIAR_PROXY`                     | `1`                  | `trust proxy` de Express: proxies delante de la API (nginx o Vite). `false` si se expone sin proxy                          |
| `BIOMETRIA_UMBRAL`                  | `0.5`                | Distancia máxima entre patrones para aceptar el rostro                                                                      |
| `BIOMETRIA_MAX_INTENTOS`            | `3`                  | Validaciones fallidas seguidas que cancelan la operación                                                                    |
| `BIOMETRIA_VALIDEZ_SEG`             | `120`                | Vigencia del comprobante de validación facial                                                                               |
| `BIOMETRIA_CLAVE`                   | clave de desarrollo  | Clave AES-256 (32 bytes en base64 o hex) del patrón y la foto. **Obligatoria en producción** y distinta de la de desarrollo |
| `BIOMETRIA_CLAVE_ANTERIOR`          | (vacío)              | Solo durante una rotación: la clave anterior, para volver a cifrar con la nueva                                             |
| `SUMINISTRO_PLAZO_CORRECCION_HORAS` | `24`                 | Plazo para corregir un suministro                                                                                           |

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

### Instalador (T803)

Solo las lee el instalador (`node dist/scripts/instalar.js` o `npm run instalar -w backend`), y
solo si no hay ningún usuario Administrador activo: son los datos del **primer administrador**. Lo
que falte se pregunta si hay una terminal; sin terminal, faltar alguna es un error. Se validan con
las mismas reglas que el alta de usuarios. Detalle en [despliegue.md](despliegue.md) (paso 7).

| Variable                  | Para qué                                                                                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INSTALAR_ADMIN_USUARIO`  | Nombre de usuario: 3 a 30 caracteres, letras sin tildes ni ñ, números, punto, guion o guion bajo; se guarda en minúsculas                                                                                                                                                              |
| `INSTALAR_ADMIN_NOMBRE`   | Nombre                                                                                                                                                                                                                                                                                 |
| `INSTALAR_ADMIN_APELLIDO` | Apellido                                                                                                                                                                                                                                                                               |
| `INSTALAR_ADMIN_DNI`      | DNI, 7 u 8 dígitos (con o sin puntos)                                                                                                                                                                                                                                                  |
| `INSTALAR_ADMIN_CLAVE`    | Contraseña: al menos 8 caracteres, con letras y números. Nunca se muestra; mejor pasarla sin escribirla en el comando (`-e INSTALAR_ADMIN_CLAVE` toma la de la sesión). También la usa `--restablecer-clave` ([despliegue.md](despliegue.md#si-el-administrador-olvidó-la-contraseña)) |

No van en `backend/.env` ni en el `.env` del servidor: se pasan solo al correr el instalador.

Frontend: `VITE_BIOMETRIA_MODO` (`camara` por defecto o `simulado`), en
`frontend/.env.development.local` (plantilla en `frontend/.env.example`). Ver
[biometria.md](biometria.md).

El frontend no necesita variables para desarrollo: Vite reenvía `/api` al backend en el puerto
3000 ([`frontend/vite.config.ts`](../frontend/vite.config.ts)).

La clave, la rotación y el límite por IP se explican en
[seguridad.md](seguridad.md#revisión-de-seguridad-t705). Para generar una clave:
`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.

## Base de datos

`docker-compose.yml` levanta PostgreSQL 17 en el puerto `5432` (cambiable con `DB_PUERTO`) con
dos bases: `sgsm` (desarrollo) y `sgsm_test` (pruebas automáticas, se vacía en cada corrida).
Usuario y contraseña de desarrollo: `sgsm` / `sgsm`.

## Docker Compose (servidor del hospital)

En el servidor la API no lee `backend/.env`: sus variables las fija `docker-compose.yml` y las que
cambian por instalación van en el `.env` de la raíz (plantilla [`.env.ejemplo`](../.env.ejemplo)),
que además activa el perfil `completo` con `COMPOSE_PROFILES=completo`. Fijas: `NODE_ENV=production`,
`COOKIE_SEGURA=true` (siempre detrás de nginx con HTTPS) y `TZ=America/Argentina/Buenos_Aires`.

| Variable del `.env`                                       | Para qué                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `JWT_SECRETO`, `BIOMETRIA_CLAVE`, `POSTGRES_CLAVE`        | Secretos: con el perfil activado desde el `.env`, compose no arranca sin ellos |
| `BIOMETRIA_CLAVE_ANTERIOR`                                | Solo durante una rotación de la clave biométrica                               |
| `SGSM_SERVIDOR`, `SGSM_IP`                                | Nombres e IP del servidor para el certificado HTTPS                            |
| `HTTPS_PUERTO`, `HTTP_PUERTO`, `DB_PUERTO`                | Puertos en la PC (8443, 8080 y `127.0.0.1:5432` en la plantilla)               |
| `LOGIN_IP_MAX_FALLIDOS`, `LOGIN_IP_VENTANA_MIN`           | Límite por IP del login (`0` en la plantilla por Docker Desktop)               |
| `CONFIAR_PROXY`, `TIEMPO_REAL_ORIGENES`                   | Por defecto `1` y vacío: nginx es el único proxy y conserva el `Host`          |
| `RESPALDO_HORA`, `RESPALDO_RETENCION`, `RESPALDO_CARPETA` | Respaldo diario                                                                |
| `VITE_BIOMETRIA_MODO`                                     | `camara` o `simulado`, se fija al construir la imagen de la interfaz           |

Sin `.env` (desarrollo) compose no pide nada y la base usa `sgsm` / `sgsm`. Detalle de cada
variable, cómo generar los secretos y el resto del despliegue: [despliegue.md](despliegue.md).
