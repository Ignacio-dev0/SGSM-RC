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
- Cada administración se asocia a la **toma programada más cercana** de la agenda vigente al
  registrarla y la **guarda** (`tomaProgramada`, D121). Con esa toma la ficha calcula la próxima
  pendiente, el temporizador sabe qué tomas ya se dieron y se atiende el recordatorio. Si después
  la agenda se vuelve a anclar (se reanuda o cambia la frecuencia, D112 de
  [recordatorios.md](recordatorios.md#decisiones)), lo dado antes conserva su toma: el historial
  no cambia.
- **Una toma que ya se dio no se vuelve a registrar sin querer (D113).** Si la toma a la que se
  atribuye la administración ya tiene una, responde `409 TOMA_YA_DADA` con
  `detalles: { motivo: 'MISMA_TOMA', fechaHora, usuario }` de la anterior ("Apellido, Nombre") y
  no registra nada. Si corresponde dar otra, la persona marca _Corresponde dar otra toma_ y la
  pantalla reenvía con `otraToma: true` (por defecto `false`): se registra y la auditoría lo dice
  en el `detalle`. El comprobante facial no se gasta con el 409: el servidor aceptaría el reenvío
  con el mismo comprobante mientras siga vigente, pero la pantalla de la tablet vuelve a pedir el
  rostro a propósito (D150).
- **Una dosis reciente también se confirma a propósito (D123).** Aunque la toma de ahora no tenga
  administración, si hubo una dosis de la misma prescripción hace menos de media frecuencia
  (de otra toma, o de antes de suspenderla y reanudarla) responde el mismo `409 TOMA_YA_DADA`,
  con esa dosis en `detalles: { motivo: 'DOSIS_RECIENTE', fechaHora, usuario }` y un mensaje que
  lo dice: "Ya se dio una dosis a las 14:50 (Acosta, Sofía), hace 10 min, y la indicación es
  cada 8 h. Si corresponde dar otra, márquelo y vuelva a confirmar." Se sigue con
  `otraToma: true`, como en D113.
- **`detalles.motivo`** dice cuál de los dos casos fue: `MISMA_TOMA` (D113) o `DOSIS_RECIENTE`
  (D123). La pantalla lo usa para no hablar de "esta toma" cuando la dosis fue de otra.
- **Bloqueos (D121).** El registro bloquea la prescripción (`FOR NO KEY UPDATE`) al empezar y
  recién después la lee: dos administraciones de la misma prescripción van de a una, y un cambio
  de frecuencia o una reanudación que se confirma en el medio se ve (esos cambios toman el mismo
  bloqueo). `FOR NO KEY UPDATE` no choca con el `FOR KEY SHARE` de los recordatorios que inserta
  el temporizador.

## Corrección (CU23 · T412, T416)

- Solo dentro de las **24 horas** de registrado (`SUMINISTRO_PLAZO_CORRECCION_HORAS`); después
  responde `FUERA_DE_PLAZO` y nadie lo puede corregir, tampoco el administrador. La pantalla lo
  dice así: "Pasaron más de 24 horas: ya no se puede corregir. Avise a su supervisora para dejar
  constancia." Las horas son las del plazo configurado (`corregibleHasta − fechaHora`); el
  mensaje del `FUERA_DE_PLAZO` del servidor dice lo mismo, con las horas de
  `SUMINISTRO_PLAZO_CORRECCION_HORAS`, y ya no manda a pedírsela al administrador. Si el plazo
  vence con el diálogo abierto, el `FUERA_DE_PLAZO` dice lo mismo, sale de la corrección y ya no
  ofrece Corregir (D152).
- **Motivo obligatorio** y **validación facial** de quien corrige.
- En una administración se corrige la **cantidad**; en un movimiento de insumos, la **lista**.
  En los dos, también las **observaciones**: vienen cargadas, viajan solo si cambian y, vacías, se
  borran (D152).
- Se conserva quién registró originalmente y cuándo; se agregan `corregidoPor`, `corregidoEn` y
  `motivoCorreccion`, y la auditoría guarda el detalle anterior y el nuevo.

## Historial (CU22 · T411, T415)

Menú **Suministros**: filtros por paciente, período, tipo (medicamentos o insumos) y
responsable; tocando una fila se ve el detalle y, si corresponde, se corrige. También aparece
en la pestaña **Historial** de cada paciente.

## Pantallas pensadas para el lado de la cama

- Arriba, la **tarjeta del paciente** (nombre, DNI, edad, cama y sala): el rostro valida a quien
  registra, no al paciente.
- La prescripción se elige tocando una **tarjeta** grande con la próxima toma, la última
  administración y el **estado de la toma** ([`estadoToma.ts`](../frontend/src/paginas/suministros/estadoToma.ts)),
  con los mismos criterios que el servidor: _Toca ahora_ (dentro de 30 min), _Atrasada X min_,
  _Faltan X h_, _Ya se dio a las HH:mm_ (alguna administración quedó en la toma de ahora, o la
  última fue hace menos de media frecuencia: los dos casos de `TOMA_YA_DADA`, D162) o _Sin más
  tomas_. Solo _Toca ahora_ y _Atrasada_ van rellenos; una toma ya dada
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
- Si el servidor responde `TOMA_YA_DADA` (otra persona la dio mientras tanto, o la pantalla no lo
  sabía), el aviso toma el foco y dice el caso según `detalles.motivo`
  ([`tomaYaDada.ts`](../frontend/src/paginas/suministros/tomaYaDada.ts)): con `MISMA_TOMA`, "Esta
  toma ya se registró a las 08:05 (Acosta, Sofía). Si corresponde dar otra, márquelo y vuelva a
  confirmar."; con `DOSIS_RECIENTE`, "Hace 40 min se registró una dosis de este medicamento (a
  las 11:20, Acosta, Sofía). Si corresponde dar otra, márquelo y vuelva a confirmar." (sin motivo,
  el primero). La prescripción se vuelve a pedir y _Corresponde dar otra toma_ aparece aunque la
  tarjeta todavía no lo muestre; solo con la casilla marcada viaja `otraToma: true` (D150).
- La pantalla vuelve a pedir las prescripciones al volver a estar a la vista (otra pestaña, la
  tablet que se despierta) y cada 60 s mientras se ve, para que "Ya se dio" esté al día (D151).
  Si la prescripción elegida ya no viene (la suspendieron o la finalizaron), el formulario no
  desaparece en silencio: un aviso con el foco dice "La prescripción de Paracetamol ya no está
  vigente: la suspendieron o la finalizaron mientras tenía la pantalla abierta. No se registró
  nada." y ofrece ir a la ficha (D164).
- Tras tres validaciones faciales fallidas el diálogo dice primero lo que importa: "No se
  registró la administración." (o los insumos, o la corrección) y después que los intentos
  quedaron registrados y se avisó al administrador (F4).
- Desde la ficha del paciente, **Administrar medicamento** y **Registrar insumos** abren estas
  pantallas con el paciente ya elegido.

### Decisiones de la interfaz (revisión F1–F20)

| #    | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Por qué                                                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D150 | Después de un `409 TOMA_YA_DADA`, confirmar la otra toma vuelve a pedir el rostro, aunque el servidor no haya gastado el comprobante (D113).                                                                                                                                                                                                                                                                                                                                                | Una segunda dosis es la decisión más riesgosa de la pantalla: se confirma igual que la primera, con el mismo botón y la misma cámara, sin un atajo que registre sin mirar. El servidor tolera el reenvío con el mismo comprobante (D113, para otros clientes); la pantalla no lo usa a propósito. |
| D151 | Administrar vuelve a pedir las prescripciones al volver a la vista (`refetchOnWindowFocus`, que en el resto de la aplicación sigue apagado) y cada 60 s (`refetchInterval`, solo con la pantalla visible).                                                                                                                                                                                                                                                                                  | Es donde un dato viejo puede duplicar una dosis. Las pruebas usan el mismo valor por defecto que la aplicación (sin volver a pedir), así una prueba no pasa por un comportamiento que en la tablet no está.                                                                                       |
| D152 | En la corrección las observaciones viajan solo si cambiaron (vacías, `null`); pasado el plazo la pantalla no ofrece Corregir y no manda a nadie a corregir: dice que avise a su supervisora, con las horas del plazo configurado (`corregibleHasta − fechaHora`, no un 24 fijo). Un `FUERA_DE_PLAZO` con el diálogo abierto sale de la corrección y deja de ofrecer Corregir.                                                                                                               | Mandarlas siempre las reescribiría con lo mismo y la auditoría mostraría un cambio que no hubo. Después del plazo el servidor no deja corregir a nadie: decir "pídaselo al administrador" era falso, y dejar el botón del rostro habilitado invitaba a reintentar algo que nunca iba a funcionar. |
| D162 | El estado de la toma ([`estadoToma.ts`](../frontend/src/paginas/suministros/estadoToma.ts)) dice "Ya se dio" en los dos casos en que el servidor responde `TOMA_YA_DADA`: una administración guardó la toma de ahora (la más cercana de la agenda vigente, calculada como el servidor en [`prescripciones/agenda.ts`](../frontend/src/paginas/prescripciones/agenda.ts) con `tomaProgramada`, D121) o la última fue hace menos de media frecuencia, aunque sea de antes de reanudar (D123). | Descartar las dosis anteriores a `agendaDesde` ocultaba la primera toma adelantada (RN07): con inicio a las 12:00 y la dosis a las 10:00, a las 10:30 decía "Faltan 9 h 30 min" y el servidor respondía 409.                                                                                      |
| D164 | Si al renovar la lista la prescripción elegida ya no está vigente, Administrar lo dice con un aviso que toma el foco y ofrece ir a la ficha, en lugar de vaciar el formulario.                                                                                                                                                                                                                                                                                                              | Con la renovación cada 60 s (D151), la cantidad y las observaciones escritas desaparecían sin explicación y solo quedaba "Elija el medicamento que va a dar".                                                                                                                                     |
| D165 | A un medicamento o insumo en uso, Tipo y Unidad de medida se le muestran **de solo lectura** (no deshabilitados), con un candado y la ayuda que dice por qué.                                                                                                                                                                                                                                                                                                                               | Un campo deshabilitado sale del orden de tabulación y MUI pinta su ayuda en el gris de lo deshabilitado (contraste de unos 2,3:1): con teclado o lector de pantalla nunca se llegaba a la explicación.                                                                                            |

## Catálogo: medicamentos e insumos en uso

`GET /api/insumos` y `GET /api/insumos/:id` traen `enUso`: `true` si algún medicamento o insumo
ya lo usa una prescripción o un suministro. A uno en uso no se le cambia el `tipo` ni la
`unidadMedida` (`409 INSUMO_EN_USO`): las dosis y cantidades ya registradas están en esa unidad y
una prescripción no puede quedar apuntando a un insumo. El nombre, la presentación y la baja sí
se cambian. En la pantalla, a uno en uso **Tipo** y **Unidad de medida** quedan de solo lectura
(con un candado) y la ayuda "Ya se usó en prescripciones o registros: no se puede cambiar", y al
guardar no se mandan; si el `409` llega igual (alguien lo usó mientras tanto), el diálogo lo
explica, vuelve a los valores guardados y bloquea los dos campos (F16 · D165). El aviso de duplicado (`409 INSUMO_DUPLICADO`) dice si el que ya existe es un
medicamento o un insumo y, si está dado de baja, que se reactive en lugar de agregar otro.

## Decisiones

| #    | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Por qué                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D113 | `TOMA_YA_DADA` en el servidor: la toma de ahora (la más cercana, como `tomaProgramada`) con una administración previa se rechaza salvo `otraToma: true`. Se bloquea la fila de la prescripción mientras se decide, el comprobante facial se revisa antes y se gasta después del control, y un `otraToma` que de verdad repitió queda en el `detalle` de la auditoría. `detalles.motivo`: `MISMA_TOMA`.                                                   | La pantalla ya avisaba, pero con dos tablets (o una lista vieja) se podía dar dos veces sin saberlo. Las decisiones clínicas no las toma el sistema: solo exige que sea a propósito. Gastar el comprobante en un 409 obligaba a cualquier cliente de la API a volver a validar el rostro para algo que la persona ya confirmó (la pantalla de la tablet igual lo vuelve a pedir, a propósito: D150). |
| D116 | `enUso` se calcula con una consulta de existencia (`EXISTS` en prescripciones y en detalles de suministros) por los índices nuevos por insumo, para todo el catálogo de una vez; con uso, `tipo` y `unidadMedida` no cambian (`409 INSUMO_EN_USO`). El cambio bloquea la fila del insumo (`FOR UPDATE`) antes de mirar si está en uso; el alta de una prescripción y el registro de insumos la bloquean para leer el tipo (`FOR SHARE`).                 | Cambiar la unidad de un medicamento ya prescripto cambiaría el sentido de las dosis y los reportes; pasarlo a insumo dejaría prescripciones de algo que no es un medicamento. Con los índices, preguntar por un insumo sin uso no recorre los detalles de un año. Sin los bloqueos, un cambio a insumo y una prescripción nueva del mismo medicamento a la vez se confirmaban los dos.               |
| D121 | Cada administración guarda su toma (`suministros.toma_programada`, nula en los insumos), calculada al registrarla con la agenda vigente. El DTO, `TOMA_YA_DADA`, la atención del recordatorio, la próxima toma y las tomas que el temporizador ya no recuerda usan ese dato; la migración lo completó para las existentes con la agenda con la que se dieron. El registro y los cambios de agenda bloquean la prescripción al empezar y la leen después. | Se recalculaba en cada lectura con la agenda actual: al volver a anclar, lo dado antes quedaba sin toma ("toma de las —") y la dosis tardía que servía de ancla cambiaba de toma (la de las 12:00 dada a las 12:40 pasaba a ser "la de las 12:40"). Leer la prescripción antes del bloqueo dejaba decidir `TOMA_YA_DADA` con una agenda vieja.                                                       |
| D123 | Una dosis de la misma prescripción de hace menos de media frecuencia (la vigente) también responde `409 TOMA_YA_DADA` si la toma de ahora no tiene administración, aunque sea de otra toma o de antes de reanudar, con `detalles.motivo`: `DOSIS_RECIENTE` (la pantalla dice "Hace N min se registró una dosis de este medicamento…", no "esta toma"). Se sigue con `otraToma`.                                                                          | Al reanudar, la toma vuelve a ser "ahora": con una dosis dada a las 14:50, suspendida a las 14:55 y reanudada a las 15:00, se registraba otra sin aviso. Pasaba también con una dosis tardía seguida de la siguiente. Es la misma regla con la que la pantalla avisa "Ya se dio"; como D113, no impide nada: solo pide confirmarlo. Queda para validar con el hospital (supuestos).                  |

Pruebas: [`registro.test.ts`](../backend/src/modulos/suministros/registro.test.ts) ("una toma
que ya se dio": la dosis reciente, dos enfermeras a la vez y un cambio de agenda en curso),
[`agenda-reanclada.test.ts`](../backend/src/modulos/prescripciones/agenda-reanclada.test.ts)
(el historial conserva la toma de cada dosis) e [`insumos.test.ts`](../backend/src/modulos/insumos/insumos.test.ts) ("en uso", lo
que pasa a la vez que otra transacción, y el aviso de duplicado).
