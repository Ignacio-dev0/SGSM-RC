# Registro de suministros

> Tareas T408–T417 · Cubre CU20–CU23, RF04, RF05, RF10, RN07.

## Qué se registra

| Tipo          | Pantalla                           | Qué guarda                                                                                                                                                          |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MEDICAMENTO` | **Administrar medicamento** (T413) | Una toma de una prescripción vigente: paciente, prescripción, medicamento, cantidad (por defecto la dosis prescripta), usuario validado con el rostro, fecha y hora |
| `INSUMOS`     | **Registrar insumos** (T414)       | Varios insumos no medicinales en un solo movimiento (pañales, gasas, filtros…) con sus cantidades                                                                   |

Ambos exigen el comprobante de la **validación facial** del usuario que registra
([biometria.md](biometria.md)), y quedan en la auditoría (`REGISTRAR Suministro`).

## Reglas

- **RN07 — sin prescripción no hay medicamento.** Un medicamento solo se registra sobre una
  prescripción **vigente**, **del mismo paciente** y **en curso** (se admite adelantar la
  primera toma hasta media frecuencia antes del inicio; no después de la fecha de fin). Un
  medicamento tampoco puede colarse como "insumo suelto": `SIN_PRESCRIPCION_VIGENTE`.
- El paciente tiene que estar **internado**.
- Los insumos tienen que estar **activos** en el catálogo y no repetirse en el mismo movimiento.
- Cada administración se asocia a la **toma programada más cercana** (`tomaProgramada`), que es
  lo que usa la ficha para calcular la próxima toma pendiente.

## Corrección (CU23 · T412, T416)

- Solo dentro de las **24 horas** de registrado (`SUMINISTRO_PLAZO_CORRECCION_HORAS`); después
  responde `FUERA_DE_PLAZO` y la pantalla indica pedírselo al administrador.
- **Motivo obligatorio** y **validación facial** de quien corrige.
- En una administración se corrige la **cantidad**; en un movimiento de insumos, la **lista**.
- Se conserva quién registró originalmente y cuándo; se agregan `corregidoPor`, `corregidoEn` y
  `motivoCorreccion`, y la auditoría guarda el detalle anterior y el nuevo.

## Historial (CU22 · T411, T415)

Menú **Suministros**: filtros por paciente, período, tipo (medicamentos o insumos) y
responsable; tocando una fila se ve el detalle y, si corresponde, se corrige. También aparece
en la pestaña **Historial** de cada paciente.

## Pantallas pensadas para el lado de la cama

- Arriba, la **tarjeta del paciente** (nombre, DNI, edad, cama y sala): la cara valida a quien
  registra, no al paciente.
- La prescripción se elige tocando una **tarjeta** grande con la próxima toma, la última
  administración y el **estado de la toma** ([`estadoToma.ts`](../frontend/src/paginas/suministros/estadoToma.ts)),
  con los mismos criterios que el servidor: _Toca ahora_ (dentro de 30 min), _Atrasada X min_,
  _Faltan X h_, _Ya se dio a las HH:mm_ (la última administración fue hace menos de media
  frecuencia) o _Sin más tomas_. Solo _Toca ahora_ y _Atrasada_ van rellenos; una toma ya dada
  va en color de advertencia con contorno (nunca en verde: elegirla duplicaría la dosis).
- La tarjeta en reposo muestra un círculo vacío y la elegida, una tilde y un tinte del color
  principal; arriba, la instrucción "Toque el medicamento que va a dar". Si el botón final está
  deshabilitado, debajo dice qué falta.
- Antes de confirmar, un resumen **Revise antes de confirmar** (paciente, qué dar, vía, toma,
  observaciones), repetido dentro del diálogo facial.
- **Avisos** que no bloquean: cantidad distinta de la prescripta y toma adelantada. Si la toma
  **ya se dio**, hay que marcar _Corresponde dar otra toma_ para poder confirmar.
- El resultado de confirmar se lleva a la vista y recibe el foco. Si no hubo respuesta del
  servidor o respondió con un error propio (5xx), la pantalla dice que **no se sabe si quedó
  registrada**, nombra al paciente y lleva a **su** historial antes de reintentar (para no dar
  la dosis dos veces). Un rechazo del servidor (4xx) muestra su mensaje.
- Al cambiar de paciente o de prescripción se limpian cantidad y observaciones.
- Los insumos se agregan tocando el catálogo y se ajustan con botones **− / +** de 56 px; la
  cantidad también se escribe (no se corrige sola mientras se escribe; vacía o en cero no deja
  confirmar). El diálogo facial muestra los insumos con sus cantidades y el paciente.
- Un único botón final: **Confirmar con mi rostro**.
- Desde la ficha del paciente, **Administrar medicamento** y **Registrar insumos** abren estas
  pantallas con el paciente ya elegido.
