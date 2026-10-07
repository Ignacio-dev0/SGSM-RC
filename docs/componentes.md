# Guía de componentes

> Tarea T010 · Cubre RNF01. Código en [`frontend/src/componentes/`](../frontend/src/componentes/).
> Pruebas: [`componentes.test.tsx`](../frontend/src/componentes/componentes.test.tsx),
> [`Tabla.test.tsx`](../frontend/src/componentes/Tabla.test.tsx),
> [`ChipEstado.test.tsx`](../frontend/src/componentes/ChipEstado.test.tsx) y
> [`AccionesFormulario.test.tsx`](../frontend/src/componentes/AccionesFormulario.test.tsx).

Todas las pantallas usan estos componentes en lugar de los de MUI directamente, para que el
tamaño táctil, los textos y la accesibilidad sean iguales en todo el sistema.

| Componente           | Para qué                                                    | Props principales                                                                                                                                   |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Boton`              | Cualquier acción                                            | `variante` (`principal`, `secundario`, `peligro`, `peligroConfirmar`, `texto`), `cargando`                                                          |
| `CampoTexto`         | Entrada de texto con error en línea                         | `etiqueta`, `valor`, `alCambiar`, `error`, `ayuda` (texto, o texto con un contador)                                                                 |
| `Selector`           | Elegir una opción (usa el selector nativo de la tablet)     | `etiqueta`, `valor`, `opciones`, `alCambiar`, `textoVacio`, `alReintentar`, `reintentando`                                                          |
| `Tabla`              | Listados con estado vacío, carga y paginación               | `titulo`, `columnas`, `filas`, `claveFila`, `alTocarFila`, `paginacion`                                                                             |
| `ModalConfirmacion`  | Confirmar acciones que modifican o eliminan                 | `abierto`, `titulo`, `mensaje`, `textoConfirmar`, `textoCancelar`, `peligroso`, `pedirMotivo`, `ayudaMotivo`, `maxMotivo`, `confirmarDeshabilitado` |
| `Alerta`             | Cartel de error, advertencia, éxito o info                  | `tipo`, `titulo`, `alCerrar`, `accion`, `enfocar`                                                                                                   |
| `ChipEstado`         | Estado de un registro (Vigente, Suspendida, Egresado…)      | `estado` (una de las claves de `ESTADOS_CHIP`)                                                                                                      |
| `AccionesFormulario` | Botonera al pie de un formulario                            | `children` (los botones; la acción principal al final)                                                                                              |
| `Cargando`           | Mientras llegan los datos (nunca pantalla en blanco)        | `texto`                                                                                                                                             |
| `ErrorDeCarga`       | Los datos no llegaron: qué faltó, por qué y Reintentar      | `que` (con artículo), `error`, `alReintentar`                                                                                                       |
| `IdentidadPaciente`  | Nombre, DNI, edad y cama del paciente sobre el que se actúa | `paciente` (en `paginas/pacientes/`)                                                                                                                |
| `PlantillaTablet`    | Estructura de toda pantalla autenticada                     | `opciones`, `acciones`, `aviso` (franja fija), `pieDelCajon` (al pie del menú en el teléfono: ahí va el tema, R10)                                  |

## Reglas de uso

- **Una acción principal por pantalla** (`variante="principal"`); el resto, `secundario` o `texto`.
- **Mientras se guarda**, el botón va con `cargando`: se deshabilita y evita el doble toque.
- **Errores de validación** en el campo (`error`), no en un cartel general.
- **Errores de la API** en una `Alerta tipo="error"` arriba del formulario, con el mensaje que
  devuelve el backend.
- **Toda baja, cancelación o corrección** pasa por `ModalConfirmacion`; si el caso de uso exige
  motivo, con `pedirMotivo` (pide al menos 3 letras, como el servidor). El mensaje **nombra el
  objeto** (paciente con DNI y cama, medicamento) y dice **si se puede deshacer**.
- **El mínimo del motivo se dice desde el principio** (F52): con `pedirMotivo` el campo ya muestra
  "Escriba el motivo (mínimo 3 letras)"; si se pasa `ayudaMotivo`, el modal le agrega
  "(mínimo 3 letras)". El error "Escriba al menos 3 letras" sigue apareciendo si se escribe de menos.
- **El máximo del motivo es el del servidor**: `maxMotivo` (por defecto 255, el `.max(255)` de todos
  los esquemas de motivos) va como `maxLength` del campo, así que no se puede escribir de más. Desde
  el 80 % del máximo, la ayuda muestra a la derecha el contador "N/255" (en negrita al llegar al
  máximo, donde el campo deja de aceptar letras); va dentro de la ayuda, así que el lector de
  pantalla también lo oye. Antes no aparece, para no distraer en un motivo corto.
- `ModalConfirmacion` **no se cierra tocando afuera** (se perdería el motivo escrito): se sale
  con Cancelar o Escape.
- **Ninguna pantalla en blanco**: mientras carga, `Cargando`; si falla, `ErrorDeCarga` (un
  error nunca se muestra como "no hay datos"). Los selectores que dependen de una lista dicen
  en su texto de ayuda si la lista no se pudo cargar o está vacía.
- **Una lista que no carga se puede reintentar ahí mismo** (F60): los selectores que dependen de
  una lista del servidor (pacientes, medicamentos, camas) reciben `alReintentar` (y `reintentando`).
  Si hay error, aparece "Reintentar" al lado del selector y el error dice la causa
  (`No se pudo cargar la lista de X. {mensajeDeError(error)}`). Nunca "vuelva a entrar a esta pantalla".
- **Los errores del servidor dicen qué hacer** (F60): un error interno o una respuesta sin el formato
  de la API se muestra como "El servidor tuvo un problema. Intente de nuevo en unos minutos; si
  sigue, avise al área de sistemas." (lo arma `api/cliente.ts`; las pantallas solo muestran
  `mensajeDeError`). El resto de los errores conserva el mensaje del servidor, que dice qué corregir.
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
  foco de lo que se está haciendo. La excepción es cuando el control que tenía el foco desaparece:
  en el panel de recordatorios, el aviso del resultado lo toma porque la tarjeta del botón que abrió
  el diálogo sale de la lista al recargarse, y el foco caería en la página.
- **Estados con `ChipEstado`, no con `Chip` suelto** (F30). Ver la tabla más abajo.
- **El botón principal de un formulario va siempre al final** y dentro de `AccionesFormulario`
  (F31): en teléfono ocupa el ancho completo, apilado debajo de los secundarios; desde tablet va
  en fila alineada a la derecha. Primero se escriben los botones secundarios y, último, el
  principal.
- `Alerta` usa `role="alert"` para errores y advertencias (interrumpe al lector de pantalla) y
  `role="status"` para éxito e información.

## Formularios con datos sin guardar

Toda pantalla donde se carga o edita algo **protege lo escrito** (UX-11): con la tablet puesta y
guantes, un toque accidental en Cancelar, en la flecha Volver o en el menú no puede tirar el
trabajo. Se usa el hook [`useCambiosSinGuardar`](../frontend/src/utilidades/useCambiosSinGuardar.tsx):

```tsx
const { dialogo, permitirSalida } = useCambiosSinGuardar(hayDiferencias(datos, VACIO));

