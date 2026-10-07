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

- La prescripción se elige tocando una **tarjeta** grande con la próxima toma y la última
  administración.
- Los insumos se agregan tocando el catálogo y se ajustan con botones **− / +** de 56 px.
- Un único botón final: **Confirmar con mi rostro**.
- Desde la ficha del paciente, **Administrar medicamento** y **Registrar insumos** abren estas
  pantallas con el paciente ya elegido.
