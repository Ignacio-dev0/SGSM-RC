# Reportes, estadísticas y auditoría

> E6 · T601–T604, T608 · CU32–CU35 (casos de uso inferidos) · S17–S20. Plan en
> [diseno-e6.md](diseno-e6.md). Este documento es el **contrato** entre el backend y el frontend
> para el reporte de suministros, las estadísticas, la exportación a PDF y Excel y la consulta de
> la auditoría: parámetros, forma de las respuestas, archivos, errores y decisiones.
>
> Código: [`modulos/reportes/`](../backend/src/modulos/reportes/) (esquemas, consultas SQL,
> reporte, estadísticas, exportación y rutas) y la consulta en
> [`modulos/auditoria/`](../backend/src/modulos/auditoria/) (esquemas, `consulta.servicio.ts`,
> rutas).

## Permisos (S17)

| Permiso             | Roles                 | Para qué                                       |
| ------------------- | --------------------- | ---------------------------------------------- |
| `reportes.ver`      | Administrador, Médico | Ver el reporte y las estadísticas (CU32, CU33) |
| `reportes.exportar` | Administrador         | Descargar el PDF o el Excel (CU34)             |
| `auditoria.ver`     | Administrador         | Consultar la auditoría (CU35)                  |

Enfermería no ve reportes; un enfermero jefe los recibe como permiso adicional (CU05). La
pantalla muestra "Descargar PDF" y "Descargar Excel" solo con `reportes.exportar`, pero el que
decide es el backend (`403 SIN_PERMISO`).

## Endpoints

| Método | Ruta                                  | Permiso             |
| ------ | ------------------------------------- | ------------------- |
| GET    | `/api/reportes/suministros`           | `reportes.ver`      |
| GET    | `/api/reportes/estadisticas`          | `reportes.ver`      |
| GET    | `/api/reportes/suministros/exportar`  | `reportes.exportar` |
| GET    | `/api/reportes/estadisticas/exportar` | `reportes.exportar` |
| GET    | `/api/auditoria`                      | `auditoria.ver`     |
| GET    | `/api/auditoria/opciones`             | `auditoria.ver`     |

Todos son `GET` con los parámetros en la query: ninguno recibe cuerpo. Esquemas (zod, se pueden
importar desde el frontend): [`reportes.esquemas.ts`](../backend/src/modulos/reportes/reportes.esquemas.ts)
y [`auditoria.esquemas.ts`](../backend/src/modulos/auditoria/auditoria.esquemas.ts).

## Parámetros de los reportes

| Parámetro    | Valores                                 | Por defecto             | En                       |
| ------------ | --------------------------------------- | ----------------------- | ------------------------ |
| `desde`      | Día `AAAA-MM-DD` en hora de Argentina   | 6 días antes de `hasta` | todos                    |
| `hasta`      | Día `AAAA-MM-DD` en hora de Argentina   | hoy en Argentina        | todos                    |
| `salaId`     | Id de una sala                          | todo el hospital        | todos                    |
| `tipo`       | `MEDICAMENTO` o `INSUMO`                | los dos                 | todos                    |
| `agruparPor` | `paciente`, `insumo`, `usuario` o `dia` | `paciente`              | reporte y su exportación |
| `formato`    | `pdf` o `xlsx`                          | — (obligatorio)         | exportaciones            |

- Los dos días están **incluidos**: `desde=2026-10-01&hasta=2026-10-07` son 7 días, del 01/10 a
  las 00:00 al 07/10 a las 23:59:59 de Argentina (D40).
- Sin fechas: los últimos 7 días, hoy incluido. Solo `desde`: hasta hoy. Solo `hasta`: los 7 días
  que terminan ese día.
- Como mucho **366 días** (`400`, campo `desde`); `hasta` anterior a `desde` es `400` (campo
  `hasta`).
- `salaId` es la sala de la cama que ocupaba el paciente **en ese momento** (D41). Una sala que no
  existe responde `404`.
- `tipo` filtra cada insumo de cada suministro (D43).