onSuccess: () => {
  permitirSalida(); // justo antes de navegar: el estado todavía no se actualizó
  navegar('/pacientes');
};

return <>…{dialogo}</>;
```

- Mientras `hayCambios` es verdadero, **cualquier salida** (Cancelar, Volver, ítems del menú, el
  botón Atrás de la tablet y cambiar la dirección de la misma pantalla, por ejemplo el paciente
  elegido) frena y pregunta **"¿Descartar lo cargado?"** con "Seguir editando" y "Descartar"
  (peligroso). Cerrar o recargar la pestaña pide la confirmación del navegador (`beforeunload`).
- **Ir a `/ingresar`** (cerrar sesión o sesión vencida) **nunca se frena**.
- `hayCambios` compara con **lo que había al abrir**: el formulario vacío en un alta, lo cargado
  en una edición (volver al valor original deja de contar como cambio). El ayudante
  `hayDiferencias(actual, original)` lo resuelve para los formularios planos. Elegir algo que viene
  con valor propuesto (el medicamento y su dosis prescripta) todavía no es un cambio.
- Al **guardar con éxito y salir**, se llama `permitirSalida()` antes de `navegar(...)`. Donde la
  pantalla se queda después de guardar (editar un usuario, modificar una prescripción), el
  formulario vuelve a coincidir con lo guardado y no hace falta.
- Necesita un **router de datos** (`createBrowserRouter`, como en `App.tsx`; en las pruebas,
  `renderizarApp` ya lo usa y devuelve `router` para probar el botón Atrás con `router.navigate(-1)`).
- Lo aplican `RegistroPaciente`, `EdicionPaciente`, `CargaPrescripcion`, `DetallePrescripcion`,
  `FormularioUsuario`, `RegistroInsumos` y `AdministracionMedicamento`. Una pantalla nueva con
  formulario lo suma y agrega su caso a
  [`cambiosSinGuardar.test.tsx`](../frontend/src/paginas/cambiosSinGuardar.test.tsx).

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

## Confirmar un estudio con el rostro

[`useConfirmacionEstudio`](../frontend/src/paginas/estudios/ConfirmacionEstudio.tsx) confirma que
un estudio se realizó desde cualquier pantalla, solo con su id (la ficha del paciente lo usa; el
panel de recordatorios lo usa para los recordatorios de `ESTUDIO`):

```tsx
const { abrirConfirmacion, dialogoConfirmacion } = useConfirmacionEstudio({
  alTerminar: (r) => setAviso(r), // { tipo: 'exito' | 'advertencia', texto, estudio? }
});

abrirConfirmacion(r.estudio.id, {
  paciente: { apellido, nombre, dni, cama: r.cama?.numero ?? null }, // si falta, lo pide
});

return <>…{dialogoConfirmacion}</>;
```

- El diálogo pide el estudio por id (`GET /api/estudios/:id`) y muestra qué se confirma y a qué
  paciente (nombre, DNI y cama), también dentro de la validación facial (`useValidacionFacial`,
  el mismo flujo que en suministros). Si ya no está programado, lo dice y solo ofrece Cerrar.
- Con el estudio a mano (`abrirConfirmacion(id, { estudio, paciente })`) se muestra enseguida
  mientras llega el estado actual.
- `403 VALIDACION_FACIAL_REQUERIDA` queda en el diálogo para volver a validar;
  `409 ESTUDIO_NO_PROGRAMADO` cierra y llega a `alTerminar` como advertencia ("Este estudio ya
  fue confirmado o cancelado por otra persona…").
- Al terminar renueva solo las consultas de estudios, del historial del paciente y
  `['recordatorios']`: la pantalla que lo usa no tiene que invalidar nada.
- El estado del estudio se muestra con `ChipEstadoEstudio` (`paginas/estudios/TarjetasEstudios.tsx`),
  con la misma regla que `ChipEstado` (Programado con contorno neutro; Realizado y Cancelado con
  relleno neutro) pero fuera de `ESTADOS_CHIP`, porque es propio de los estudios.
