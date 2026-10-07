# Guía de componentes

> Tarea T010 · Cubre RNF01. Código en [`frontend/src/componentes/`](../frontend/src/componentes/).
> Pruebas: [`componentes.test.tsx`](../frontend/src/componentes/componentes.test.tsx),
> [`Tabla.test.tsx`](../frontend/src/componentes/Tabla.test.tsx),
> [`ChipEstado.test.tsx`](../frontend/src/componentes/ChipEstado.test.tsx) y
> [`AccionesFormulario.test.tsx`](../frontend/src/componentes/AccionesFormulario.test.tsx).

Todas las pantallas usan estos componentes en lugar de los de MUI directamente, para que el
tamaño táctil, los textos y la accesibilidad sean iguales en todo el sistema.

| Componente           | Para qué                                                    | Props principales                                                                                                     |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Boton`              | Cualquier acción                                            | `variante` (`principal`, `secundario`, `peligro`, `peligroConfirmar`, `texto`), `cargando`                            |
| `CampoTexto`         | Entrada de texto con error en línea                         | `etiqueta`, `valor`, `alCambiar`, `error`, `ayuda`                                                                    |
| `Selector`           | Elegir una opción (usa el selector nativo de la tablet)     | `etiqueta`, `valor`, `opciones`, `alCambiar`, `textoVacio`                                                            |
| `Tabla`              | Listados con estado vacío, carga y paginación               | `titulo`, `columnas`, `filas`, `claveFila`, `alTocarFila`, `paginacion`                                               |
| `ModalConfirmacion`  | Confirmar acciones que modifican o eliminan                 | `abierto`, `titulo`, `mensaje`, `textoConfirmar`, `peligroso`, `pedirMotivo`, `ayudaMotivo`, `confirmarDeshabilitado` |
| `Alerta`             | Cartel de error, advertencia, éxito o info                  | `tipo`, `titulo`, `alCerrar`, `accion`, `enfocar`                                                                     |
| `ChipEstado`         | Estado de un registro (Vigente, Suspendida, Egresado…)      | `estado` (una de las claves de `ESTADOS_CHIP`)                                                                        |
| `AccionesFormulario` | Botonera al pie de un formulario                            | `children` (los botones; la acción principal al final)                                                                |
| `Cargando`           | Mientras llegan los datos (nunca pantalla en blanco)        | `texto`                                                                                                               |
| `ErrorDeCarga`       | Los datos no llegaron: qué faltó, por qué y Reintentar      | `que` (con artículo), `error`, `alReintentar`                                                                         |
| `IdentidadPaciente`  | Nombre, DNI, edad y cama del paciente sobre el que se actúa | `paciente` (en `paginas/pacientes/`)                                                                                  |
| `PlantillaTablet`    | Estructura de toda pantalla autenticada                     | `opciones`, `acciones`                                                                                                |

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
- **La acción de peligro no es la más llamativa** (F25). `variante="peligro"` es rojo **con
  contorno** y es la que abre la confirmación (Finalizar, Dar de alta, Dar de baja): la pantalla
  conserva una sola acción llena, la principal. El rojo **relleno** (`peligroConfirmar`) aparece
  recién dentro de `ModalConfirmacion` con `peligroso`, cuando ya se decidió seguir. Las pantallas
  usan `peligro`; `peligroConfirmar` lo pone el modal y no se usa suelto.
- **Un aviso que pide una decisión** (reingreso, prescripción duplicada) va con `enfocar` (UX-12):
  al aparecer se lleva a la vista (centrado) y toma el foco, porque suele mostrarse arriba, lejos
  del botón que se acaba de tocar. Los avisos que solo informan no lo usan: no deben robar el
  foco de lo que se está haciendo.
- **Estados con `ChipEstado`, no con `Chip` suelto** (F30). Ver la tabla más abajo.
- **El botón principal de un formulario va siempre al final** y dentro de `AccionesFormulario`
  (F31): en teléfono ocupa el ancho completo, apilado debajo de los secundarios; desde tablet va
  en fila alineada a la derecha. Primero se escriben los botones secundarios y, último, el
  principal.
- `Alerta` usa `role="alert"` para errores y advertencias (interrumpe al lector de pantalla) y
  `role="status"` para éxito e información.

## Chips de estado

`ChipEstado` tiene **una sola tabla** (`ESTADOS_CHIP`, en [`estadosChip.ts`](../frontend/src/componentes/estadosChip.ts))
de estado → etiqueta, color y variante. El énfasis sube con lo que hay que hacer, así lo que llama
la vista en un listado es lo que pide atención y no lo normal:

| Nivel                                  | Aspecto               | Estados                                          |
| -------------------------------------- | --------------------- | ------------------------------------------------ |
| Esperable                              | Contorno, neutro      | Vigente, Internado, Activo, Validado, Registrado |
| Hecho a tener en cuenta (no es un mal) | Contorno, `info`      | Corregido                                        |
| Pide atención                          | Relleno, `warning`    | Suspendida, Bloqueado, Sin registrar             |
| Cerrado (ya no está en curso)          | Relleno suave, neutro | Finalizada, Egresado, Dado de baja               |

- Solo colores de la paleta (`default`, `info`, `warning`); el rojo (`error`) queda para
  acciones de peligro y errores, nunca para un estado.
- El estado nunca se dice solo con el color: la etiqueta siempre dice de qué se trata.
- Mide **28 px de alto con texto de 0.875rem**; no se usa `size="small"` de MUI (24 px, 13 px).
- Para sumar un estado se agrega una fila a `ESTADOS_CHIP` y su caso en `ChipEstado.test.tsx`
  (la prueba falla si la tabla y los casos no coinciden).

## Botonera de formularios

```tsx
<AccionesFormulario>
  <Boton variante="texto" onClick={cancelar}>
    Cancelar
  </Boton>
  <Boton cargando={guardando} onClick={guardar}>
    Registrar
  </Boton>
</AccionesFormulario>
```

Los hijos directos son los botones. En teléfono el contenedor ocupa el ancho completo y cada botón
también, apilados con 8 px entre sí (el principal abajo, donde llega el pulgar); desde tablet
(`sm`, 600 px) van en fila, alineados a la derecha y con su ancho natural. Los diálogos
(`ModalConfirmacion`) tienen su propia botonera y no la usan.

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