`meta.parametros` devuelve los parámetros **normalizados** (con las fechas completadas y `null`
en lo que no se filtró): sirven para mostrar "del 01/10 al 07/10" aunque no se hayan elegido
fechas y para armar los enlaces de descarga.

## Reporte de suministros (T601 · CU32)

`GET /api/reportes/suministros?desde&hasta&salaId&tipo&agruparPor`

Una fila por grupo con la cantidad de **suministros** (registros) y de **unidades** (suma de las
cantidades registradas, D42), y el total general en `meta.totales`.

| `agruparPor` | Una fila por                      | `etiqueta`                | `clave`         |
| ------------ | --------------------------------- | ------------------------- | --------------- |
| `paciente`   | paciente (orden alfabético)       | `"Apellido, Nombre"`      | id del paciente |
| `usuario`    | quien registró (orden alfabético) | `"Apellido, Nombre"`      | id del usuario  |
| `insumo`     | insumo **y unidad** (D42)         | `"Nombre · Presentación"` | `"id\|unidad"`  |
| `dia`        | día de Argentina con suministros  | `"DD/MM/AAAA"`            | `"AAAA-MM-DD"`  |

Por día solo vienen los días que tienen suministros (la evolución con los días en cero está en
las estadísticas).

```ts
type TipoInsumo = 'MEDICAMENTO' | 'INSUMO';
type Agrupacion = 'paciente' | 'insumo' | 'usuario' | 'dia';

interface ParametrosPeriodo {
  desde: string; // 'AAAA-MM-DD'
  hasta: string; // 'AAAA-MM-DD'
  salaId: number | null;
  tipo: TipoInsumo | null;
}

interface FilaReporte {
  /** Única en el reporte (para las claves de React). */
  clave: string;
  /** Id del paciente, el usuario o el insumo; null al agrupar por día. */
  id: number | null;
  etiqueta: string;
  suministros: number;
  unidades: number;
  /** Solo al agrupar por insumo; null en las otras agrupaciones. */
  tipo: TipoInsumo | null;
  unidad: string | null;
}

interface ReporteSuministros {
  data: FilaReporte[];
  meta: {
    parametros: ParametrosPeriodo & { agruparPor: Agrupacion };
    /** Suministros distintos: uno con dos insumos cuenta una sola vez (D43). */
    totales: { suministros: number; unidades: number };
  };
}
```

Ejemplo (`agruparPor=insumo`):

```json
{
  "data": [
    {
      "clave": "17|unidad",
      "id": 17,
      "etiqueta": "Gasa estéril · Sobre x 1",
      "suministros": 2,
      "unidades": 5,
      "tipo": "INSUMO",
      "unidad": "unidad"
    },
    {
      "clave": "3|comprimido",
      "id": 3,
      "etiqueta": "Paracetamol · Comprimidos 500 mg",
      "suministros": 1,
      "unidades": 1,
      "tipo": "MEDICAMENTO",
      "unidad": "comprimido"
    },
    {
      "clave": "3|mg",
      "id": 3,
      "etiqueta": "Paracetamol · Comprimidos 500 mg",
      "suministros": 2,
      "unidades": 1000,
      "tipo": "MEDICAMENTO",
      "unidad": "mg"
    }
  ],
  "meta": {
    "parametros": {
      "desde": "2026-10-01",
      "hasta": "2026-10-07",
      "salaId": null,
      "tipo": null,
      "agruparPor": "insumo"
    },
    "totales": { "suministros": 5, "unidades": 1006 }
  }
}
```

Un período sin suministros responde `data: []` y `totales` en cero.

## Estadísticas (T602 · CU33)

`GET /api/reportes/estadisticas?desde&hasta&salaId&tipo`

