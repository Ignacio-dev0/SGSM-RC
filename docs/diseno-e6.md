# Diseño de E6 · Reportes, estadísticas y auditoría

> Plan de implementación de la etapa E6 del plan de trabajo (T601–T608, sección 3.7), hecho antes
> de empezar. El plan dice que E6 es lo primero que se recorta si falta tiempo: el prototipo hace
> la versión completa pero chica de cada tarea. Los casos de uso CU32–CU35 y los requisitos
> RF11–RF13 son inferidos (Actividad 6 no disponible).

## Condiciones que encontramos en el código

1. `suministros` tiene índices por `(paciente_id, fecha_hora)` y por `usuario_id`, pero no por
   `fecha_hora` sola: un reporte de todo el hospital en un rango recorre la tabla. Se agrega el
   índice (migración chica).
2. Las fechas se guardan en UTC (`timestamptz`) y la interfaz muestra la hora de Argentina
   (UTC−3, sin horario de verano). Agrupar "por día" en UTC parte las noches: el agrupamiento se
   hace en la base con `AT TIME ZONE 'America/Argentina/Buenos_Aires'`.
3. Un suministro corregido (`corregidoEn`) sigue siendo un suministro: cuenta en los totales con
   lo que dice después de la corrección. La corrección se ve en la auditoría.
4. La auditoría guarda `valorAnterior` y `valorNuevo` como JSON. Hay que verificar que ninguna
   entrada guarde el patrón facial, la foto ni el hash de la contraseña antes de mostrarlas
   (revisión de T705, adelantada).
5. Ya existen las acciones de auditoría de todas las etapas (`CREAR`, `MODIFICAR`, `REGISTRAR`,
   `CORREGIR`, `GENERAR`, `VENCER`, `ATENDER`, `NO_ADMINISTRAR`, `INICIAR_SESION`…); la pantalla
   las filtra con las que haya en la base, no con una lista fija.

## Alcance

| Tarea | Objetivo                                                         | Prototipo                                                    |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| T601  | Reporte de suministros agrupado con totales                      | Sí: por paciente, insumo, usuario o día                      |
| T602  | Estadísticas del período                                         | Sí: los cinco indicadores del plan                           |
| T603  | Exportar a PDF y Excel con encabezado, parámetros, fecha y autor | Sí: reporte y estadísticas                                   |
| T604  | Consulta de auditoría con filtros                                | Sí: fecha, usuario, paciente, acción y entidad, paginada     |
| T605  | Pantalla del reporte                                             | Sí                                                           |
| T606  | Pantalla de estadísticas con barras, torta y líneas              | Sí, con la tabla de cada gráfico para quien no ve el gráfico |
| T607  | Pantalla de auditoría con valores anterior y nuevo               | Sí                                                           |
| T608  | Pruebas: totales contra la base y permisos de exportación        | Sí                                                           |

Fuera de E6: reportes programados o enviados por correo, filtros guardados, gráficos en el PDF
(el PDF lleva las tablas) y exportar la auditoría.

## Permisos

| Permiso             | Roles                 | Para qué                                    |
| ------------------- | --------------------- | ------------------------------------------- |
| `reportes.ver`      | Administrador, Médico | Ver el reporte y las estadísticas (CU32–33) |
| `reportes.exportar` | Administrador         | Descargar PDF o Excel (CU34)                |
| `auditoria.ver`     | Administrador         | Consultar la auditoría (CU35)               |

Enfermería no ve reportes (S17); un enfermero jefe los recibe como permiso adicional (CU05).

## Endpoints

| Método | Ruta                                  | Permiso             |
| ------ | ------------------------------------- | ------------------- |
| GET    | `/api/reportes/suministros`           | `reportes.ver`      |
| GET    | `/api/reportes/estadisticas`          | `reportes.ver`      |
| GET    | `/api/reportes/suministros/exportar`  | `reportes.exportar` |
| GET    | `/api/reportes/estadisticas/exportar` | `reportes.exportar` |
| GET    | `/api/auditoria`                      | `auditoria.ver`     |
| GET    | `/api/auditoria/opciones`             | `auditoria.ver`     |

Parámetros comunes de los reportes: `desde` y `hasta` (fechas `AAAA-MM-DD` en hora de Argentina,
ambas incluidas; por defecto los últimos 7 días; como mucho 366 días), `salaId` y `tipo`
(`MEDICAMENTO` o `INSUMO`) opcionales.

- **Reporte** (`agruparPor=paciente|insumo|usuario|dia`): una fila por grupo con su etiqueta,
  cantidad de suministros y unidades; por insumo, también el tipo y la unidad. `meta` trae los
  parámetros aplicados (normalizados) y el total general.
