# Seguridad: sesión, permisos y auditoría

> Tareas T104, T105, T106, T112, T705 · Cubre CU05, CU06, RN05, RN06, RF15, RNF05, RNF06, RNF10.

## Inicio de sesión (T105 · CU06)

- Usuario y contraseña. Las contraseñas se guardan con **bcrypt** (costo 10, configurable con
  `BCRYPT_COSTO`); nunca se devuelven ni se guardan en la auditoría.
- Si el usuario no existe, está dado de baja o la contraseña es incorrecta, la respuesta es
  siempre la misma (`401 CREDENCIALES_INVALIDAS`, "Usuario o contraseña incorrectos") y se compara
  igual contra un hash señuelo, para no revelar qué usuarios existen.
- La sesión es un **JWT firmado (HS256)** que viaja en la cookie `sgsm_sesion`:
  `httpOnly` (el JavaScript de la página no la puede leer), `SameSite=Strict` (no viaja en
  pedidos desde otros sitios), `Path=/api` y `Secure` (solo por HTTPS) cuando `COOKIE_SEGURA=true`,
  que es el valor por defecto en producción (D58).
- **Cierre por inactividad**: el token vence a los `SESION_INACTIVIDAD_MIN` minutos (15 por
  defecto). Cada pedido lo renueva, así que la sesión solo se cierra si la tablet queda sin uso.
  El frontend además cierra la sesión por su cuenta si no detecta toques ni teclas en ese tiempo,
  para no dejar datos clínicos en pantalla.
- **Duración máxima**: aunque haya actividad, una sesión dura como mucho
  `SESION_MAXIMA_HORAS` (12 h, un turno largo).
- **El usuario se relee de la base en cada pedido**: una baja, un cambio de rol o de permisos
  tiene efecto inmediato, sin esperar a que venza la sesión.
- El frontend recuerda en la tablet solo el **nombre de usuario** (opción "Recordar mi usuario"),
  nunca la contraseña.

## Bloqueo por intentos fallidos (T112)

- El **tercer** intento fallido seguido (`LOGIN_MAX_INTENTOS`) bloquea la cuenta
  **15 minutos** (`LOGIN_BLOQUEO_MIN`) y responde `423 CUENTA_BLOQUEADA` con la hora de
  desbloqueo.
- Mientras dura el bloqueo no se evalúa la contraseña (ni siquiera la correcta).
- El bloqueo queda en la auditoría (`BLOQUEAR_CUENTA`) y genera una **notificación a cada
  administrador activo**, visible en la campana de la barra superior.