```ts
interface Estadisticas {
  data: {
    totales: {
      /** Suministros distintos del período. */
      suministros: number;
      /** De ellos, con algún medicamento / con algún insumo. */
      medicamentos: number;
      insumos: number;
      /** Pacientes con al menos un suministro. */
      pacientes: number;
    };
    /** Los 10 en más suministros (D44), de más a menos; empate por nombre. */
    insumosMasUsados: {
      insumoId: number;
      nombre: string;
      presentacion: string;
      tipo: TipoInsumo;
      suministros: number;
    }[];
    /** Siempre los dos tipos, en este orden: MEDICAMENTO, INSUMO (para la torta). */
    consumoPorTipo: { tipo: TipoInsumo; suministros: number }[];
    /** Un punto por cada día del rango, también los días en cero (para las líneas). */
    evolucionDiaria: {
      fecha: string; // 'AAAA-MM-DD'
      suministros: number;
      medicamentos: number;
      insumos: number;
    }[];
    /** Recordatorios con la hora objetivo en el período, sin los cancelados (D45). */
    recordatorios: {
      total: number;
      aTiempo: number;
      tarde: number;
      noAdministrados: number;
      vencidosSinAtender: number;
      pendientes: number;
      /** aTiempo + tarde + noAdministrados. */
      atendidos: number;
      /** atendidos / (atendidos + vencidosSinAtender) × 100, con un decimal; null si no hay. */
      porcentajeAtendido: number | null;
    };
  };
  meta: { parametros: ParametrosPeriodo; dias: number };
}
```

Ejemplo:

```json
{
  "data": {
    "totales": { "suministros": 8, "medicamentos": 3, "insumos": 5, "pacientes": 3 },
    "insumosMasUsados": [
      {
        "insumoId": 18,
        "nombre": "Pañal para adultos",
        "presentacion": "Paquete x 10",
        "tipo": "INSUMO",
        "suministros": 4
      },
      {
        "insumoId": 3,
        "nombre": "Paracetamol",
        "presentacion": "Comprimidos 500 mg",
        "tipo": "MEDICAMENTO",
        "suministros": 3
      }
    ],
    "consumoPorTipo": [
      { "tipo": "MEDICAMENTO", "suministros": 3 },
      { "tipo": "INSUMO", "suministros": 5 }
    ],
    "evolucionDiaria": [
      { "fecha": "2026-10-01", "suministros": 1, "medicamentos": 0, "insumos": 1 },
      { "fecha": "2026-10-02", "suministros": 3, "medicamentos": 2, "insumos": 1 },
      { "fecha": "2026-10-03", "suministros": 0, "medicamentos": 0, "insumos": 0 }
    ],
    "recordatorios": {
      "total": 6,
      "aTiempo": 2,
      "tarde": 1,
      "noAdministrados": 1,
      "vencidosSinAtender": 1,
      "pendientes": 1,
      "atendidos": 4,
      "porcentajeAtendido": 80
    }
  },
  "meta": {
    "parametros": { "desde": "2026-10-01", "hasta": "2026-10-07", "salaId": null, "tipo": null },
    "dias": 7
  }
}
```

## Exportación (T603 · CU34)

`GET /api/reportes/suministros/exportar?formato&desde&hasta&salaId&tipo&agruparPor` y
`GET /api/reportes/estadisticas/exportar?formato&desde&hasta&salaId&tipo`

Responde `200` con el archivo (no JSON):

| Formato | `Content-Type`                                                      | Nombre                                                            |
| ------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `pdf`   | `application/pdf`                                                   | `reporte-suministros-AAAAMMDD.pdf`, `estadisticas-AAAAMMDD.pdf`   |
| `xlsx`  | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `reporte-suministros-AAAAMMDD.xlsx`, `estadisticas-AAAAMMDD.xlsx` |

con `Content-Disposition: attachment; filename="reporte-suministros-20261007.pdf"` (la fecha es la
de emisión en Argentina, D46) y `Cache-Control: no-store`. El frontend lo pide con `fetch` (la
cookie de sesión viaja sola), lo baja como `Blob` y usa el nombre del encabezado. Si falla,
responde JSON con el error de siempre (`400`, `403`, `404`).

Todo archivo lleva:

- **Encabezado** "Hospital El Dique · SGSM-RC" y el **título**: "Reporte de suministros" o
  "Estadísticas de suministros".
- **Parámetros con sus nombres**: período ("01/10/2026 al 07/10/2026 (7 días)"), sala por su
  nombre o "Todas", tipo ("Medicamentos", "Insumos" o "Todos") y, en el reporte, la agrupación
  ("Paciente", "Insumo", "Usuario" o "Día").