- **Estadísticas**: total de suministros (medicamentos e insumos), pacientes atendidos, los 10
  insumos más usados, consumo por tipo, evolución diaria (un punto por día del rango, también los
  días en cero) y recordatorios del período: atendidos a tiempo, atendidos tarde (después de
  vencer), no administrados con motivo, vencidos sin atender y porcentaje atendido.
- **Exportar** (`formato=pdf|xlsx` más los mismos parámetros): responde el archivo con
  `Content-Disposition: attachment; filename="reporte-suministros-AAAAMMDD.pdf"`. Encabezado:
  "Hospital El Dique · SGSM-RC", título, parámetros usados con sus nombres (sala, tipo, agrupación),
  fecha y hora de emisión en Argentina y quién lo generó. Cada exportación se audita
  (`EXPORTAR`, entidad `Reporte`, con los parámetros en `detalle`).
- **Auditoría**: filtros `desde`, `hasta`, `usuarioId`, `pacienteId`, `accion`, `entidad`;
  `pagina` y `tamano` (50 por defecto, 100 como mucho), de la más reciente a la más vieja.
  Cada entrada trae el usuario (nombre o "Sistema" si no hay), el paciente si corresponde,
  `valorAnterior`, `valorNuevo` y `detalle`. `opciones` devuelve las acciones y entidades que hay en
  la base para armar los filtros.

## Bibliotecas

- **PDF**: `pdfkit` (sin navegador ni dependencias nativas, corre en el contenedor Alpine).
- **Excel**: `exceljs` (escribe `.xlsx` con tipos de celda reales: fechas y números, no texto).
- **Gráficos**: `@mui/x-charts` (mismo sistema de diseño que la interfaz, toma los colores del
  tema claro y oscuro, accesible por teclado).

## Interfaz

- **Reportes** (`/reportes`), en el menú para quien tiene `reportes.ver`, con dos pestañas:
  **Suministros** (parámetros arriba: período con atajos "Hoy", "7 días", "30 días", sala, tipo y
  agrupación; tabla con totales; botones "Descargar PDF" y "Descargar Excel" solo con
  `reportes.exportar`) y **Estadísticas** (indicadores grandes arriba, barras con el top de
  insumos, torta del consumo por tipo, líneas de la evolución diaria y la proporción de
  recordatorios atendidos). Cada gráfico tiene título, ejes con unidades y "Ver como tabla".
  Colores del tema, nunca solo color para distinguir series (etiquetas o patrones).
- **Auditoría** (`/auditoria`), en el menú para quien tiene `auditoria.ver`: filtros en la URL como
  los otros listados, tabla (tarjetas en teléfono) con fecha y hora, usuario, acción en palabras,
  entidad y paciente; al abrir una fila, un panel con "Antes" y "Después" campo por campo, con los
  cambios resaltados (no solo por color).
- Estados de siempre: cargando, error con Reintentar, vacío con el período usado.
- La descarga muestra "Preparando el archivo…" y un error claro si falla; el nombre del archivo
  lo da el servidor.

## Orden de trabajo (TDD) y reparto

0. **Contrato (en serie):** permisos, índice de `suministros.fecha_hora`, esquemas zod de los
   parámetros, este documento y `docs/reportes.md`.
1. **Backend (agente A):** reporte por cada agrupación con datos armados a mano y totales
   verificados contra la base; estadísticas; exportación (PDF y Excel legibles: se vuelven a abrir
   en la prueba); auditoría con filtros y paginación; permisos de cada ruta (T608).
2. **Frontend (agente B, después del panel de recordatorios porque comparte menú y rutas):**
   tipos y API, pantalla de reportes con sus dos pestañas, descarga, pantalla de auditoría.
3. **Integración:** e2e del reporte (internar → prescribir → administrar → verlo en el reporte,
   T701), documentación, `npm run verificar` y `npm run e2e`.

## Supuestos y riesgos

- S17 ven reportes el administrador y el médico; exporta el administrador; la auditoría, solo el
  administrador.
- S18 los días se cuentan en hora de Argentina; el rango es de como mucho 366 días.
- S19 un suministro corregido cuenta con sus valores corregidos.
- S20 "atendido a tiempo" es un recordatorio atendido antes de vencer; "tarde", después.
- Riesgos: volumen de la auditoría (R8 de E5: `GENERAR`/`VENCER`) en la paginación, PDF de
  muchas páginas, datos sensibles en `valorAnterior`/`valorNuevo` (se revisan y se ocultan los
  campos sensibles en la respuesta).
