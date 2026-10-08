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

| Formato | `Content-Type`                                                      | Nombre                                                                              |
| ------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pdf`   | `application/pdf`                                                   | `reporte-suministros-AAAAMMDD-AAAAMMDD.pdf`, `estadisticas-AAAAMMDD-AAAAMMDD.pdf`   |
| `xlsx`  | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `reporte-suministros-AAAAMMDD-AAAAMMDD.xlsx`, `estadisticas-AAAAMMDD-AAAAMMDD.xlsx` |

con `Content-Disposition: attachment; filename="reporte-suministros-20261001-20261007.pdf"` (las
fechas son las del período, `desde` y `hasta` en días de Argentina, también cuando no se eligieron
y son las del período por defecto: ESC4 y D46) y `Cache-Control: no-store`. El frontend lo pide con `fetch` (la
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

`GET /api/auditoria?desde&hasta&usuarioId&pacienteId&accion&entidad&origen&pagina&tamano`

| Parámetro         | Valores                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desde` / `hasta` | Días `AAAA-MM-DD` en hora de Argentina, ambos incluidos; sin límite de rango                                                                                                                         |
| `usuarioId`       | Quién hizo la acción                                                                                                                                                                                 |
| `pacienteId`      | Paciente afectado                                                                                                                                                                                    |
| `accion`          | Exacta, como viene en `opciones` (`MODIFICAR`, `EXPORTAR`…)                                                                                                                                          |
| `entidad`         | Exacta, como viene en `opciones` (`Paciente`, `Reporte`…)                                                                                                                                            |
| `origen`          | Opcional (ESC2 · D101): `personas` (con usuario, `usuarioId` no nulo) o `sistema` (sin usuario: el temporizador y el instalador); sin él, todos. Otro valor (también vacío o en mayúsculas) es `400` |
| `pagina`          | Desde 1 (por defecto 1)                                                                                                                                                                              |
| `tamano`          | 1 a 100, por defecto 50; también se acepta `porPagina` (D48)                                                                                                                                         |

`origen` lo pide la pantalla con `personas` por defecto: el temporizador genera y vence
recordatorios todo el día y taparía los movimientos de las personas.

De la **más reciente a la más vieja** (y por id, a igual hora). `meta` tiene la forma de la
convención de la API ([api.md](api.md)).

```ts
interface EntradaAuditoria {
  id: number;
  fechaHora: string; // ISO 8601 en UTC
  accion: string;
  entidad: string;
  entidadId: string | null;
  /**
   * Nombre del registro afectado, si se puede resolver (D114): Usuario y Paciente, "Apellido,
   * Nombre"; Insumo, nombre y presentación; Prescripcion, "Medicamento · Apellido, Nombre".
   * null en el resto, sin id o si el registro ya no existe: la pantalla muestra "Usuario n.º 4".
   */
  entidadEtiqueta: string | null;
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
      "entidadEtiqueta": "Alvarez, Ana",
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
      "entidadEtiqueta": null,
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

| HTTP | `codigo`         | Cuándo                                                                                                            |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| 400  | `VALIDACION`     | Fecha mal escrita, `hasta` antes que `desde`, más de 366 días, agrupación, formato, origen o paginación inválidos |
| 401  | `NO_AUTENTICADO` | Sin sesión o sesión vencida                                                                                       |
| 403  | `SIN_PERMISO`    | Sin el permiso del endpoint (un médico que exporta, un enfermero que ve reportes)                                 |
| 404  | `NO_ENCONTRADO`  | La sala del filtro no existe ("La sala no existe")                                                                |

Los `400` traen `detalles` con el campo y el mensaje para la persona, como el resto de la API.

## Auditoría de E6

| Acción     | Entidad | Cuándo                                                                                                                                                                                                                                                                       |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPORTAR` | Reporte | Cada descarga. `entidadId`: `suministros` o `estadisticas`; `valorNuevo`: los parámetros normalizados con el `formato`; `detalle`: lo mismo en palabras ("Reporte de suministros en PDF · 01/10/2026 al 07/10/2026 · Sala: Sala B · Tipo: Insumos · Agrupado por: Paciente") |

Ver el reporte, las estadísticas o la auditoría no se audita (no modifica datos).

## Decisiones

Continúan las de [estudios.md](estudios.md) (D26–D35). Tomadas al implementar el backend de E6.