- **Emisión** en hora de Argentina ("Emitido el 07/10/2026 12:00 (hora de Argentina)") y **quién
  lo generó** ("Generado por: Apellido, Nombre").
- Las **tablas**: el reporte, con su fila "Total"; las estadísticas, en este orden: indicadores,
  recordatorios (con el porcentaje atendido), insumos más usados, consumo por tipo y evolución
  diaria (con su total). Sin gráficos (fuera de E6).

**PDF** (pdfkit): A4 vertical, fuentes estándar; una tabla larga sigue en la página siguiente con
la fila de títulos repetida; al pie "Página n de m". **Excel** (exceljs): una hoja por tabla
(`Reporte`; o `Indicadores`, `Recordatorios`, `Insumos más usados`, `Consumo por tipo`,
`Evolución diaria`), cada una con el encabezado completo arriba (`Desde`, `Hasta`, `Sala`,
`Tipo`, `Agrupado por`, `Emitido`, `Generado por`) y la fila de títulos fija. Los números son
números, las fechas son fechas y el porcentaje es una fracción con formato `0.0%` (D47).

Cada exportación se **audita** antes de entregarse (si la auditoría falla, no hay archivo).

## Auditoría

`GET /api/auditoria?desde&hasta&usuarioId&pacienteId&accion&entidad&pagina&tamano`

| Parámetro         | Valores                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| `desde` / `hasta` | Días `AAAA-MM-DD` en hora de Argentina, ambos incluidos; sin límite de rango |
| `usuarioId`       | Quién hizo la acción                                                         |
| `pacienteId`      | Paciente afectado                                                            |
| `accion`          | Exacta, como viene en `opciones` (`MODIFICAR`, `EXPORTAR`…)                  |
| `entidad`         | Exacta, como viene en `opciones` (`Paciente`, `Reporte`…)                    |
| `pagina`          | Desde 1 (por defecto 1)                                                      |
| `tamano`          | 1 a 100, por defecto 50; también se acepta `porPagina` (D48)                 |

De la **más reciente a la más vieja** (y por id, a igual hora). `meta` tiene la forma de la
convención de la API ([api.md](api.md)).

```ts
interface EntradaAuditoria {
  id: number;
  fechaHora: string; // ISO 8601 en UTC
  accion: string;
  entidad: string;
  entidadId: string | null;
  /** "Apellido, Nombre"; { id: null, nombre: 'Sistema' } si no hubo usuario (temporizador). */
  usuario: { id: number | null; nombre: string };
  /** Paciente afectado, si corresponde. */
  paciente: { id: number; nombre: string; dni: string | null } | null;
  /** Solo los campos que cambiaron; las claves sensibles llegan como "[oculto]" (D49). */
  valorAnterior: Record<string, unknown> | null;
  valorNuevo: Record<string, unknown> | null;
  detalle: string | null;
}

interface PaginaAuditoria {
  data: EntradaAuditoria[];
  meta: { pagina: number; porPagina: number; total: number; totalPaginas: number };
}
```

Ejemplo:

```json
{
  "data": [
    {
      "id": 812,
      "fechaHora": "2026-10-02T02:30:00.000Z",
      "accion": "TRASLADAR",
      "entidad": "Paciente",
      "entidadId": "12",
      "usuario": { "id": 4, "nombre": "López, Lucas" },
      "paciente": { "id": 12, "nombre": "Alvarez, Ana", "dni": "30111222" },
      "valorAnterior": { "cama": "Sala A · A-01" },
      "valorNuevo": { "cama": "Sala A · A-02" },
      "detalle": null
    },
    {
      "id": 811,
      "fechaHora": "2026-10-02T02:00:00.000Z",
      "accion": "GENERAR",
      "entidad": "Recordatorio",
      "entidadId": "301",
      "usuario": { "id": null, "nombre": "Sistema" },
      "paciente": { "id": 12, "nombre": "Alvarez, Ana", "dni": "30111222" },
      "valorAnterior": null,
      "valorNuevo": { "tipo": "MEDICAMENTO", "prescripcionId": 40, "prioridad": "MEDIA" },
      "detalle": null
    }
  ],
  "meta": { "pagina": 1, "porPagina": 50, "total": 2, "totalPaginas": 1 }
}
```

