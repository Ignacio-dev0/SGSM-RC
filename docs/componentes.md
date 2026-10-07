# Guía de componentes

> Tarea T010 · Cubre RNF01. Código en [`frontend/src/componentes/`](../frontend/src/componentes/).
> Pruebas: [`componentes.test.tsx`](../frontend/src/componentes/componentes.test.tsx).

Todas las pantallas usan estos componentes en lugar de los de MUI directamente, para que el
tamaño táctil, los textos y la accesibilidad sean iguales en todo el sistema.

| Componente          | Para qué                                                    | Props principales                                                                                                     |
| ------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Boton`             | Cualquier acción                                            | `variante` (`principal`, `secundario`, `peligro`, `texto`), `cargando`                                                |
| `CampoTexto`        | Entrada de texto con error en línea                         | `etiqueta`, `valor`, `alCambiar`, `error`, `ayuda`                                                                    |
| `Selector`          | Elegir una opción (usa el selector nativo de la tablet)     | `etiqueta`, `valor`, `opciones`, `alCambiar`, `textoVacio`                                                            |
| `Tabla`             | Listados con estado vacío, carga y paginación               | `titulo`, `columnas`, `filas`, `claveFila`, `alTocarFila`, `paginacion`                                               |
| `ModalConfirmacion` | Confirmar acciones que modifican o eliminan                 | `abierto`, `titulo`, `mensaje`, `textoConfirmar`, `peligroso`, `pedirMotivo`, `ayudaMotivo`, `confirmarDeshabilitado` |
| `Alerta`            | Cartel de error, advertencia, éxito o info                  | `tipo`, `titulo`, `alCerrar`, `accion`                                                                                |
| `Cargando`          | Mientras llegan los datos (nunca pantalla en blanco)        | `texto`                                                                                                               |
| `ErrorDeCarga`      | Los datos no llegaron: qué faltó, por qué y Reintentar      | `que` (con artículo), `error`, `alReintentar`                                                                         |
| `IdentidadPaciente` | Nombre, DNI, edad y cama del paciente sobre el que se actúa | `paciente` (en `paginas/pacientes/`)                                                                                  |
| `PlantillaTablet`   | Estructura de toda pantalla autenticada                     | `opciones`, `acciones`                                                                                                |

## Reglas de uso

- **Una acción principal por pantalla** (`variante="principal"`); el resto, `secundario` o `texto`.
- **Mientras se guarda**, el botón va con `cargando`: se deshabilita y evita el doble toque.
- **Errores de validación** en el campo (`error`), no en un cartel general.
- **Errores de la API** en una `Alerta tipo="error"` arriba del formulario, con el mensaje que
  devuelve el backend.
- **Toda baja, cancelación o corrección** pasa por `ModalConfirmacion`; si el caso de uso exige
  motivo, con `pedirMotivo` (pide al menos 3 letras, como el servidor). El mensaje **nombra el
  objeto** (paciente con DNI y cama, medicamento) y dice **si se puede deshacer**.
- `ModalConfirmacion` **no se cierra tocando afuera** (se perdería el motivo escrito): se sale
  con Cancelar o Escape.
- **Ninguna pantalla en blanco**: mientras carga, `Cargando`; si falla, `ErrorDeCarga` (un
  error nunca se muestra como "no hay datos"). Los selectores que dependen de una lista dicen
  en su texto de ayuda si la lista no se pudo cargar o está vacía.
- Donde se actúa sobre un paciente (administrar, prescribir, egresar, trasladar) se lo
  identifica con `IdentidadPaciente` o con nombre, DNI y cama en el diálogo.
- `Alerta` usa `role="alert"` para errores y advertencias (interrumpe al lector de pantalla) y
  `role="status"` para éxito e información.

## Ejemplo

```tsx
<ModalConfirmacion
  abierto={confirmando}
  titulo="Dar de alta al paciente"
  mensaje="Se da de alta a Benítez, Rosa (DNI 30111222, cama A-01). La cama quedará libre."
  textoConfirmar="Dar de alta"
  peligroso
  pedirMotivo
  etiquetaMotivo="Motivo del egreso"
  ayudaMotivo="Por ejemplo: alta médica, derivación a otro hospital"
  confirmarDeshabilitado={Boolean(errorDeFecha)}
  alConfirmar={(motivo) => egresar.mutate({ motivo })}
  alCancelar={() => setConfirmando(false)}
/>
```