- Un ingreso correcto reinicia el contador. Los intentos con usuarios inexistentes se auditan
  pero no bloquean nada: a quien prueba muchos usuarios lo frena el **límite por IP** (T705,
  [más abajo](#límite-de-intentos-por-ip)).

## Roles y permisos (T106 · RN05 · RF15)

Cada endpoint exige un **permiso**, nunca un rol (`requierePermiso('pacientes.gestionar')`). El
rol define el conjunto base y el administrador puede sumar **permisos adicionales** a un usuario
puntual (CU05). Permisos efectivos = permisos del rol ∪ permisos adicionales.

Fuente de verdad: [`backend/src/modulos/seguridad/catalogo-permisos.ts`](../backend/src/modulos/seguridad/catalogo-permisos.ts).

| Permiso                    | Administrador | Médico | Enfermero |
| -------------------------- | :-----------: | :----: | :-------: |
| `usuarios.gestionar`       |       ✔       |        |           |
| `usuarios.permisos`        |       ✔       |        |           |
| `biometria.gestionar`      |       ✔       |        |           |
| `pacientes.ver`            |       ✔       |   ✔    |     ✔     |
| `pacientes.gestionar`      |       ✔       |   ✔    |           |
| `catalogo.ver`             |       ✔       |   ✔    |     ✔     |
| `catalogo.gestionar`       |       ✔       |        |           |
| `prescripciones.ver`       |       ✔       |   ✔    |     ✔     |
| `prescripciones.gestionar` |       ✔       |   ✔    |           |
| `suministros.registrar`    |       ✔       |        |     ✔     |
| `suministros.ver`          |       ✔       |   ✔    |     ✔     |
| `suministros.corregir`     |       ✔       |        |     ✔     |
| `recordatorios.ver`        |       ✔       |   ✔    |     ✔     |
| `recordatorios.atender`    |       ✔       |        |     ✔     |
| `estudios.ver`             |       ✔       |   ✔    |     ✔     |
| `estudios.gestionar`       |       ✔       |   ✔    |           |
| `estudios.confirmar`       |       ✔       |        |     ✔     |
| `reportes.ver`             |       ✔       |   ✔    |           |
| `reportes.exportar`        |       ✔       |        |           |
| `auditoria.ver`            |       ✔       |        |           |

El reparto entre Médico y Enfermero es un **supuesto** (ver [supuestos.md](supuestos.md)): si
enfermería también interna pacientes, alcanza con darle `pacientes.gestionar` como permiso
adicional a quien corresponda, o moverlo al rol en el catálogo. Los permisos de recordatorios y
estudios (E5) siguen los supuestos S14 y S15 de [diseno-e5.md](diseno-e5.md): ven los tres roles,
atiende y confirma enfermería, programa el médico. `recordatorios.ver` también decide quién
recibe los avisos del tiempo real ([recordatorios.md](recordatorios.md)). Los de reportes y
auditoría (E6) siguen el supuesto S17 de [diseno-e6.md](diseno-e6.md): ven reportes el
administrador y el médico, exporta solo el administrador y la auditoría la consulta solo el
administrador; un enfermero jefe los recibe como permiso adicional (CU05). Ver
[reportes.md](reportes.md).

El frontend oculta las opciones del menú y las pantallas sin permiso, pero eso es solo
comodidad: **la seguridad real está en el backend**, que valida el permiso en cada endpoint.

## Auditoría (T104 · RN06 · RNF10)

- Cada servicio que modifica datos llama a `registrarAuditoria` **dentro de la misma
  transacción** que el cambio: si el cambio falla, tampoco queda el registro, y no puede haber
  un cambio sin auditar.
- Se guarda: usuario, fecha y hora, acción, entidad, id, paciente afectado (si corresponde) y
  los valores **anterior y nuevo, solo de los campos que cambiaron**.
- Contraseñas, patrones faciales y fotos (también sus versiones cifradas) se reemplazan por
  `[oculto]`.
- Un **trigger** en la base rechaza cualquier `UPDATE` o `DELETE` sobre la tabla `auditoria`.
- La consulta (`GET /api/auditoria`, solo con `auditoria.ver`) vuelve a ocultar, a cualquier
  profundidad, toda clave que parezca sensible (contraseña, hash, patrón, foto, token, secreto)
  aunque una entrada vieja o cargada a mano la tuviera (D49 de [reportes.md](reportes.md)).

Acciones registradas hasta ahora:

| Acción                       | Entidad                   | Cuándo                                |
| ---------------------------- | ------------------------- | ------------------------------------- |
| `INICIAR_SESION`             | Usuario                   | Ingreso correcto                      |
| `INICIAR_SESION_FALLIDO`     | Usuario                   | Usuario o contraseña incorrectos      |
| `BLOQUEAR_CUENTA`            | Usuario                   | Tercer intento fallido                |
| `CERRAR_SESION`              | Usuario                   | Salida voluntaria                     |
| `CREAR`, `MODIFICAR`, `BAJA` | Usuario y demás entidades | Altas, modificaciones y bajas lógicas |
| `MODIFICAR_PERMISOS`         | Usuario                   | Cambio de permisos adicionales        |
| `EXPORTAR`                   | Reporte                   | Descarga de un reporte en PDF o Excel |

Las acciones de los módulos clínicos, biometría y suministros se listan en
[endpoints.md](endpoints.md).

## Revisión de seguridad (T705)

Etapa E7. Resultado: el patrón facial y la foto se cifran en reposo (RNF06), se probó que
ninguna respuesta de la API expone datos sensibles, se cerraron los encabezados HTTP y el tamaño
de los pedidos, y se agregó un límite de intentos por IP al inicio de sesión. Decisiones
D50–D62 al final de esta sección.

### Cifrado del dato biométrico en reposo (RNF06)

- El patrón (128 valores) y la foto de referencia se guardan en `patron_cifrado` y
  `foto_cifrada` (`bytea`) cifrados con **AES-256-GCM** (`node:crypto`). Ya no hay columnas en
  claro. Código: [`comun/cifrado.ts`](../backend/src/comun/cifrado.ts) (genérico) y
  [`biometria/cifrado-biometrico.ts`](../backend/src/modulos/biometria/cifrado-biometrico.ts).
- Formato de cada blob (D50):

  | Bytes | Contenido                                                               |
  | ----- | ----------------------------------------------------------------------- |
  | 1     | Formato: `1` = AES-256-GCM (`0` = en claro, pendiente; solo transición) |
  | 4     | Huella de la clave (primeros 4 bytes de su SHA-256)                     |
  | 12    | IV aleatorio, distinto en cada cifrado                                  |
  | 16    | Etiqueta de autenticación de GCM                                        |
  | resto | Cifrado (el patrón, como 128 `double` big-endian = 1024 bytes)          |

  El encabezado y el contexto `datos_biometricos.<patron|foto>:<usuarioId>` van como datos
  autenticados: un blob alterado, con el encabezado tocado o **copiado al registro de otro
  usuario** no se descifra.

- **Dónde se descifra**: solo en memoria, para comparar en la validación 1:1 y para servir la
  foto al administrador. Nunca va en claro a la base, al registro del servidor ni a la auditoría.
- Si un dato no se puede descifrar (clave equivocada, alterado o copiado), la validación y la foto
  responden `500 BIOMETRIA_ILEGIBLE` ("Pídale al administrador que lo registre de nuevo") y el
  motivo, sin el dato, queda en el registro del servidor (D61).
- **Clave** (D51): `BIOMETRIA_CLAVE`, 32 bytes en base64 (44 caracteres) o en hexadecimal (64).
  Para generar una:

  ```bash
  node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
  ```

  En desarrollo y pruebas, si falta, se usa la clave fija `CLAVE_BIOMETRIA_DESARROLLO` de
  [`config.ts`](../backend/src/config.ts) (el base64 de `sgsm-rc-solo-para-desarrollo-001`). Con
  `NODE_ENV=production` el servidor **no arranca** sin `BIOMETRIA_CLAVE` ni con la de desarrollo.
  **Si se pierde la clave se pierden los rostros**: hay que volver a registrarlos. Guardar una
  copia fuera del servidor.

#### Migración de los datos existentes (D52)

SQL no tiene la clave, así que se resolvió en un solo paso, sin columnas en claro a medio camino:

1. La migración [`20261007184335_biometria_cifrada`](../backend/prisma/migrations/20261007184335_biometria_cifrada/migration.sql)
   agrega las columnas, copia cada registro existente en **formato 0** (un byte `0` y los datos
   en claro; el patrón con `float8send`, igual que `patronABytes()`), borra `patron` y
   `foto_referencia` y controla el largo del patrón cifrado (`datos_biometricos_patron_128`).
2. `npm run biometria:cifrar -w backend` (en Docker, `node dist/scripts/cifrar-biometria.js`)
   cifra con la clave actual todo lo que esté en formato 0. Es idempotente y no cambia
   `actualizadoEn`.
3. **El servidor corre lo mismo al arrancar**, antes de atender pedidos: aunque nadie corra el
   script, ningún rostro queda en claro después del primer arranque. La aplicación nunca usa un
   dato en formato 0 como válido.

En la base de desarrollo ya se aplicó la migración y se corrió el script (3 registros cifrados).

#### Rotación de la clave (D53)

1. Generar una clave nueva.
2. Configurar `BIOMETRIA_CLAVE=<nueva>` y `BIOMETRIA_CLAVE_ANTERIOR=<actual>` y reiniciar la API.
   Al arrancar vuelve a cifrar con la nueva todo lo cifrado con la anterior (la reconoce por la
   huella); también se puede correr `npm run biometria:cifrar -w backend`, que informa cuántos
   cifró y si alguno no se pudo leer (sale con código 1).
3. Cuando el script informa `Registros por cifrar: 0`, quitar `BIOMETRIA_CLAVE_ANTERIOR` y
   reiniciar. Destruir la clave vieja (y tener en cuenta que las copias de seguridad anteriores
   siguen cifradas con ella).

### Datos sensibles expuestos

- Se revisaron todas las respuestas de la API: cada servicio arma su DTO campo por campo
  (`aDto*`) y las relaciones con usuarios solo traen id, apellido y nombre. **No se encontró
  ninguna exposición**; la prueba
  [`datos-sensibles.test.ts`](../backend/tests/integracion/datos-sensibles.test.ts) carga datos
  en todos los módulos, recorre 37 respuestas (listados, detalles, altas, cambio de contraseña,
  auditoría, reportes) y verifica que no aparezcan claves de contraseña, hash, patrón, foto,
  token, secreto o cifrado, ni un hash bcrypt, ni un JWT, ni los valores del patrón o la foto.
  El único comprobante que sale es `validacionToken`, en la respuesta de `/api/biometria/validar`.
- La **foto** sale solo por `GET /api/biometria/usuarios/:id/foto` con `biometria.gestionar` (ni
  siquiera la persona dueña del rostro la ve), con su tipo, `Cache-Control: no-store` y
  `X-Content-Type-Options: nosniff`. Al registrarla se verifica que sus primeros bytes sean del
  tipo declarado (JPEG, PNG o WebP; D54): un HTML o SVG disfrazado de imagen se rechaza con 400.
- **Errores 500**: siempre `{ codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' }`,
  sin mensaje interno ni traza, en todos los entornos (probado con `NODE_ENV=production` y una
  base inexistente). El detalle queda solo en el registro del servidor (D61).
- Un cuerpo demasiado grande antes caía en un 500: ahora es `413 CUERPO_DEMASIADO_GRANDE` (D59).

### Encabezados HTTP y cookie

Encabezados que pone la API (helmet, [`app.ts`](../backend/src/app.ts)); probados con supertest
en [`seguridad-http.test.ts`](../backend/src/seguridad-http.test.ts):

| Encabezado                     | Valor                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `Content-Security-Policy`      | `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` (D56) |
| `Strict-Transport-Security`    | `max-age=31536000; includeSubDomains`, **solo** con `COOKIE_SEGURA=true` (D57)          |
| `Cache-Control`                | `no-store` en todo `/api` (D55)                                                         |
| `X-Content-Type-Options`       | `nosniff`                                                                               |
| `X-Frame-Options`              | `DENY`                                                                                  |
| `Referrer-Policy`              | `no-referrer`                                                                           |
| `Cross-Origin-Resource-Policy` | `same-origin` (también `Cross-Origin-Opener-Policy` y los demás de helmet)              |
| `X-Powered-By`                 | no se envía                                                                             |

- **Cookie de sesión** (D58): `sgsm_sesion=…; Path=/api; HttpOnly; Secure; SameSite=Strict`
  (`Secure` con `COOKIE_SEGURA=true`). Al cerrar sesión se borra con los mismos atributos.
- **Tamaño del cuerpo JSON** (D59): 100 KB en toda la API; solo `/api/biometria/usuarios` acepta
  hasta `LIMITE_CUERPO_REGISTRO` (≈ 715 KB: la foto de 512 KB en base64 más el patrón).
- **CSP de la interfaz**: la interfaz la sirve **nginx**, no Express, así que su CSP la tiene que
  poner nginx (ver [Qué queda para el despliegue](#qué-queda-para-el-despliegue)).

### Límite de intentos por IP

Además del bloqueo por cuenta (T112), [`auth/limite-ip.ts`](../backend/src/modulos/auth/limite-ip.ts)
frena a quien prueba muchos usuarios con pocas contraseñas cada uno (D60):

- Cuenta solo los intentos **fallidos** (`401 CREDENCIALES_INVALIDAS` y `423 CUENTA_BLOQUEADA`)
  de cada IP en una **ventana deslizante** de `LOGIN_IP_VENTANA_MIN` minutos (15). Con
  `LOGIN_IP_MAX_FALLIDOS` (10) fallidos, el siguiente intento, aunque sea correcto, no se evalúa:
  `429 DEMASIADOS_INTENTOS`, encabezado `Retry-After` y `detalles.reintentarEnSegundos`. Se libera
  un intento cuando vence el fallido más viejo. `0` lo desactiva.
- Los ingresos correctos y los datos mal formados (400) no suman: un cambio de turno con muchos
  ingresos desde la misma tablet no se frena.
- Vive en la memoria del proceso y olvida las IP sin fallidos recientes.
- La IP es la del cliente que informa el proxy (`X-Forwarded-For`): la API confía en **un** proxy
  (`CONFIAR_PROXY=1`, nginx en Docker o Vite en desarrollo). Sin esto, detrás de nginx todas las
  tablets tendrían la misma IP y un barrido bloquearía el ingreso de todo el hospital.

### Dependencias

`npm audit --omit=dev` en la raíz (07/10/2026): 5 avisos en 2 paquetes; ninguno nos afecta y no
hay actualización compatible (todo está en la última versión que permiten los rangos; la única
"solución" del audit es `--force`, que baja de versión mayor). D62.

| Paquete (vía)                                             | Gravedad | ¿Nos afecta?                                                                                                                                                                                                                  |
| --------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deepmerge-ts` < 8 (vía `@prisma/config` ← `prisma` 6.19) | alta     | No. Agota la pila al combinar objetos que se referencian a sí mismos. Solo lo usa el CLI de Prisma para leer `prisma.config.ts` (no tenemos); la API no lo carga y nunca recibe datos de un usuario. Se va con Prisma 8 (D1). |
| `uuid` < 11.1.1 (vía `exceljs` 4.4)                       | moderada | No. El fallo es con `v3`/`v5`/`v6` y un `buf` propio; exceljs solo llama a `v4()` sin argumentos.                                                                                                                             |

### Qué queda para el despliegue

HTTPS y nginx los arma el despliegue (T802), no esta tarea. Para que lo de arriba funcione:

- **`docker-compose.yml`**: el servicio `backend` corre con `NODE_ENV=production`, así que
  **necesita `BIOMETRIA_CLAVE`** (si no, no arranca). La semilla (`docker compose run … npm run
db:sembrar`) tiene que correr con la misma clave que la API. `CONFIAR_PROXY` puede quedar en su
  valor por defecto (1): nginx ya agrega `X-Forwarded-For`.
- Con HTTPS: `COOKIE_SEGURA=true` (por defecto en producción) activa `Secure` y HSTS en la API.
- **Encabezados que tiene que poner nginx** para la interfaz (en `location /` y `/models/`, no en
  `/api/`, que ya trae los suyos):

  ```nginx
  add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-EydXdSVb/MXm14YVRAlKnNE57dbQ99OQHQuncw00eMA='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
  add_header Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "no-referrer" always;
  add_header X-Frame-Options "DENY" always;
  # Solo con HTTPS:
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  ```

  Por qué cada fuente: `connect-src 'self'` cubre `/api`, el WebSocket `/api/tiempo-real` y los
  modelos de face-api que se descargan con `fetch` desde `/models`; `'wasm-unsafe-eval'` permite
  compilar WebAssembly si TensorFlow.js usa ese motor (no habilita `eval` de JavaScript; probar en
  la tablet si se puede quitar); el `sha256-…` es el script en línea de `index.html` que aplica
  el tema guardado (si cambia ese script hay que recalcularlo, o pasarlo a un archivo);
  `style-src 'unsafe-inline'` lo exige MUI (emotion inserta estilos); `img-src data: blob:` la
  vista previa de la foto capturada; la cámara (`getUserMedia`) no depende de la CSP sino de
  `Permissions-Policy: camera=(self)` y de HTTPS. Un `add_header` dentro de un `location`
  reemplaza a los del `server`: repetirlos donde haga falta.

- `client_max_body_size 2m` de nginx alcanza (la API pone su propio límite).

### Riesgos residuales

| Riesgo                                                                                       | Qué lo mitiga hoy                                                                   | Qué faltaría                                                    |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| La clave está en una variable de entorno del mismo servidor que la base                      | El cifrado protege volcados, copias de seguridad y el disco de la base              | Un gestor de secretos o KMS; permisos estrictos sobre el `.env` |
| Perder `BIOMETRIA_CLAVE` hace ilegibles todos los rostros                                    | Error claro `BIOMETRIA_ILEGIBLE`; se pueden volver a registrar                      | Copia de la clave fuera del servidor (procedimiento de E8)      |
| Sin prueba de vida: una foto impresa puede engañar al detector                               | Validación 1:1 con umbral estricto, auditoría de cada fallo, cancelación al tercero | Detección de parpadeo o un servicio con _liveness_              |
| El patrón lo calcula la tablet: con acceso a la API y al patrón de otro se podría falsificar | El patrón nunca sale de la API; ahora tampoco se lee de la base sin la clave        | Firmar las capturas en el dispositivo o un servicio externo     |
| HTTP en la red hasta T802: la sesión y el patrón viajan sin cifrar                           | `localhost` en desarrollo; Docker local                                             | HTTPS (T802) con `COOKIE_SEGURA=true` y HSTS                    |
| La CSP de la interfaz depende de nginx y necesita `'unsafe-inline'` en estilos               | La API no sirve HTML; React escapa el texto                                         | Configurarla en nginx (arriba); nonces para emotion             |
| Límite por IP y comprobantes usados viven en memoria                                         | Una sola instancia; el bloqueo por cuenta (en la base) sigue funcionando            | Redis o la base si hay más de una instancia                     |
| Si la API se expone sin nginx con `CONFIAR_PROXY=1`, la IP se puede falsear                  | Queda el bloqueo por cuenta; el compose no publica el puerto de la API              | `CONFIAR_PROXY=false` en ese caso                               |
| Las dependencias con avisos siguen en el audit                                               | No se usan de la forma vulnerable (tabla de dependencias)                           | Prisma 8 y exceljs 5 cuando sean compatibles (D1)               |
| Otros datos personales (DNI, nombres, valores en la auditoría) están en claro en la base     | Acceso a la base solo desde la API; la auditoría oculta las claves sensibles        | Cifrado del disco o del volumen de la base en el servidor (E8)  |

### Decisiones

| #   | Decisión                                                                                                                                                                                                                                                                                   | Por qué                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D50 | Patrón y foto cifrados con AES-256-GCM en `bytea`, con formato versionado `[formato][huella][IV][etiqueta][cifrado]`, IV aleatorio de 12 bytes por cifrado y el encabezado más `datos_biometricos.<campo>:<usuarioId>` como datos autenticados. El patrón va como 128 `double` big-endian. | GCM cifra y autentica: un blob alterado o copiado a otro usuario falla (probado). El formato y la huella permiten cambiar de algoritmo o de clave sin adivinar. `double` conserva el valor exacto.                                                                                                                              |
| D51 | Clave en `BIOMETRIA_CLAVE` (32 bytes, base64 o hex). Sin ella, desarrollo y pruebas usan una clave fija documentada; en producción el servidor no arranca sin ella ni con la de desarrollo.                                                                                                | Mismo criterio que `JWT_SECRETO`, y además impide llegar a producción con una clave que está en el repositorio.                                                                                                                                                                                                                 |
| D52 | Migración en un solo paso: la SQL pasa lo existente al formato 0 y borra las columnas en claro; `npm run biometria:cifrar` y el arranque del servidor lo cifran. La aplicación nunca usa el formato 0 como válido.                                                                         | SQL no tiene la clave. Con "agregar columnas → script → quitar columnas", el `prisma migrate deploy` del Dockerfile aplicaría las dos migraciones juntas y borraría los datos; con columnas en claro opcionales el esquema quedaría a medio camino hasta E8. Así el esquema queda final y nadie tiene que acordarse del script. |
| D53 | Rotación con `BIOMETRIA_CLAVE_ANTERIOR` (solo para leer) y el mismo script/arranque, que vuelve a cifrar lo que tiene la huella vieja.                                                                                                                                                     | Rotar sin detener el servicio más que un reinicio y sin herramientas aparte.                                                                                                                                                                                                                                                    |
| D54 | La foto se acepta solo si sus primeros bytes son del tipo declarado (JPEG, PNG o WebP) y se sirve con ese tipo, `no-store` y `nosniff`, solo con `biometria.gestionar`.                                                                                                                    | Que nadie pueda guardar un HTML o SVG con apariencia de foto y servirlo desde nuestro origen.                                                                                                                                                                                                                                   |
| D55 | `Cache-Control: no-store` en todas las respuestas de `/api`.                                                                                                                                                                                                                               | Datos clínicos en tablets compartidas: que no queden en la caché del navegador ni de un proxy.                                                                                                                                                                                                                                  |
| D56 | CSP de la API cerrada (`default-src 'none'`, `frame-ancestors 'none'`…) y `X-Frame-Options: DENY`; la CSP de la interfaz la pone nginx.                                                                                                                                                    | La API solo devuelve JSON y archivos; la interfaz no pasa por Express, así que una CSP de helmet no la protegería.                                                                                                                                                                                                              |
| D57 | HSTS (un año, con subdominios) solo con `COOKIE_SEGURA=true`.                                                                                                                                                                                                                              | Esa variable ya significa "se sirve por HTTPS". Por HTTP el navegador ignora HSTS y el encabezado solo confunde; en Docker local (HTTP) queda apagado.                                                                                                                                                                          |
| D58 | La cookie sigue con `SameSite=Strict` (no `Lax`), `HttpOnly` y `Path=/api`.                                                                                                                                                                                                                | La interfaz y la API comparten origen y no hay flujos que lleguen autenticados desde otro sitio (sin SSO ni enlaces a la API). Si alguien entra por un enlace externo, `index.html` no necesita la cookie y los pedidos que hace la página son del mismo sitio, así que funciona igual. `Lax` solo agregaría riesgo.            |
| D59 | Cuerpo JSON de 100 KB en toda la API y `LIMITE_CUERPO_REGISTRO` (derivado del máximo de la foto) solo en `/api/biometria/usuarios`; excedido, `413 CUERPO_DEMASIADO_GRANDE`.                                                                                                               | Antes eran 2 MB para todo y un exceso respondía 500. Ningún otro pedido pasa de unos pocos KB.                                                                                                                                                                                                                                  |
| D60 | Límite por IP en el login: 10 fallidos en 15 minutos con ventana deslizante en memoria, solo cuenta 401 y 423, responde `429 DEMASIADOS_INTENTOS` con `Retry-After`. `trust proxy` en 1 por defecto (`CONFIAR_PROXY`).                                                                     | Frena barridos de usuarios sin molestar el cambio de turno. En memoria como los comprobantes (una instancia). Detrás de nginx, sin confiar en el proxy, todos compartirían una IP.                                                                                                                                              |
| D61 | Los 500 nunca devuelven mensaje ni traza, en ningún entorno; el detalle va al registro del servidor. Un dato biométrico ilegible responde `500 BIOMETRIA_ILEGIBLE` con un mensaje que dice qué hacer.                                                                                      | No filtrar detalles internos (conexión, consultas) y que la enfermera sepa a quién pedir ayuda.                                                                                                                                                                                                                                 |
| D62 | No se forzaron actualizaciones de dependencias (`--force` baja de versión mayor); los dos avisos se documentaron como no explotables en nuestro uso.                                                                                                                                       | Prisma se queda en 6 (D1); volver a exceljs 3.4 es bajar de versión mayor sin probarlo con los reportes.                                                                                                                                                                                                                        |

### Pruebas de T705

- [`comun/cifrado.test.ts`](../backend/src/comun/cifrado.test.ts): ida y vuelta, IV distinto,
  otra clave falla, blob alterado (cifrado, etiqueta, IV, huella) falla, contexto de otro usuario
  o campo falla, formato 0, rotación y lectura de la clave.
- [`biometria/cifrado-biometrico.test.ts`](../backend/src/modulos/biometria/cifrado-biometrico.test.ts):
  en la base solo hay blobs que no contienen el patrón ni la foto; registrar, validar, ver la
  foto y eliminar siguen igual; blob alterado y rostro copiado de otro usuario → `BIOMETRIA_ILEGIBLE`;
  el script cifra lo que deja la migración, rota la clave una sola vez e informa lo ilegible.
- [`servidor.test.ts`](../backend/src/servidor.test.ts): el arranque cifra lo pendiente.
- [`seguridad-http.test.ts`](../backend/src/seguridad-http.test.ts): cookie y encabezados con
  `NODE_ENV=production`, sin HSTS por HTTP, 500 sin detalles, 413 y foto máxima.
- [`auth/limite-ip.test.ts`](../backend/src/modulos/auth/limite-ip.test.ts): ventana deslizante
  con reloj inyectado y 429 con `Retry-After` por supertest.
- [`datos-sensibles.test.ts`](../backend/tests/integracion/datos-sensibles.test.ts): barrido de
  la API y acceso a la foto por permiso.
- [`config.test.ts`](../backend/src/config.test.ts): clave obligatoria en producción, clave de
  desarrollo rechazada, formato, `CONFIAR_PROXY`.
