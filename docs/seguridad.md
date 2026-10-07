# Seguridad: sesión, permisos y auditoría

> Tareas T104, T105, T106, T112 · Cubre CU05, CU06, RN05, RN06, RF15, RNF05, RNF10.

## Inicio de sesión (T105 · CU06)

- Usuario y contraseña. Las contraseñas se guardan con **bcrypt** (costo 10, configurable con
  `BCRYPT_COSTO`); nunca se devuelven ni se guardan en la auditoría.
- Si el usuario no existe, está dado de baja o la contraseña es incorrecta, la respuesta es
  siempre la misma (`401 CREDENCIALES_INVALIDAS`, "Usuario o contraseña incorrectos") y se compara
  igual contra un hash señuelo, para no revelar qué usuarios existen.
- La sesión es un **JWT firmado (HS256)** que viaja en la cookie `sgsm_sesion`:
  `httpOnly` (el JavaScript de la página no la puede leer), `SameSite=Strict` (no viaja en
  pedidos desde otros sitios) y `Secure` en producción (solo por HTTPS).
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
  pero no bloquean nada.

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
- Contraseñas, patrones faciales y fotos se reemplazan por `[oculto]`.
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

## Pendiente para la etapa E7 (T705)

Cifrado en tránsito (HTTPS en producción), cifrado del patrón facial en reposo y revisión de
datos sensibles expuestos. En desarrollo todo corre por HTTP en `localhost`.