| #    | Decisión                                                                                                                                                                                                                                                                                                                                                                                | Por qué                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D40  | Los días son de calendario en hora de Argentina y los dos extremos se incluyen: el período va de las 00:00 de `desde` a las 00:00 del día siguiente a `hasta`, con el desfase de la zona calculado con `Intl` (no un −3 fijo). Agrupar por día se hace en la base con `AT TIME ZONE 'America/Argentina/Buenos_Aires'`. Sin fechas, los últimos 7 días hasta hoy.                        | En UTC, lo de las 21:00 a las 23:59 caería en el día siguiente (S18). Un suministro de las 23:30 es de ese día; uno de las 00:30, del siguiente (probado).                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D41  | `salaId` filtra por la sala de la cama que ocupaba el paciente **en el momento** del suministro (o de la hora objetivo del recordatorio), no por la de hoy.                                                                                                                                                                                                                             | Un traslado no mueve lo que ya se registró en la sala anterior: el reporte de una sala es lo que se consumió ahí.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D42  | `unidades` suma las cantidades tal como se registraron. Por insumo, una fila por **insumo y unidad**: la de la prescripción si es un medicamento (`unidadDosis`), la del catálogo si es un insumo. Por paciente, usuario o día la suma mezcla unidades: es un indicador de volumen.                                                                                                     | Dos prescripciones del mismo medicamento en mg y en comprimidos no se pueden sumar; la agrupación por insumo es la que tiene unidades homogéneas.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D43  | `totales.suministros` cuenta suministros **distintos**: uno con dos insumos cuenta en cada fila de insumo pero una sola vez en el total. El filtro `tipo` se aplica a cada insumo: un suministro entra si tiene alguno de ese tipo y solo suma esas cantidades.                                                                                                                         | Por paciente, usuario y día la suma de las filas coincide con el total; por insumo puede ser mayor, y está bien.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D44  | "Más usados" = en más suministros, no en más unidades; el ranking es por insumo (sin separar unidad) y "consumo por tipo" también cuenta suministros.                                                                                                                                                                                                                                   | Las cantidades de insumos distintos no se comparan (500 mg contra 2 pañales); las veces que se usó sí.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D45  | Recordatorios del período = hora objetivo en el período, sin los cancelados. Categorías que no se superponen: a tiempo (atendido sin `vencidoEn`), tarde (atendido con `vencidoEn`), no administrado (atendido con motivo, a tiempo o tarde), vencido sin atender y pendiente. El porcentaje deja afuera a los pendientes. No se filtran por `tipo`.                                    | S20. Un pendiente todavía no tuvo su oportunidad; los recordatorios son de tomas y estudios, no de insumos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D46  | El archivo se arma entero en memoria, se audita y recién después se envía. El nombre lleva el **período** (`desde` y `hasta`, días de Argentina ya normalizados): `reporte-suministros-AAAAMMDD-AAAAMMDD.pdf`, `estadisticas-AAAAMMDD-AAAAMMDD.xlsx` (ESC4; antes era la fecha de emisión). `Cache-Control: no-store`. PDF y Excel salen del mismo modelo (`exportacion/documento.ts`). | No hay descarga sin auditoría; un archivo con datos clínicos no queda en cachés; los dos formatos muestran siempre lo mismo. Con el período en el nombre, dos descargas del mismo día de períodos distintos no se confunden ni se pisan en la carpeta de descargas.                                                                                                                                                                                                                                                                                                                              |
| D47  | En Excel, una hoja por tabla con el encabezado completo en cada una; los días son fechas (00:00), la emisión es una fecha y hora con los números de la hora de Argentina (Excel no guarda zona) y el porcentaje una fracción con formato `0.0%`.                                                                                                                                        | Se puede ordenar, filtrar y sumar en la planilla; cada hoja impresa sola dice de qué es.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D48  | La auditoría pagina con `tamano` (diseño de E6) y acepta `porPagina` como sinónimo; `meta` usa la forma de la convención (`porPagina`). Las fechas son días de Argentina, como en los reportes.                                                                                                                                                                                         | La tabla común del frontend lee `meta.porPagina` en todos los listados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D49  | La consulta oculta como `"[oculto]"`, a cualquier profundidad, toda clave que contenga contraseña, password, hash, patron, foto, token o secret, aunque `registrarAuditoria` ya las oculta al guardar.                                                                                                                                                                                  | Revisión de T705 adelantada: si una entrada vieja o cargada a mano tuviera un dato sensible, no sale por la API (probado con una entrada armada a mano).                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D114 | `entidadEtiqueta` se resuelve por lote: una consulta por tipo de registro presente en la página (usuarios, insumos, prescripciones con su medicamento y paciente) y los pacientes en la misma consulta que la columna Paciente; solo esos cuatro tipos, ids numéricos que entran en un `integer`.                                                                                       | Mostrar "Usuario n.º 4" obligaba a buscar quién era. Por lote, una página de 100 filas suma como mucho tres consultas por clave primaria: en `sgsm_volumen`, ~3 ms (p50) en la página más lejana, con el mismo código antes y después ~66 → 67 ms (p50) y 71 → 74 ms (p95), en el orden de lo medido en [rendimiento.md](rendimiento.md) (76 ms). Con `npm run volumen:medir` sobre el volumen migrado: 95 ms (p50) y 109 ms (p95), en una corrida con la PC más cargada en la que todo salió un 20 a 50 % más lento ([revisión de octubre](rendimiento.md#revisión-de-octubre-d101-d114-d121)). |
| D101 | `origen=personas` filtra `usuarioId` no nulo y `origen=sistema`, nulo, en un `AND` aparte (un usuario con `origen=sistema` no trae nada). El índice del orden, `auditoria(fecha_hora, id)` (D72), pasa a ser `auditoria(fecha_hora, id, usuario_id)`: migración `auditoria_por_origen`.                                                                                                 | Medido en `sgsm_volumen` (600.000 entradas, 74 % de personas): la página más lejana con `personas` (el filtro por defecto de la pantalla) bajó de ~110 a ~49 ms en caliente y deja de leer la tabla (en frío eran 2,7 s); con `sistema`, de ~105 ms (con un ordenamiento en disco) a ~22. Mismo tamaño (18 → 19 MB) y ningún índice más que mantener; la primera página ya tardaba menos de 1 ms.                                                                                                                                                                                                |

## Pruebas

- [`auditoria/etiquetas.test.ts`](../backend/src/modulos/auditoria/etiquetas.test.ts): la
  etiqueta de cada tipo, `null` sin id, con un id que no existe o que no entra en un `integer`, y
  una sola consulta por tipo de registro (D114).
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
  totales; el Excel se vuelve a abrir con exceljs y tiene números, fechas y totales; el nombre del
  archivo con el período pedido (no la emisión), el período por defecto a las 22:00 de Argentina y
  un solo día (D46); auditoría de cada exportación; 400, 404 y permisos (un médico recibe 403 al
  exportar, un enfermero al ver).
- [`auditoria.esquemas.test.ts`](../backend/src/modulos/auditoria/auditoria.esquemas.test.ts) y
  [`consulta.test.ts`](../backend/src/modulos/auditoria/consulta.test.ts): filtros (días de
  Argentina, usuario, paciente, acción, entidad, origen y su combinación con el usuario), orden,
  paginación, "Sistema", opciones, claves sensibles ocultas, `400` con un origen inválido y
  permisos; [`volumen.test.ts`](../backend/src/modulos/auditoria/volumen.test.ts): cada página
  por origen es el tramo que le toca del orden completo (D101).
- [`esquema.test.ts`](../backend/tests/integracion/esquema.test.ts): el índice de
  `suministros(fecha_hora)` y el de `auditoria(fecha_hora, id, usuario_id)` (D101); [`semillas.test.ts`](../backend/tests/integracion/semillas.test.ts):
  los permisos de E6 por rol.

## Interfaz (T605–T607)

Frontend en [`paginas/reportes/`](../frontend/src/paginas/reportes/) y
[`paginas/auditoria/`](../frontend/src/paginas/auditoria/); API tipada en
[`api/reportes.ts`](../frontend/src/api/reportes.ts) y [`api/auditoria.ts`](../frontend/src/api/auditoria.ts),
con los tipos de este contrato. Revisada contra los estándares en la revisión de E6 (hallazgos
E6-01 a E6-19, decisiones del lead ESC2 a ESC4).

### Pantallas y permisos

| Ruta         | Menú                         | Permiso             | Qué hay                                                               |
| ------------ | ---------------------------- | ------------------- | --------------------------------------------------------------------- |
| `/reportes`  | "Reportes", tras Suministros | `reportes.ver`      | Pestañas **Suministros** y **Estadísticas** con los mismos parámetros |
| (descargas)  | —                            | `reportes.exportar` | "Descargar PDF" y "Descargar Excel" en las dos pestañas               |
| `/auditoria` | "Auditoría", al final        | `auditoria.ver`     | Movimientos filtrables y paginados, con el detalle Antes y después    |

El Inicio suma "Ver reportes" (con `reportes.ver`) al final de las clínicas y, para el
administrador, **"Ver quién cambió algo"** (con `auditoria.ver`) entre sus tareas de gestión
(E6-19). Una ruta sin permiso muestra "No tiene permiso para ver esta pantalla" (el backend igual
responde 403). Quien ve los reportes pero no los descarga (el médico) lee en su lugar "Para
descargar el archivo, pídaselo a un administrador." (E6-15: exportar sigue siendo del
administrador).

### Parámetros en la URL

| Pantalla  | Parámetro                                                                  | Por defecto (no se escribe) |
| --------- | -------------------------------------------------------------------------- | --------------------------- |
| Reportes  | `pestana` (`estadisticas`)                                                 | `suministros`               |
| Reportes  | `periodo` (`hoy`, `7`, `30`): atajo contado desde hoy                      | `7`                         |
| Reportes  | `desde`, `hasta` (días `AAAA-MM-DD`): mandan sobre el atajo                | —                           |
| Reportes  | `salaId`, `tipo` (`MEDICAMENTO`/`INSUMO`), `agruparPor`                    | todas, todos, `paciente`    |
| Auditoría | `desde`, `hasta`, `usuarioId`, `pacienteId`, `accion`, `entidad`, `pagina` | todo, página 1              |
| Auditoría | `origen` (`sistema`; vacío, `origen=`, es "Todos")                         | `personas`                  |

Un enlace como `/reportes?periodo=30&tipo=INSUMO&agruparPor=insumo` abre siempre los últimos 30 días
de ese momento. Cambiar de pestaña conserva los parámetros (las estadísticas no se agrupan, pero
`agruparPor` queda para volver). "Quitar filtros" vuelve al período por defecto, todas las salas y
todos los tipos, sin tocar la agrupación; en la auditoría, a Personas y sin fechas.

### Período (E6-13)

- Los campos **Desde** y **Hasta** guardan lo que se escribe y lo piden **al salir del campo o con
  Enter**: el selector nativo cambia de valor con cada dígito del año y antes se pedía (y se
  validaba) "0002-10-01".
- Un campo **vacío no se repone solo**: queda vacío con "Elija la fecha "desde"" y no se muestra un
  resultado de otro período hasta elegirla (o tocar un atajo).
- El error del rango va **bajo el campo que se cambió**: "La fecha "desde" no puede ser posterior a
  "hasta"" o "El período puede tener hasta 366 días" bajo Hasta si fue Hasta la que lo estiró.
- Una fecha imposible (un enlace con `desde=2026-13-45`) pide "Elija una fecha válida", no el
  formato `AAAA-MM-DD` del servidor (también si el 400 llega igual).

### Reporte de suministros

- Tabla (tarjetas en teléfono) con la etiqueta del grupo y **Suministros**. Por **medicamento o
  insumo** (la agrupación se llama así, E6-04: "Insumo" solo es lo no medicinal), además el
  **Tipo** y **Unidades** con la unidad junto al número ("1000 mg", "5 unidad"); el total, **por
  unidad** ("5 unidad, 1 comprimido, 1000 mg"), nunca sumado (D42). La última fila es **Total**,
  con el total del servidor (suministros distintos, D43).
- Por **paciente, personal o día** la columna se llama **"Volumen (suma de cantidades de distinta
  unidad)"** y una nota **arriba** de la tabla explica que sirve para comparar, no es una dosis,
  con el enlace **"Ver cada unidad por separado"**: la misma URL con `agruparPor=insumo` (E6-05).