`GET /api/auditoria/opciones` devuelve las acciones y entidades que **hay en la base**, en orden
alfabético, para armar los filtros (no una lista fija: cada etapa agrega las suyas):

```json
{ "data": { "acciones": ["CREAR", "EXPORTAR", "GENERAR"], "entidades": ["Paciente", "Reporte"] } }
```

## Errores

| HTTP | `codigo`         | Cuándo                                                                                                    |
| ---- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDACION`     | Fecha mal escrita, `hasta` antes que `desde`, más de 366 días, agrupación, formato o paginación inválidos |
| 401  | `NO_AUTENTICADO` | Sin sesión o sesión vencida                                                                               |
| 403  | `SIN_PERMISO`    | Sin el permiso del endpoint (un médico que exporta, un enfermero que ve reportes)                         |
| 404  | `NO_ENCONTRADO`  | La sala del filtro no existe ("La sala no existe")                                                        |

Los `400` traen `detalles` con el campo y el mensaje para la persona, como el resto de la API.

## Auditoría de E6

| Acción     | Entidad | Cuándo                                                                                                                                                                                                                                                                       |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPORTAR` | Reporte | Cada descarga. `entidadId`: `suministros` o `estadisticas`; `valorNuevo`: los parámetros normalizados con el `formato`; `detalle`: lo mismo en palabras ("Reporte de suministros en PDF · 01/10/2026 al 07/10/2026 · Sala: Sala B · Tipo: Insumos · Agrupado por: Paciente") |

Ver el reporte, las estadísticas o la auditoría no se audita (no modifica datos).

## Decisiones

Continúan las de [estudios.md](estudios.md) (D26–D35). Tomadas al implementar el backend de E6.

