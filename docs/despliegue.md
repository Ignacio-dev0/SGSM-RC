# Entornos y despliegue

> Tareas T005, T007, T008. Por decisión del equipo, en esta etapa **todo corre en forma local
> con Docker**; el entorno en la nube y el despliegue automático (T007/T008) quedan para cuando
> se defina el proveedor.

## Desarrollo

Solo la base en Docker; backend y frontend con recarga automática. Ver el [README](../README.md).

## Entorno completo en Docker (equivalente local de T007)

Levanta PostgreSQL, la API (con las migraciones aplicadas al arrancar) y la interfaz servida
por nginx, que reenvía `/api` a la API:

```bash
docker compose --profile completo up --build -d
# la primera vez, cargar los datos de prueba:
docker compose --profile completo run --rm -e NODE_ENV=development backend npm run db:sembrar
```

Interfaz en <http://localhost:8080> (`FRONTEND_PUERTO` para cambiarlo).

| Variable de compose   | Por defecto     | Para qué                                                              |
| --------------------- | --------------- | --------------------------------------------------------------------- |
| `JWT_SECRETO`         | valor de prueba | Firma de las sesiones                                                 |
| `VITE_BIOMETRIA_MODO` | `camara`        | `simulado` para demostrar sin cámara (se fija al construir la imagen) |
| `FRONTEND_PUERTO`     | `8080`          | Puerto de la interfaz                                                 |

`localhost` es un contexto seguro, así que la cámara funciona por HTTP en esa misma máquina.
Desde **otra** máquina (una tablet en la red) el navegador exige **HTTPS** para dar acceso a la
cámara (T802): hay que poner un proxy con certificado delante de nginx.

## Integración continua (T012)

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) corre formato, lint, tipos y todas
las pruebas (con PostgreSQL de servicio) en cada push a `main`/`develop` y en cada pull request.

## Pendiente para producción (E8)

- Servidor y base administrada con copias de seguridad diarias y monitoreo (T801).
- HTTPS y dominio (T802), `NODE_ENV=production`, `COOKIE_SEGURA=true` y un `JWT_SECRETO`
  largo y aleatorio.
- No correr la semilla de usuarios de prueba (se niega con `NODE_ENV=production`): cargar los
  datos reales del hospital (T803) y registrar el rostro del personal (T804).
