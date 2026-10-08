# Convención de la API

> Tarea T011. Aplica a todos los endpoints del backend. El detalle de cada endpoint está en
> [endpoints.md](endpoints.md).

## Rutas

- Todo cuelga de `/api`. Recursos en **español, plural y minúscula con guiones**:
  `/api/usuarios`, `/api/pacientes`, `/api/prescripciones`, `/api/suministros`.
- Subrecursos anidados cuando pertenecen a otro: `/api/pacientes/:id/prescripciones`.
- Acciones que no son CRUD se expresan como subruta con verbo en infinitivo:
  `POST /api/pacientes/:id/trasladar`, `POST /api/biometria/validar`.
- Los identificadores son enteros (`:id`).

| Operación       | Método   | Ruta                    | Éxito                                  |
| --------------- | -------- | ----------------------- | -------------------------------------- |
| Listar / buscar | `GET`    | `/api/recursos?filtros` | 200                                    |
| Obtener uno     | `GET`    | `/api/recursos/:id`     | 200                                    |
| Crear           | `POST`   | `/api/recursos`         | 201                                    |
| Modificar       | `PATCH`  | `/api/recursos/:id`     | 200                                    |
| Baja lógica     | `DELETE` | `/api/recursos/:id`     | 200 (devuelve el recurso dado de baja) |

No hay borrado físico de datos clínicos ni de usuarios: toda baja es lógica (RN06).

## Formato de respuesta

Éxito con un recurso:

```json
{ "data": { "id": 1, "apellido": "Pérez" } }
```

Éxito con un listado paginado:

```json
{
  "data": [{ "id": 1 }, { "id": 2 }],
  "meta": { "pagina": 1, "porPagina": 20, "total": 45, "totalPaginas": 3 }
}
```

Error:

```json
{
  "error": {
    "codigo": "DNI_DUPLICADO",
    "mensaje": "Ya existe un paciente con ese DNI",
    "detalles": [{ "campo": "dni", "mensaje": "..." }]
  }
}
```

`mensaje` está pensado para mostrarse tal cual al usuario. `detalles` es opcional; en errores
de validación trae un elemento por campo inválido.

## Códigos de error

| HTTP | `codigo`                  | Cuándo                                                                                                                   |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 400  | `VALIDACION`              | Datos con formato inválido (incluye `detalles` por campo)                                                                |
| 400  | `JSON_INVALIDO`           | El cuerpo no es JSON                                                                                                     |
| 400  | `PEDIDO_INVALIDO`         | El cuerpo no se pudo leer (juego de caracteres, pedido cortado)                                                          |
| 401  | `NO_AUTENTICADO`          | Sin sesión o sesión vencida por inactividad                                                                              |
| 401  | `CREDENCIALES_INVALIDAS`  | Usuario o contraseña incorrectos                                                                                         |
| 403  | `SIN_PERMISO`             | El rol y los permisos adicionales no habilitan la acción                                                                 |
| 403  | `CAMBIO_PROPIO`           | Con permiso, pero sobre uno mismo: cambiarse el rol o los permisos, o reactivarse (D110 de [seguridad.md](seguridad.md)) |
| 403  | `PRIVILEGIO_AJENO`        | Con permiso, pero otorga lo que no tiene o toca a quien tiene más permisos (D119 de [seguridad.md](seguridad.md))        |
| 404  | `NO_ENCONTRADO`           | El recurso no existe                                                                                                     |
| 413  | `CUERPO_DEMASIADO_GRANDE` | El cuerpo JSON supera 100 KB (o el máximo del registro del rostro) (T705)                                                |
| 409  | `<CONFLICTO>`             | Choca con datos existentes: `DNI_DUPLICADO`, `USUARIO_DUPLICADO`, `CAMA_OCUPADA`, `ULTIMO_ADMINISTRADOR`…                |
| 422  | `<REGLA>`                 | Viola una regla de negocio: `SIN_PRESCRIPCION_VIGENTE`, `FUERA_DE_PLAZO`…                                                |
| 423  | `CUENTA_BLOQUEADA`        | Bloqueo por intentos fallidos (incluye `detalles.bloqueadoHasta`)                                                        |
| 429  | `DEMASIADOS_INTENTOS`     | Demasiados logins fallidos desde la misma IP (`Retry-After`, `detalles.reintentarEnSegundos`) (T705)                     |
| 500  | `ERROR_INTERNO`           | Error no previsto: nunca trae el mensaje interno ni la traza, que van solo al registro del servidor                      |

Los códigos propios de cada módulo se listan en [endpoints.md](endpoints.md).

## Paginación

- Parámetros de query: `pagina` (desde 1, por defecto 1) y `porPagina` (1 a 100, por defecto 20).
- La respuesta incluye `meta` con `pagina`, `porPagina`, `total` y `totalPaginas`.
- Implementación: [`backend/src/comun/paginacion.ts`](../backend/src/comun/paginacion.ts).

## Filtros y fechas

- Los filtros van en la query con el nombre del campo: `?dni=30111222&estado=INTERNADO`.
- Rangos de fecha: `desde` y `hasta` en ISO 8601 (`2026-11-03` o `2026-11-03T08:00:00-03:00`).
- Las fechas se devuelven siempre en ISO 8601 con zona (UTC, `...Z`); el frontend las muestra en
  hora de Argentina.

## Autenticación

- La sesión viaja en la cookie `sgsm_sesion` (httpOnly, `SameSite=Strict`). El frontend nunca
  lee el token. Ver [seguridad.md](seguridad.md).
- Todo endpoint, salvo `POST /api/auth/login` y `GET /api/salud`, exige sesión y un permiso.