| #   | Decisión                                                                                                                                                                                                                                                                                                                                                         | Por qué                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D40 | Los días son de calendario en hora de Argentina y los dos extremos se incluyen: el período va de las 00:00 de `desde` a las 00:00 del día siguiente a `hasta`, con el desfase de la zona calculado con `Intl` (no un −3 fijo). Agrupar por día se hace en la base con `AT TIME ZONE 'America/Argentina/Buenos_Aires'`. Sin fechas, los últimos 7 días hasta hoy. | En UTC, lo de las 21:00 a las 23:59 caería en el día siguiente (S18). Un suministro de las 23:30 es de ese día; uno de las 00:30, del siguiente (probado). |
| D41 | `salaId` filtra por la sala de la cama que ocupaba el paciente **en el momento** del suministro (o de la hora objetivo del recordatorio), no por la de hoy.                                                                                                                                                                                                      | Un traslado no mueve lo que ya se registró en la sala anterior: el reporte de una sala es lo que se consumió ahí.                                          |
| D42 | `unidades` suma las cantidades tal como se registraron. Por insumo, una fila por **insumo y unidad**: la de la prescripción si es un medicamento (`unidadDosis`), la del catálogo si es un insumo. Por paciente, usuario o día la suma mezcla unidades: es un indicador de volumen.                                                                              | Dos prescripciones del mismo medicamento en mg y en comprimidos no se pueden sumar; la agrupación por insumo es la que tiene unidades homogéneas.          |
| D43 | `totales.suministros` cuenta suministros **distintos**: uno con dos insumos cuenta en cada fila de insumo pero una sola vez en el total. El filtro `tipo` se aplica a cada insumo: un suministro entra si tiene alguno de ese tipo y solo suma esas cantidades.                                                                                                  | Por paciente, usuario y día la suma de las filas coincide con el total; por insumo puede ser mayor, y está bien.                                           |
| D44 | "Más usados" = en más suministros, no en más unidades; el ranking es por insumo (sin separar unidad) y "consumo por tipo" también cuenta suministros.                                                                                                                                                                                                            | Las cantidades de insumos distintos no se comparan (500 mg contra 2 pañales); las veces que se usó sí.                                                     |
| D45 | Recordatorios del período = hora objetivo en el período, sin los cancelados. Categorías que no se superponen: a tiempo (atendido sin `vencidoEn`), tarde (atendido con `vencidoEn`), no administrado (atendido con motivo, a tiempo o tarde), vencido sin atender y pendiente. El porcentaje deja afuera a los pendientes. No se filtran por `tipo`.             | S20. Un pendiente todavía no tuvo su oportunidad; los recordatorios son de tomas y estudios, no de insumos.                                                |
| D46 | El archivo se arma entero en memoria, se audita y recién después se envía. El nombre lleva la fecha de **emisión** en Argentina; `Cache-Control: no-store`. PDF y Excel salen del mismo modelo (`exportacion/documento.ts`).                                                                                                                                     | No hay descarga sin auditoría; un archivo con datos clínicos no queda en cachés; los dos formatos muestran siempre lo mismo.                               |
| D47 | En Excel, una hoja por tabla con el encabezado completo en cada una; los días son fechas (00:00), la emisión es una fecha y hora con los números de la hora de Argentina (Excel no guarda zona) y el porcentaje una fracción con formato `0.0%`.                                                                                                                 | Se puede ordenar, filtrar y sumar en la planilla; cada hoja impresa sola dice de qué es.                                                                   |
| D48 | La auditoría pagina con `tamano` (diseño de E6) y acepta `porPagina` como sinónimo; `meta` usa la forma de la convención (`porPagina`). Las fechas son días de Argentina, como en los reportes.                                                                                                                                                                  | La tabla común del frontend lee `meta.porPagina` en todos los listados.                                                                                    |
| D49 | La consulta oculta como `"[oculto]"`, a cualquier profundidad, toda clave que contenga contraseña, password, hash, patron, foto, token o secret, aunque `registrarAuditoria` ya las oculta al guardar.                                                                                                                                                           | Revisión de T705 adelantada: si una entrada vieja o cargada a mano tuviera un dato sensible, no sale por la API (probado con una entrada armada a mano).   |

## Pruebas

- [`reportes.esquemas.test.ts`](../backend/src/modulos/reportes/reportes.esquemas.test.ts):
  período por defecto con el "hoy" de Argentina, 366 días, fechas inválidas, agrupación y formato.
- [`reporte.test.ts`](../backend/src/modulos/reportes/reporte.test.ts): las cuatro agrupaciones
  contra datos armados a mano ([`tests/soporte/reportes.ts`](../backend/tests/soporte/reportes.ts)),
  totales comparados con la base (T608), día de Argentina (23:30 y 00:30), sala con traslado,
  tipo, corregido (S19), vacío, 404, 400 y permisos.
- [`estadisticas.test.ts`](../backend/src/modulos/reportes/estadisticas.test.ts): indicadores,
  top 10, consumo por tipo, días en cero, recordatorios (S20) con y sin sala, y permisos.
- [`exportacion.test.ts`](../backend/src/modulos/reportes/exportacion.test.ts): el PDF empieza con
  `%PDF` y su texto (extraído de los flujos) tiene encabezado, parámetros, emisión, autor y
  totales; el Excel se vuelve a abrir con exceljs y tiene números, fechas y totales; auditoría de
  cada exportación; 400, 404 y permisos (un médico recibe 403 al exportar, un enfermero al ver).
- [`auditoria.esquemas.test.ts`](../backend/src/modulos/auditoria/auditoria.esquemas.test.ts) y
  [`consulta.test.ts`](../backend/src/modulos/auditoria/consulta.test.ts): filtros (días de
  Argentina, usuario, paciente, acción, entidad), orden, paginación, "Sistema", opciones, claves
  sensibles ocultas y permisos.
- [`esquema.test.ts`](../backend/tests/integracion/esquema.test.ts): el índice de
  `suministros(fecha_hora)`; [`semillas.test.ts`](../backend/tests/integracion/semillas.test.ts):
  los permisos de E6 por rol.