- Arriba de la tabla, el período, la sala y el tipo **que devolvió el servidor** (normalizados) y
  las descargas.

### Estadísticas

- **Indicadores** grandes: Suministros, Con medicamentos, Con insumos, Pacientes atendidos,
  **Recordatorios atendidos** (`porcentajeAtendido`, "4 de 5") y **Atendidos a tiempo** (ESC3:
  `aTiempo / (total − pendientes)`, "2 de 5"; "—" si no hay recordatorios medibles). Debajo, la
  explicación del cálculo, que también describe la lista de indicadores: "Porcentajes sobre los
  5 recordatorios que ya se atendieron o vencieron. Del total, 1 todavía estaba a tiempo de
  atenderse: no cuenta para el porcentaje. Atendidos: dados a tiempo o tarde, o no administrados
  con su motivo. A tiempo: dados antes de vencer." (sin la palabra "pendiente", D156). El gráfico
  de recordatorios usa la misma frase y termina con lo suyo: "Del total, 1 todavía estaba a
  tiempo de atenderse: no aparece en el gráfico."
- **Gráficos** de `@mui/x-charts`, cada uno con título `h2`, descripción (la sección se describe
  con ella por `aria-describedby` y termina con "Los mismos números están en Ver como tabla.",
  E6-18) y "Ver como tabla" (`GraficoConTabla`, ver [componentes.md](componentes.md)); ejes con
  letra de 14 px. Las reglas de color y forma están en [DESIGN.md](../DESIGN.md#gráficos):
  - **Medicamentos e insumos más usados** (E6-04): barras horizontales del color de los
    suministros, con el número al final; el eje tiene **el nombre y la presentación en dos
    renglones** y se mide con el renglón más largo, hasta la mitad del ancho (E6-03). En el
    teléfono la tabla ya está abierta.
  - **Consumo por tipo**: dos barras con nombre, "Con medicamentos" y "Con insumos", cada una con
    el color de su serie, y al final "3 (37,5 %)". El porcentaje es **sobre el total de
    suministros del período** (uno con los dos cuenta en ambos, por eso pueden sumar más de
    100 %) y la descripción y la columna "De los 8 suministros del período" lo dicen (E6-02).
  - **Evolución diaria**: tres líneas (Suministros, Con medicamentos, Con insumos) que se distinguen
    por color, forma del punto y trazo (continuo, rayado, punteado); la **leyenda dibuja el mismo
    trazo y la misma forma** (`labelMarkType` propio) y los puntos siguen a la vista con muchos
    días: uno cada tantos, con el primero y el último (E6-11).
  - **Recordatorios del período** (E6-01): una barra horizontal por estado (A tiempo, Tarde, No
    administrados, Vencidos sin atender) con el nombre en el eje y el número al final; un solo
    color neutro y el de aviso **solo** para "Vencidos sin atender". Sin leyenda: el nombre ya
    está en el eje.
  - La biblioteca recorta lo que sale del área de las barras: el eje de los valores se **estira**
    según el ancho de la etiqueta más larga para que el número de la barra más larga entre a su
    derecha; si no hay lugar ni así (el consumo por tipo en el teléfono), queda solo el número y
    el porcentaje sigue en la tabla (E6-17).
- Sin suministros en el período, en lugar de gráficos vacíos: "No hay suministros el 07/10/2026.
  Amplíe el período." (y lo mismo para los recordatorios).
- Con `prefers-reduced-motion` los gráficos se dibujan sin animación (`skipAnimation`).

### Descargas

`descargar(ruta, query, nombreDeRespaldo, senal?)` en [`api/cliente.ts`](../frontend/src/api/cliente.ts)
pide el archivo con la cookie de sesión; si el servidor responde un error, es el mismo `ErrorApi`
que en cualquier pedido (403, 500, sesión vencida). Toda falla de red, **también mientras llega el
archivo** (`blob()`), es `ErrorApi(0, 'SIN_CONEXION')` con el mensaje de siempre; una descarga
cancelada con `senal` es `ErrorApi(0, 'CANCELADO')` (E6-06). `mensajeDeError` muestra el mensaje
solo de un `ErrorApi`: el de cualquier otro error es técnico y se cambia por la falla inesperada.

La pantalla (E6-15):

- Mientras se arma, el botón dice "Preparando el archivo…" con su indicador (también para
  lectores de pantalla) y el otro formato espera. Ese botón **no desaparece si cambian los
  filtros**: la descarga sigue y termina.
- A los **10 s**, un aviso "Sigue preparándose el PDF…" con **Cancelar** (`AbortController`): se
  corta el pedido, se dice "Se canceló la descarga." y no se baja nada aunque el archivo llegue
  después.
- Al terminar, "Se descargó reporte-suministros-20261001-20261007.pdf (01/10 al 07/10)." (el
  período del pedido; el nombre lo da el servidor, ESC4) o "No se pudo descargar el PDF.
  {motivo}". El aviso **se va al cambiar los filtros**.
- Sin datos en el período: "No hay datos para descargar en este período" en lugar de los botones.
- La entrega es con un enlace temporal (`URL.createObjectURL`) con el nombre de
  `Content-Disposition`, que se libera 10 s después. Los botones son secundarios: la pantalla no
  tiene una acción llena.

### Auditoría

- Filtros: Desde, Hasta, **Origen** (Personas por defecto, Sistema o Todos: ESC2), **Quién lo
  hizo** (D155), Paciente, Acción y **Sobre qué** (la misma palabra que la columna, E6-08). Acciones y "sobre
  qué" son las de `/api/auditoria/opciones`, **en palabras**
  ([`palabras.ts`](../frontend/src/paginas/auditoria/palabras.ts): `TRASLADAR` → "Trasladó",
  `EGRESAR` → "Dio de alta", `Prescripcion` → "Prescripción"…); un código que todavía no tiene
  nombre se muestra tal cual.
- **Quién lo hizo y Paciente se buscan en el servidor** mientras se escribe (E6-09): `Autocomplete` que
  pide `/api/usuarios?texto=` o `/api/pacientes?texto=` (apellido, nombre o DNI; los pacientes,
  también los egresados) y muestra las primeras 10 sugerencias, con "Se muestran 10 de N" en la
  ayuda si hay más. Lo elegido se borra con la cruz para volver a "todos"; uno que llega por un
  enlace se nombra con lo que trajeron los movimientos (o "Paciente n.º 12").
- Tabla **"Movimientos"** (cada fila es un movimiento, E6-08), con el título a la vista: Fecha y
  hora (24 h, Argentina), **Quién lo hizo** ("Sistema" si no hubo), Acción, **Sobre qué** (con el
  nombre del registro si el servidor lo manda en `entidadEtiqueta`: "Usuario: Pérez, Ana",
  "Prescripción: Paracetamol · Benítez, Rosa"; si no, "Paciente n.º 12", "Reporte: suministros")
  y Paciente con DNI. Crear un paciente se dice "Internó" (glosario). De a **50; 25 en el teléfono**. La paginación está
  arriba y abajo, con primera y última página y "Página 2 de 3 · 51–100 de 120"; al pasar de
  página, la vista y el foco vuelven al título (E6-10).
- Sin movimientos: "Todavía no hay movimientos de personas. Para ver los del sistema, cambie Origen
  a Todos." o, con filtros, qué se buscó y qué probar, con "Quitar filtros".
- Al abrir una fila (toque, clic, Enter o Espacio), un diálogo (pantalla completa en teléfono) con
  fecha, quién lo hizo, sobre qué, paciente y detalle, y **Antes y después** campo por campo: "Cambiaron 2 de 4
  campos.", los que cambiaron con ícono, el texto "Cambió" y fondo tenue; "Sin valor" donde no
  había. Sin valores anteriores (lo que se creó con la acción) no se marca nada y se dice.
- **Campos y valores en palabras** (E6-07): cada clave que el backend escribe tiene su nombre con
  tildes (`motivoCancelacion` → "Motivo de la cancelación", `validadoBiometricamente` →
  "Confirmado con el rostro"); los valores fijos con las palabras de los chips y del glosario
  (`PENDIENTE` → "Pendiente", `ALTA` → "Urgente", `MEDICAMENTO` → "Medicamento", `SONDA` → "Por
  sonda", `insumo` → "Medicamento o insumo"); los ids de otro registro como "n.º 40" bajo su
  nombre ("Prescripción"); la frecuencia como "cada 8 h"; los permisos con lo que dejan hacer; y
  en un reporte exportado, sin sala ni tipo es "Todas las salas" y "Medicamentos e insumos".
- **Datos protegidos** (E6-12): `[oculto]` se lee "Dato protegido (no se muestra)" y una sola nota
  en el diálogo lo explica; si está de los dos lados, se marca "Cambió" (el servidor solo guarda
  los campos que cambian).

### Estados

Cargando, error con Reintentar ("No se pudo cargar el reporte de suministros. {motivo}") y vacío con
lo que se usó y "Quitar filtros". Un 400 o un 404 dicen qué corregir sin Reintentar ("No se pudo
armar el reporte de suministros. La sala no existe.") y, si hay filtros, ofrecen **"Quitar
filtros"** en el mismo aviso (E6-16); un 400 sobre las fechas además marca el campo. Una sala de un
enlace que ya no existe aparece en el selector como "Sala n.º 99 (no existe)".

### Decisiones de la interfaz

| #   | Decisión                                                                                                                                                                                                                                                                                                                                     | Por qué                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| D63 | El atajo del período va en la URL (`periodo`) y se cuenta desde el hoy de Argentina al dibujar; elegir una fecha fija las dos. Con una sola fecha se completa como el servidor. El período se valida en el cliente con los mensajes del esquema real (la prueba los compara) y, si es inválido, no se pide nada ni se muestran datos viejos. | Un enlace "últimos 30 días" sirve mañana; el error que se ve es el mismo que daría el 400.                      |
| D64 | Los colores de los gráficos salen del esquema activo (`useColorScheme`) ya resueltos, no como variables CSS, porque la biblioteca pinta con atributos SVG. Cada color es una serie con el mismo significado en toda la pantalla (ver E6-01 abajo); nunca `success` ni `error`. Toda serie se nombra con texto.                               | Siguen al tema claro y oscuro sin depender del soporte de `var()` en atributos; ningún color es la única señal. |
| D65 | Las descargas no se ofrecen si no hay datos (se dice) o si lo que se ve es el resultado anterior mientras llega el nuevo, salvo la que está en curso; una sola a la vez. El archivo se libera 10 s después de entregarlo.                                                                                                                    | El archivo siempre corresponde a lo que se pidió; liberarlo enseguida corta la descarga en algunos navegadores. |
| D66 | En la auditoría, el filtro de usuario busca en `/api/usuarios` (pide `usuarios.gestionar`): sin ese permiso no se ofrece. El de paciente busca en todos (también los egresados). Lo elegido por un enlace se nombra aunque no esté entre las sugerencias.                                                                                    | La auditoría es de toda la historia; un enlace guardado no deja el filtro en blanco.                            |
| D67 | Un campo "cambió" si los dos lados tienen valores y difieren por contenido (sin importar el orden de las claves); también si aparece o desaparece, y si es un dato protegido de los dos lados. Sin valores anteriores no se marca nada.                                                                                                      | Marcar todo lo creado como "cambió" sería ruido; lo que importa es lo modificado.                               |
| D68 | Los reportes leen `meta` con `api.lista` (tipado en `api/reportes.ts`); el cliente solo suma `descargar`, que reutiliza el manejo de errores de los demás pedidos.                                                                                                                                                                           | Un solo lugar decide cómo se explica un error, también en las descargas.                                        |

### Decisiones de la interfaz (revisión E6)

| Hallazgo | Decisión                                                                                                                                                                                                                                                                                                                    | Por qué                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E6-01    | Un color por serie en toda la pantalla: suministros `info`, con medicamentos `primary`, con insumos `secondary`, recordatorios neutro (`text.secondary`) y vencidos sin atender `warning`. Los gráficos de una sola medida (más usados, recordatorios) usan un solo color; consumo por tipo, el de cada serie.              | La torta y la barra apilada se distinguían solo por el matiz y `primary` era "medicamentos" en un gráfico y "a tiempo" en otro. Con el nombre en el eje el color solo acompaña. |
| E6-02    | El porcentaje del consumo por tipo es sobre `totales.suministros` y no sobre la suma de las dos barras; se dice que puede pasar de 100 %.                                                                                                                                                                                   | Un suministro con medicamento e insumo está en las dos barras: sumarlas lo contaba dos veces.                                                                                   |
| E6-03    | El eje de los más usados lleva nombre y presentación en dos renglones y mide el renglón más largo (letra de 14 px a 0,6 por carácter), hasta la mitad del ancho; en el teléfono la tabla empieza abierta. El eje recibe una clave corta y un rótulo propio (`axisTickLabel`) pone los dos renglones, ya recortados con "…". | Un ancho fijo de 240 px cortaba "Paracetamol · Comprimidos 500 mg". La biblioteca mide los dos renglones como uno solo y cortaba el segundo aunque entrara (visto en Chromium). |
| E6-17    | El lugar para el número se hace estirando el máximo del eje (`maximoConLugar`), no con el margen derecho; si ni así entra "31 (64,6 %)", queda "31".                                                                                                                                                                        | La biblioteca recorta las etiquetas en el borde del área de las barras: con más margen el número igual se cortaba ("31 (64").                                                   |
| E6-05    | La columna se rotula "Volumen (suma de cantidades de distinta unidad)" en lugar de ocultarla, con la nota arriba y el enlace a la agrupación por medicamento o insumo.                                                                                                                                                      | El volumen sirve para comparar pacientes o turnos; ocultarlo perdía ese uso, y la nota de abajo se leía después de los números.                                                 |
| E6-06    | `mensajeDeError` solo muestra el mensaje de un `ErrorApi`; la descarga envuelve también `blob()` y distingue la cancelación (`CANCELADO`).                                                                                                                                                                                  | "Failed to fetch" o "terminated" no le dicen nada a nadie; una cancelación no es una falla de red.                                                                              |
| E6-07    | Los valores se traducen por campo (`valorEnPalabras`) y la prueba recorre las 55 claves que escribe el backend (y las sensibles); los ids van como "n.º 40" bajo el nombre del registro ("Prescripción"), no "Prescripción n.º" con "n.º 40".                                                                               | Repetir "n.º" en el rótulo y en el valor se leía dos veces; con el número solo, "40" se confundía con una cantidad.                                                             |
| E6-09    | Búsqueda en el servidor con `texto` y 10 sugerencias (las primeras al abrir), en lugar de una lista de 100.                                                                                                                                                                                                                 | Con cientos de pacientes o de personal, la lista dejaba afuera a quien se buscaba sin decirlo.                                                                                  |
| E6-10    | La paginación de `Tabla` dice página y filas en un `role="status"` (uno solo, aunque haya dos barras) y lleva el foco al título visible o a la tabla.                                                                                                                                                                       | Con dos barras, dos anuncios repetían lo mismo; sin mover el foco, al pasar de página se quedaba al pie de una lista nueva.                                                     |
| E6-13    | Las fechas se confirman al salir del campo o con Enter, y el borrador vive en `useParametrosReporte` (no en el campo).                                                                                                                                                                                                      | Un atajo o "Quitar filtros" tienen que poder descartar lo que se estaba escribiendo y la pantalla tiene que saber si el período está incompleto.                                |
| E6-15    | Al cancelar, la pantalla vuelve a estar lista enseguida y el archivo que llegue después no se entrega (aunque `fetch` no haya cortado).                                                                                                                                                                                     | Quien canceló no espera un archivo; algunos entornos no cortan el pedido con la señal.                                                                                          |
| ESC2     | El filtro Origen manda `origen=personas` por defecto, `sistema` o nada (todos); en la URL, "Todos" es `origen=`.                                                                                                                                                                                                            | El temporizador genera y vence recordatorios a toda hora: sin el filtro, los movimientos de las personas quedaban enterrados.                                                   |
| ESC3     | "Atendidos a tiempo" se calcula en la pantalla con los conteos que ya vienen: `aTiempo / (total − pendientes)`.                                                                                                                                                                                                             | Es la misma base que `porcentajeAtendido` (los pendientes todavía no tuvieron su oportunidad) y no hace falta tocar el contrato.                                                |

### Decisiones de la interfaz (revisión F1–F20)

| #    | Decisión                                                                                                                                                                                                                                                                                                                                                                                                        | Por qué                                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D155 | "Usuario" deja de usarse para quien hizo el movimiento: la columna, el dato del detalle y el filtro se llaman **Quién lo hizo**; **Sobre qué** usa `entidadEtiqueta` (C2) con la palabra de la entidad delante ("Usuario: Pérez, Ana") y, si no viene, el número. `accionSobre` dice "Internó" al crear un paciente, también en el historial del paciente.                                                      | En un cambio de rol, "Usuario: López" al lado de "Sobre qué: Usuario n.º 4" no decía quién le hizo qué a quién, y el número obligaba a buscar a la persona en otra pantalla. |
| D156 | La explicación de los porcentajes de recordatorios no dice "pendiente": "todavía estaba(n) a tiempo de atenderse". El resumen y el gráfico usan la misma frase (`pendientesEnPalabras` de [`mensajes.ts`](../frontend/src/paginas/reportes/mensajes.ts)), "Del total, 9 todavía estaban a tiempo de atenderse:", y cada uno termina con lo suyo: "no cuentan para el porcentaje" o "no aparecen en el gráfico". | "Pendiente" es un estado del sistema; quien lee las estadísticas (médico, administración) no lo conoce.                                                                      |

### Pruebas de la interfaz

- [`reportes.test.tsx`](../frontend/src/paginas/reportes/reportes.test.tsx): período por defecto,
  atajos (pedido, fechas y URL), parámetros desde la URL, validación del período, fechas que se
  piden al confirmarlas, vacío sin reponer, error bajo el campo cambiado y "Elija una fecha
  válida" (E6-13), 400/404 del servidor con "Quitar filtros" y sala que no existe (E6-16), las
  cuatro agrupaciones, unidades por insumo sin sumar, volumen con su nota arriba y "Ver cada unidad
  por separado" (E6-05), total, vacío con "Quitar filtros", error con Reintentar, permisos y
  teléfono.
- [`estadisticas.test.tsx`](../frontend/src/paginas/reportes/estadisticas.test.tsx): indicadores
  (con "Atendidos a tiempo" y su explicación, ESC3), títulos, "Ver como tabla" con los mismos
  números, series con nombre, pestañas que conservan los parámetros, vacío, error y teléfono;
  [`graficos.test.tsx`](../frontend/src/paginas/reportes/graficos.test.tsx): `skipAnimation`,
  descripción de cada sección (E6-18), colores por serie en claro y oscuro, un solo color y el de
  aviso solo para vencidos, nombres en el eje y números al final (E6-01), porcentaje sobre el total
  (E6-02), dos renglones y tabla abierta en el teléfono (E6-03) y la leyenda y las marcas de la
  evolución (E6-11); [`medidas.test.ts`](../frontend/src/paginas/reportes/medidas.test.ts): ancho
  del eje, lugar para el número y etiqueta corta si no entra (E6-03, E6-17);
  [`formato.test.ts`](../frontend/src/paginas/reportes/formato.test.ts): cantidades con hasta 3
  decimales y porcentajes con 1 (E6-14).
- [`descargas.test.tsx`](../frontend/src/paginas/reportes/descargas.test.tsx): ruta y parámetros
  del pedido, "Preparando el archivo…", enlace con el nombre del servidor, éxito con el período que
  se va al cambiar los filtros, botón en curso que no desaparece, aviso a los 10 s con Cancelar,
  sin datos, el médico y errores 403 y 500; [`cliente.test.ts`](../frontend/src/api/cliente.test.ts):
  `descargar` (también con el cuerpo que falla y cancelada) y `mensajeDeError` con un `Error` común
  (E6-06).
- [`periodo.test.ts`](../frontend/src/paginas/reportes/periodo.test.ts): días de Argentina, atajos,
  la validación comparada con `esquemaReporteSuministros` y el error bajo el campo cambiado.
- [`auditoria.test.tsx`](../frontend/src/paginas/auditoria/auditoria.test.tsx): columnas, acciones
  en palabras, filtros en el pedido y la URL, Origen (ESC2), búsqueda de usuario y paciente en el
  servidor (E6-09), paginación de a 50 y de a 25 en el teléfono con el foco al título (E6-10),
  vacío, error, validación y permisos;
  [`detalle.test.tsx`](../frontend/src/paginas/auditoria/detalle.test.tsx): Antes y después
  (también con teclado y en teléfono), valores en palabras (E6-07) y datos protegidos (E6-12);
  [`comparacion.test.ts`](../frontend/src/paginas/auditoria/comparacion.test.ts) y
  [`palabras.test.ts`](../frontend/src/paginas/auditoria/palabras.test.ts): la prueba que recorre
  las claves y los códigos del backend y falla si falta alguno.
- [`Tabla.test.tsx`](../frontend/src/componentes/Tabla.test.tsx): paginación con estado, primera y
  última, arriba y abajo y foco al título (E6-10).
- [`menu.test.tsx`](../frontend/src/navegacion/menu.test.tsx) e
  [`inicio.test.tsx`](../frontend/src/paginas/inicio.test.tsx): menú y tareas por rol ("Ver
  reportes" y "Ver quién cambió algo", E6-19). Los usuarios de prueba de
  [`datos.ts`](../frontend/src/pruebas/datos.ts) tienen los permisos de E6 de la semilla.
