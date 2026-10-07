# Guía de componentes

> Tarea T010 · Cubre RNF01. Código en [`frontend/src/componentes/`](../frontend/src/componentes/).
> Pruebas: [`componentes.test.tsx`](../frontend/src/componentes/componentes.test.tsx).

Todas las pantallas usan estos componentes en lugar de los de MUI directamente, para que el
tamaño táctil, los textos y la accesibilidad sean iguales en todo el sistema.

| Componente          | Para qué                                                | Props principales                                                            |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Boton`             | Cualquier acción                                        | `variante` (`principal`, `secundario`, `peligro`, `texto`), `cargando`       |
| `CampoTexto`        | Entrada de texto con error en línea                     | `etiqueta`, `valor`, `alCambiar`, `error`, `ayuda`                           |
| `Selector`          | Elegir una opción (usa el selector nativo de la tablet) | `etiqueta`, `valor`, `opciones`, `alCambiar`, `textoVacio`                   |
| `Tabla`             | Listados con estado vacío, carga y paginación           | `titulo`, `columnas`, `filas`, `claveFila`, `alTocarFila`, `paginacion`      |
| `ModalConfirmacion` | Confirmar acciones que modifican o eliminan             | `abierto`, `titulo`, `mensaje`, `textoConfirmar`, `peligroso`, `pedirMotivo` |
| `Alerta`            | Cartel de error, advertencia, éxito o info              | `tipo`, `titulo`, `alCerrar`, `accion`                                       |
| `PlantillaTablet`   | Estructura de toda pantalla autenticada                 | `opciones`, `acciones`                                                       |

## Reglas de uso

- **Una acción principal por pantalla** (`variante="principal"`); el resto, `secundario` o `texto`.
- **Mientras se guarda**, el botón va con `cargando`: se deshabilita y evita el doble toque.
- **Errores de validación** en el campo (`error`), no en un cartel general.
- **Errores de la API** en una `Alerta tipo="error"` arriba del formulario, con el mensaje que
  devuelve el backend.
- **Toda baja, cancelación o corrección** pasa por `ModalConfirmacion`; si el caso de uso exige
  motivo, con `pedirMotivo`.
- `Alerta` usa `role="alert"` para errores y advertencias (interrumpe al lector de pantalla) y
  `role="status"` para éxito e información.

## Ejemplo

```tsx
<ModalConfirmacion
  abierto={confirmando}
  titulo="Dar de baja al paciente"
  mensaje="La cama quedará libre y se suspenderán sus prescripciones vigentes."
  textoConfirmar="Dar de baja"
  peligroso
  pedirMotivo
  etiquetaMotivo="Motivo del egreso"
  alConfirmar={(motivo) => darDeBaja.mutate({ motivo })}
  alCancelar={() => setConfirmando(false)}
/>
```
