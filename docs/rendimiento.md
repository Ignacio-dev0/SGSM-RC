# Rendimiento con volumen realista

> E7 · T702 · RNF03: "las operaciones comunes responden en menos de 2 segundos con datos de volumen
> realista". Código: [`scripts/volumen.ts`](../backend/src/scripts/volumen.ts) (generador),
> [`scripts/medir-rendimiento.ts`](../backend/src/scripts/medir-rendimiento.ts) (medición) y sus
> piezas en [`scripts/volumen/`](../backend/src/scripts/volumen/). Decisiones D70–D76.

## Resumen

- Con un año de un hospital de rehabilitación de tamaño medio (400.000 suministros, 600.000
  entradas de auditoría, 150.000 recordatorios), **todas las operaciones comunes cumplen**: lo que
  se usa al lado de la cama responde en 14 a 25 ms de p95 (límite: 500 ms) y lo más pesado, las
  estadísticas de un año, en ~1,3 s (límite: 2 s).
- Ya antes de los cambios cumplían por p95, pero había cosas que crecían con la historia o estaban
  cerca del límite: las **opciones de la auditoría** (~0,9 s: traían 1,2 millones de filas a
  memoria), las **listas con detalles de suministro** (cada una recorría la tabla entera: ficha,
  prescripciones, historiales, registrar), la **página lejana de la auditoría** (~0,2 s) y las
  **estadísticas de 366 días** (~1,6 s; en una corrida con la PC ocupada, hasta 4 s).
- Se agregaron 4 índices (migración
  [`indices_rendimiento`](../backend/prisma/migrations/20261007194806_indices_rendimiento/migration.sql))
  y se reescribieron 4 consultas sin cambiar lo que devuelven (cada una con su prueba): las
  prescripciones del paciente y registrar una administración tardan la mitad, la página lejana de
  la auditoría un tercio y sus opciones, 7 ms en lugar de casi 1 s.

## Cómo generar el volumen

Una sola vez, la base aparte dentro del contenedor de desarrollo, con las migraciones:

```bash
docker exec sgsm-db psql -U sgsm -d postgres -c "CREATE DATABASE sgsm_volumen"
cd backend
DATABASE_URL="postgresql://sgsm:sgsm@localhost:5432/sgsm_volumen?schema=public" npx prisma migrate deploy
```

(En PowerShell: `$env:DATABASE_URL="postgresql://…/sgsm_volumen?schema=public"; npx prisma migrate deploy`.
Una migración nueva se aplica igual.) Después, cada vez que haga falta:

```bash
npm run volumen:sembrar -w backend   # vacía sgsm_volumen y la vuelve a llenar (~1 min)
```

- **Resguardo (D70).** Sin `DATABASE_URL` en el entorno usa `sgsm_volumen` del contenedor; con
  otra base cuyo nombre no termine en `_volumen` (por ejemplo `sgsm` o `sgsm_test`), se niega
  antes de conectarse. Tampoco corre con `NODE_ENV=production`.
- **Reproducible.** Semilla fija y azar en SQL por hash del número de fila: con el mismo
  `VOLUMEN_AHORA` (por ejemplo `VOLUMEN_AHORA=2026-10-07T12:00:00Z`) salen exactamente los mismos
  datos (comprobado con un `md5` de cada tabla). Sin él, el año termina en el minuto actual, para
  que haya tomas pendientes "ahora" y los últimos 30 días tengan datos.
- **Cómo carga (D76).** Las tablas chicas se arman en TypeScript; las grandes, en SQL dentro de la
  base (`generate_series` sobre la agenda de cada prescripción, tablas temporales), todo en una
  transacción. Durante la carga se apagan los disparadores de las claves foráneas
  (`SET LOCAL session_replication_role = replica`, hace falta superusuario como el `sgsm` del
  contenedor) y al final se comprueban las 34 claves con una consulta cada una: si algo quedara
  huérfano, se revierte todo. Así tarda ~1 min en lugar de ~4.

### Qué genera

| Tabla             | Filas    | Cómo                                                                                                                                                                                                                                |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| usuarios          | 60       | 4 administradores, 14 médicos, 42 enfermeros. `vol_admin`, `vol_medico` y `vol_enfermero` (ids 1 a 3) miden; todos con la contraseña `Volumen2026`, que solo existe en esta base                                                    |
| salas · camas     | 6 · 120  | 20 camas por sala (`A-01` … `F-20`)                                                                                                                                                                                                 |
| insumos           | 300      | 200 medicamentos (50 drogas × 4 presentaciones) y 100 insumos; el uso sigue una curva de Zipf (unos pocos se usan mucho)                                                                                                            |
| pacientes         | 1.500    | Cada cama tiene 12 o 13 estadías seguidas en el año (de 2 a 6 semanas); 110 siguen internados. Apellidos con su frecuencia real (unos 80 "González")                                                                                |
| prescripciones    | 12.000   | Proporcionales a la estadía; empiezan a una hora en punto, cada 6, 8, 12 o 24 h, duran de 3 a 14 días o hasta el alta. Unas 370 vigentes (3,3 por internado), el resto finalizadas o suspendidas por el egreso                      |
| suministros       | 400.000  | ~300.000 administraciones, una por cada toma dada de la agenda real (93 % de las tomas; de 20 min antes a 28 después, un 5 % tarde) y ~100.000 movimientos de 1 a 3 insumos. 448.000 detalles; 0,4 % corregidos                     |
| recordatorios     | ~150.000 | Los de las tomas y estudios de los últimos ~5 meses: atendidos a tiempo o tarde por su administración, "No se administró", ~3.700 vencidos sin atender y los pendientes de la ventana actual                                        |
| estudios          | 3.000    | Realizados (con quien los confirmó), cancelados y programados para los próximos días                                                                                                                                                |
| auditoría         | 600.000  | Una entrada por cada alta, cama, egreso, prescripción, estudio, suministro (400.000), recordatorio generado o vencido y "No se administró", con la forma de `registrarAuditoria`; se completa o recorta hasta 600.000 exactas (D76) |
| notificaciones    | ~56.500  | Un aviso de cada recordatorio vencido a cada administrador                                                                                                                                                                          |
| datos_biometricos | 1        | Solo el enfermero de medición, con el mismo patrón de las pruebas (lo registra la medición)                                                                                                                                         |

## Cómo medir

```bash
npm run volumen:sembrar -w backend
npm run volumen:medir -w backend -- --etiqueta=despues
```

La medición levanta la API con `levantarServidor` (temporizador **apagado**) en el puerto 3100
(`VOLUMEN_PUERTO`), inicia sesión con un usuario de cada rol y mide cada operación
`VOLUMEN_VUELTAS` veces (20) después de una vuelta de calentamiento que no cuenta. Imprime la tabla
y la guarda en este documento, en el bloque de la etiqueta (`ultima` si no se indica); con los
bloques `antes` y `despues`, rearma la comparación. Modifica la base de volumen (inicios de
sesión, administraciones, ciclos del temporizador): para comparar dos corridas, volver a sembrar
antes de cada una.

| Grupo              | Qué se mide                                                                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sesión             | Iniciar sesión (bcrypt de costo 10, a propósito)                                                                                                                                                                                                                       |
| Al lado de la cama | Buscar paciente por apellido (el más repetido, sin tildes y de todos los estados), por comienzo del DNI y por cama; internados de una sala; ficha; prescripciones con la próxima toma; prescripción con la agenda de 24 h; panel de recordatorios, también de una sala |
| Registrar          | Validar el rostro (`POST /api/biometria/validar`) y registrar una administración con ese comprobante, cada vuelta sobre otra prescripción vigente: el mismo mecanismo que las pruebas (`comprobanteDe`); el rostro lo registra la medición                             |
| Consultas          | Historial del paciente (pestaña de la ficha); historial de suministros sin filtros, de un paciente, de un responsable en 30 días y de insumos en la página 50; responsables                                                                                            |
| Reportes           | Reporte de suministros de 30 y de 366 días por cada agrupación; estadísticas de 30 y 366 días                                                                                                                                                                          |
| Exportar           | Reporte y estadísticas de 30 días en PDF y en Excel                                                                                                                                                                                                                    |
| Auditoría          | Primera página, la última página (6.000 de 100), acción y entidad, de un paciente, de un usuario en 30 días y las opciones de los filtros                                                                                                                              |
| Temporizador       | Un ciclo (`ejecutarCiclo`) con los 110 internados, adelantando el reloj un minuto por vuelta como el temporizador real                                                                                                                                                 |

Los datos de cada operación salen del volumen: el internado con más suministros (la ficha más
pesada), el apellido más repetido, el responsable con más registros. **Criterio:** p50, p95 y
máximo por rango más cercano (con 20 vueltas, el p95 es la 19.ª más rápida); cumple si el p95 está
debajo del límite: **500 ms** para búsqueda, ficha, prescripciones y panel (lo que se usa al lado
de la cama) y **2 s** para el resto. La API y el cliente corren en el mismo proceso: no se mide la
red, el proxy ni el navegador.

**Para ver los planes de las consultas de Prisma**, se puede encender `auto_explain` solo en la base
de volumen y leer el registro del contenedor (y apagarlo antes de medir: la instrumentación agrega
tiempo):

```bash
docker exec sgsm-db psql -U sgsm -d postgres \
  -c "ALTER DATABASE sgsm_volumen SET session_preload_libraries = 'auto_explain'" \
  -c "ALTER DATABASE sgsm_volumen SET auto_explain.log_min_duration = '20ms'" \
  -c "ALTER DATABASE sgsm_volumen SET auto_explain.log_analyze = on"
docker logs sgsm-db --since 5m
docker exec sgsm-db psql -U sgsm -d postgres -c "ALTER DATABASE sgsm_volumen RESET ALL"
```

## Resultados

### Antes y después de los cambios (p95)

Generada por la medición a partir de los bloques completos de más abajo. Las dos corridas son
sobre un volumen recién sembrado, una detrás de otra: "antes" con el código y los índices
anteriores (restituidos solo para medir), "después" con los de esta tarea. Lo que dura menos de
~150 ms varía un ±30 % entre corridas en esta PC (las búsquedas, la ficha o el reporte de 30 días
por insumo, que en la consulta sola bajó de 138 a 62 ms), así que lo que cuenta son los cambios
grandes (ver [límites](#límites-conocidos)).

<!-- medicion:comparacion -->

| Operación                                                       | Límite (ms) | p95 antes (ms) | p95 después (ms) | Cambio |
| --------------------------------------------------------------- | ----------: | -------------: | ---------------: | -----: |
| Sesión · Iniciar sesión (enfermero)                             |        2000 |             74 |               87 |  +18 % |
| Al lado de la cama · Buscar paciente por apellido (todos)       |         500 |             16 |               18 |  +13 % |
| Al lado de la cama · Buscar paciente por DNI                    |         500 |             13 |               17 |  +31 % |
| Al lado de la cama · Buscar paciente por cama                   |         500 |             15 |               16 |   +7 % |
| Al lado de la cama · Internados de una sala (tablet)            |         500 |             13 |               16 |  +23 % |
| Al lado de la cama · Ficha del paciente                         |         500 |            8,5 |               15 |  +76 % |
| Al lado de la cama · Prescripciones del paciente (próxima toma) |         500 |             46 |               20 |  −57 % |
| Al lado de la cama · Prescripción con agenda de 24 h            |         500 |             42 |               14 |  −67 % |
| Al lado de la cama · Panel de recordatorios                     |         500 |             22 |               25 |  +14 % |
| Al lado de la cama · Panel de recordatorios de una sala         |         500 |             16 |               17 |   +6 % |
| Registrar · Validar el rostro                                   |        2000 |             15 |               14 |   −7 % |
| Registrar · Registrar una administración                        |        2000 |             51 |               27 |  −47 % |
| Consultas · Historial del paciente (pestaña de la ficha)        |        2000 |             91 |               80 |  −12 % |
| Consultas · Historial de suministros, sin filtros               |        2000 |             52 |               37 |  −29 % |
| Consultas · Historial de suministros de un paciente             |        2000 |             40 |               17 |  −57 % |
| Consultas · Historial de suministros de un responsable, 30 días |        2000 |             39 |               20 |  −49 % |
| Consultas · Historial de insumos, página 50                     |        2000 |            179 |              136 |  −24 % |
| Consultas · Responsables (filtro del historial)                 |        2000 |            7,3 |              9,1 |  +25 % |
| Reportes · Reporte de suministros, 30 días, por paciente        |        2000 |             93 |               93 |    0 % |
| Reportes · Reporte de suministros, 30 días, por insumo          |        2000 |            140 |              224 |  +60 % |
| Reportes · Reporte de suministros, 30 días, por usuario         |        2000 |             96 |               93 |   −3 % |
| Reportes · Reporte de suministros, 30 días, por dia             |        2000 |             79 |              114 |  +44 % |
| Reportes · Reporte de suministros, 366 días, por paciente       |        2000 |            625 |              585 |   −6 % |
| Reportes · Reporte de suministros, 366 días, por insumo         |        2000 |           1141 |             1173 |   +3 % |
| Reportes · Reporte de suministros, 366 días, por usuario        |        2000 |            762 |              496 |  −35 % |
| Reportes · Reporte de suministros, 366 días, por dia            |        2000 |            972 |              751 |  −23 % |
| Reportes · Estadísticas, 30 días                                |        2000 |            155 |              139 |  −10 % |
| Reportes · Estadísticas, 366 días                               |        2000 |           1584 |             1311 |  −17 % |
| Exportar · Reporte en PDF, 30 días                              |        2000 |            201 |              105 |  −48 % |
| Exportar · Reporte en Excel, 30 días                            |        2000 |            118 |               84 |  −29 % |
| Exportar · Estadísticas en PDF, 30 días                         |        2000 |            198 |              121 |  −39 % |
| Exportar · Estadísticas en Excel, 30 días                       |        2000 |            152 |              118 |  −22 % |
| Auditoría · Primera página, sin filtros                         |        2000 |             44 |               42 |   −5 % |
| Auditoría · Página lejana (6000 de 100)                         |        2000 |            210 |               76 |  −64 % |
| Auditoría · Acción y entidad (REGISTRAR · Suministro)           |        2000 |             78 |               81 |   +4 % |
| Auditoría · De un paciente                                      |        2000 |             14 |               17 |  +21 % |
| Auditoría · De un usuario, 30 días                              |        2000 |             22 |               20 |   −9 % |
| Auditoría · Opciones de los filtros                             |        2000 |            943 |              7,3 |  −99 % |
| Temporizador · Ciclo de recordatorios (110 internados)          |        2000 |             58 |               49 |  −16 % |

<!-- /medicion:comparacion -->

En la [revisión de octubre](#revisión-de-octubre-d101-d114-d121) la página lejana de la auditoría
dio 95 ms (p50) y 109 ms (p95) en una corrida con la PC más cargada (todo salió de un 20 a un 50 %
más lento, también lo que no cambió); las etiquetas que suma D114 cuestan unos 3 ms (p95) medidas
solas.

### Qué se cambió y por qué

Los planes se leyeron con `EXPLAIN (ANALYZE, BUFFERS)` y con `auto_explain` sobre las consultas que
arma Prisma.

1. **Índices de las claves foráneas que se recorren en cada lista (D71).** `detalles_suministro`
   no tenía índice por `suministro_id` ni `suministros` por `prescripcion_id`: cada
   `include: { detalles }` y cada "últimas 3 administraciones" de una prescripción era un
   `Parallel Seq Scan` de 448.000 o 400.000 filas (unos 25 ms cada uno, y crece con la historia,
   no con los internados). Con `detalles_suministro(suministro_id)` y
   `suministros(prescripcion_id, fecha_hora)` son búsquedas en el índice: las prescripciones del
   paciente bajaron de ~46 a ~20 ms, la prescripción con su agenda de ~42 a ~14, registrar una
   administración de ~51 a ~27 y los historiales de un paciente o un responsable, a la mitad. El
   ciclo del temporizador también los usa (tomas ya dadas).
2. **Auditoría paginada en dos pasos (D72).** La página lejana (`OFFSET 599.900`) leía 600.000
   filas completas por `auditoria(fecha_hora)` y las volvía a ordenar por id (`Incremental Sort`,
   ~240 ms). Ahora el índice es `auditoria(fecha_hora, id)` (el orden exacto de la consulta) y la
   consulta pide primero solo los ids de la página (`Index Only Scan Backward`, `Heap Fetches: 0`)
   y después esas 100 filas: de ~210 a ~76 ms, sin cambiar el contrato (`pagina`, `tamano`).
   Las etiquetas de los registros (D114) suman unos 3 ms (p95).
   Después, el filtro de origen (personas o sistema) sumó `usuario_id` al final de ese índice para
   seguir sin leer la tabla con el filtro puesto (D101, en [reportes.md](reportes.md)).
3. **Opciones de los filtros de auditoría (D73).** `findMany({ distinct })` de Prisma no hace
   `DISTINCT` en la base: trae `id` y `accion` de las 600.000 filas (y otra vez con `entidad`) y
   descarta en memoria (~1 s, y crece con la tabla). Ahora una consulta recursiva salta de un valor
   al siguiente por el índice (`auditoria(accion, fecha_hora, id)`, nuevo, y el que ya había de
   `entidad`): unas 20 búsquedas en el índice, menos de 10 ms. El nuevo índice sirve además para
   filtrar por una acción poco frecuente en el orden de la consulta. **Cuidado que apareció al
   medir:** Prisma usa sentencias preparadas y, desde la sexta vez, PostgreSQL puede pasar a un
   plan genérico que no conoce el valor del filtro; con el índice nuevo, ese plan contaba las
   400.000 `REGISTRAR` por el índice (de ~70 a ~150 ms). La consulta de auditoría pide planes con
   los valores de cada pedido (`SET LOCAL plan_cache_mode = force_custom_plan` en su
   transacción): `REGISTRAR` vuelve a recorrer la tabla (~70 ms) y una acción rara usa el índice
   (2 ms).
4. **Reportes y estadísticas de 366 días (D74, D75).** Su costo es unir y contar 450.000 líneas:
   `COUNT(DISTINCT suministro_id)` ordena todo (`Sort Method: external merge`, 15 MB en disco). Dos
   cambios que no alteran los números: agrupar por id y recién después unir nombre, apellido o
   presentación (la clave del ordenamiento queda angosta), y en las estadísticas contar cada
   suministro una vez por día con sus tipos (`bool_or`), y sacar de ahí los totales y el
   consumo por tipo en lugar de recorrer el año dos veces más (pacientes, con un `DISTINCT` de
   pocos grupos). Las consultas solas, con un año (`psql`, tres corridas): por paciente de ~880
   a ~545 ms, por insumo de ~1.045 a ~660 ms. En el endpoint la mejora es menor (del −6 al −35 %)
   porque el total del período corre en paralelo, no cambió y pesa lo mismo; las estadísticas de un
   año, que ahora recorren el año tres veces en lugar de cuatro (y la más cara, por día, sin un
   ordenamiento por tipo), pasaron de ~1,6 a ~1,3 s.

Lo que no se tocó: subir `work_mem` para los reportes solo mejoró un 13 %; contar el total en dos
etapas (por suministro y después en total) era más lento. Lo que queda cerca de 1 s es el costo
real de recorrer un año entero. Además, el generador termina con `CHECKPOINT`: en la primera
medición no lo hacía y PostgreSQL escribía en disco lo recién cargado mientras se medía (los
reportes de un año daban 0,8 a 1,6 s en lugar de 0,6 a 1,1 s).

### Mediciones completas

#### Antes de los cambios

<!-- medicion:antes -->

Medido el 2026-10-07T20:23:25.459Z sobre `sgsm_volumen` (último suministro del volumen: 2026-10-07T20:21:00.000Z).
20 vueltas por operación más una de calentamiento; API y cliente en el mismo proceso (Node v24.16.0, AMD Ryzen 5 5600GT with Radeon Graphics × 12), PostgreSQL 17.11 en Docker.
Volumen: 400.000 suministros, 600.000 entradas de auditoría, 150.001 recordatorios (40 pendientes al empezar).

| Grupo              | Operación                                           | Límite (ms) | p50 (ms) | p95 (ms) | Máx. (ms) | p95 ≤ límite |
| ------------------ | --------------------------------------------------- | ----------: | -------: | -------: | --------: | ------------ |
| Sesión             | Iniciar sesión (enfermero)                          |        2000 |       70 |       74 |        76 | Cumple       |
| Al lado de la cama | Buscar paciente por apellido (todos)                |         500 |       14 |       16 |        18 | Cumple       |
| Al lado de la cama | Buscar paciente por DNI                             |         500 |       12 |       13 |        13 | Cumple       |
| Al lado de la cama | Buscar paciente por cama                            |         500 |       13 |       15 |        16 | Cumple       |
| Al lado de la cama | Internados de una sala (tablet)                     |         500 |       12 |       13 |        13 | Cumple       |
| Al lado de la cama | Ficha del paciente                                  |         500 |      7,9 |      8,5 |       8,8 | Cumple       |
| Al lado de la cama | Prescripciones del paciente (próxima toma)          |         500 |       45 |       46 |        51 | Cumple       |
| Al lado de la cama | Prescripción con agenda de 24 h                     |         500 |       38 |       42 |        46 | Cumple       |
| Al lado de la cama | Panel de recordatorios                              |         500 |       20 |       22 |        22 | Cumple       |
| Al lado de la cama | Panel de recordatorios de una sala                  |         500 |       15 |       16 |        17 | Cumple       |
| Registrar          | Validar el rostro                                   |        2000 |       11 |       15 |        16 | Cumple       |
| Registrar          | Registrar una administración                        |        2000 |       38 |       51 |        53 | Cumple       |
| Consultas          | Historial del paciente (pestaña de la ficha)        |        2000 |       74 |       91 |        94 | Cumple       |
| Consultas          | Historial de suministros, sin filtros               |        2000 |       50 |       52 |        53 | Cumple       |
| Consultas          | Historial de suministros de un paciente             |        2000 |       34 |       40 |        44 | Cumple       |
| Consultas          | Historial de suministros de un responsable, 30 días |        2000 |       36 |       39 |        41 | Cumple       |
| Consultas          | Historial de insumos, página 50                     |        2000 |      173 |      179 |       187 | Cumple       |
| Consultas          | Responsables (filtro del historial)                 |        2000 |      6,7 |      7,3 |       7,4 | Cumple       |
| Reportes           | Reporte de suministros, 30 días, por paciente       |        2000 |       72 |       93 |        94 | Cumple       |
| Reportes           | Reporte de suministros, 30 días, por insumo         |        2000 |      100 |      140 |       141 | Cumple       |
| Reportes           | Reporte de suministros, 30 días, por usuario        |        2000 |       79 |       96 |        96 | Cumple       |
| Reportes           | Reporte de suministros, 30 días, por dia            |        2000 |       66 |       79 |        81 | Cumple       |
| Reportes           | Reporte de suministros, 366 días, por paciente      |        2000 |      600 |      625 |       631 | Cumple       |
| Reportes           | Reporte de suministros, 366 días, por insumo        |        2000 |     1070 |     1141 |      1220 | Cumple       |
| Reportes           | Reporte de suministros, 366 días, por usuario       |        2000 |      694 |      762 |       783 | Cumple       |
| Reportes           | Reporte de suministros, 366 días, por dia           |        2000 |      706 |      972 |       985 | Cumple       |
| Reportes           | Estadísticas, 30 días                               |        2000 |      136 |      155 |       157 | Cumple       |
| Reportes           | Estadísticas, 366 días                              |        2000 |     1193 |     1584 |      1763 | Cumple       |
| Exportar           | Reporte en PDF, 30 días                             |        2000 |      132 |      201 |       378 | Cumple       |
| Exportar           | Reporte en Excel, 30 días                           |        2000 |      109 |      118 |       129 | Cumple       |
| Exportar           | Estadísticas en PDF, 30 días                        |        2000 |      142 |      198 |       203 | Cumple       |
| Exportar           | Estadísticas en Excel, 30 días                      |        2000 |      138 |      152 |       181 | Cumple       |
| Auditoría          | Primera página, sin filtros                         |        2000 |       40 |       44 |        44 | Cumple       |
| Auditoría          | Página lejana (6000 de 100)                         |        2000 |      186 |      210 |       223 | Cumple       |
| Auditoría          | Acción y entidad (REGISTRAR · Suministro)           |        2000 |       70 |       78 |        83 | Cumple       |
| Auditoría          | De un paciente                                      |        2000 |       13 |       14 |        14 | Cumple       |
| Auditoría          | De un usuario, 30 días                              |        2000 |       21 |       22 |        22 | Cumple       |
| Auditoría          | Opciones de los filtros                             |        2000 |      877 |      943 |       970 | Cumple       |
| Temporizador       | Ciclo de recordatorios (110 internados)             |        2000 |       45 |       58 |       255 | Cumple       |

<!-- /medicion:antes -->

#### Después de los cambios

<!-- medicion:despues -->

Medido el 2026-10-07T20:27:11.331Z sobre `sgsm_volumen` (último suministro del volumen: 2026-10-07T20:25:00.000Z).
20 vueltas por operación más una de calentamiento; API y cliente en el mismo proceso (Node v24.16.0, AMD Ryzen 5 5600GT with Radeon Graphics × 12), PostgreSQL 17.11 en Docker.
Volumen: 400.000 suministros, 600.000 entradas de auditoría, 150.002 recordatorios (43 pendientes al empezar).

| Grupo              | Operación                                           | Límite (ms) | p50 (ms) | p95 (ms) | Máx. (ms) | p95 ≤ límite |
| ------------------ | --------------------------------------------------- | ----------: | -------: | -------: | --------: | ------------ |
| Sesión             | Iniciar sesión (enfermero)                          |        2000 |       83 |       87 |        90 | Cumple       |
| Al lado de la cama | Buscar paciente por apellido (todos)                |         500 |       16 |       18 |        19 | Cumple       |
| Al lado de la cama | Buscar paciente por DNI                             |         500 |       14 |       17 |        17 | Cumple       |
| Al lado de la cama | Buscar paciente por cama                            |         500 |       14 |       16 |        19 | Cumple       |
| Al lado de la cama | Internados de una sala (tablet)                     |         500 |       14 |       16 |        19 | Cumple       |
| Al lado de la cama | Ficha del paciente                                  |         500 |       10 |       15 |        18 | Cumple       |
| Al lado de la cama | Prescripciones del paciente (próxima toma)          |         500 |       19 |       20 |        22 | Cumple       |
| Al lado de la cama | Prescripción con agenda de 24 h                     |         500 |       12 |       14 |        17 | Cumple       |
| Al lado de la cama | Panel de recordatorios                              |         500 |       22 |       25 |        27 | Cumple       |
| Al lado de la cama | Panel de recordatorios de una sala                  |         500 |       16 |       17 |        18 | Cumple       |
| Registrar          | Validar el rostro                                   |        2000 |       12 |       14 |        14 | Cumple       |
| Registrar          | Registrar una administración                        |        2000 |       23 |       27 |        27 | Cumple       |
| Consultas          | Historial del paciente (pestaña de la ficha)        |        2000 |       65 |       80 |        82 | Cumple       |
| Consultas          | Historial de suministros, sin filtros               |        2000 |       34 |       37 |        37 | Cumple       |
| Consultas          | Historial de suministros de un paciente             |        2000 |       15 |       17 |        17 | Cumple       |
| Consultas          | Historial de suministros de un responsable, 30 días |        2000 |       19 |       20 |        23 | Cumple       |
| Consultas          | Historial de insumos, página 50                     |        2000 |      123 |      136 |       148 | Cumple       |
| Consultas          | Responsables (filtro del historial)                 |        2000 |      7,9 |      9,1 |       9,5 | Cumple       |
| Reportes           | Reporte de suministros, 30 días, por paciente       |        2000 |       76 |       93 |       120 | Cumple       |
| Reportes           | Reporte de suministros, 30 días, por insumo         |        2000 |      102 |      224 |       492 | Cumple       |
| Reportes           | Reporte de suministros, 30 días, por usuario        |        2000 |       72 |       93 |        94 | Cumple       |
| Reportes           | Reporte de suministros, 30 días, por dia            |        2000 |       92 |      114 |       127 | Cumple       |
| Reportes           | Reporte de suministros, 366 días, por paciente      |        2000 |      539 |      585 |       828 | Cumple       |
| Reportes           | Reporte de suministros, 366 días, por insumo        |        2000 |      772 |     1173 |      1257 | Cumple       |
| Reportes           | Reporte de suministros, 366 días, por usuario       |        2000 |      448 |      496 |       504 | Cumple       |
| Reportes           | Reporte de suministros, 366 días, por dia           |        2000 |      699 |      751 |       772 | Cumple       |
| Reportes           | Estadísticas, 30 días                               |        2000 |      109 |      139 |       140 | Cumple       |
| Reportes           | Estadísticas, 366 días                              |        2000 |     1065 |     1311 |      1368 | Cumple       |
| Exportar           | Reporte en PDF, 30 días                             |        2000 |       89 |      105 |       107 | Cumple       |
| Exportar           | Reporte en Excel, 30 días                           |        2000 |       74 |       84 |       100 | Cumple       |
| Exportar           | Estadísticas en PDF, 30 días                        |        2000 |      111 |      121 |       133 | Cumple       |
| Exportar           | Estadísticas en Excel, 30 días                      |        2000 |      111 |      118 |       123 | Cumple       |
| Auditoría          | Primera página, sin filtros                         |        2000 |       39 |       42 |        44 | Cumple       |
| Auditoría          | Página lejana (6000 de 100)                         |        2000 |       73 |       76 |        79 | Cumple       |
| Auditoría          | Acción y entidad (REGISTRAR · Suministro)           |        2000 |       75 |       81 |        82 | Cumple       |
| Auditoría          | De un paciente                                      |        2000 |       15 |       17 |        20 | Cumple       |
| Auditoría          | De un usuario, 30 días                              |        2000 |       19 |       20 |        20 | Cumple       |
| Auditoría          | Opciones de los filtros                             |        2000 |      6,5 |      7,3 |       8,1 | Cumple       |
| Temporizador       | Ciclo de recordatorios (110 internados)             |        2000 |       44 |       49 |       258 | Cumple       |

<!-- /medicion:despues -->

#### Revisión de octubre (D101, D114, D121)

Con el filtro de origen de la auditoría (D101), las etiquetas de los registros (D114 de
[reportes.md](reportes.md)) y la toma guardada de cada administración con su índice (D121 de
[suministros.md](suministros.md#decisiones)), sobre un volumen recién sembrado y migrado. Esta
corrida se hizo con la PC más cargada que la de arriba (sincronización de OneDrive y otros
procesos): lo que no cambió también salió más lento (historial de insumos, página 50: 136 → 211 ms;
estadísticas de un año: 1.311 → 1.543 ms), así que las diferencias de un 20 a 50 % no son del código.
Lo que sí es del código: la página lejana de la auditoría suma las etiquetas, que medidas solas
cuestan 1,3 ms (p50) y 3,1 ms (p95); registrar una administración suma una consulta por la dosis
reciente (D123), y el ciclo del temporizador bajó (busca las tomas dadas por la toma guardada, solo
en la ventana). Todo sigue muy por debajo de los límites.

<!-- medicion:revision -->

Medido el 2026-10-08T02:15:32.208Z sobre `sgsm_volumen` (último suministro del volumen: 2026-10-08T02:13:00.000Z).
20 vueltas por operación más una de calentamiento; API y cliente en el mismo proceso (Node v24.16.0, AMD Ryzen 5 5600GT with Radeon Graphics × 12), PostgreSQL 17.11 en Docker.
Volumen: 400.000 suministros, 600.000 entradas de auditoría, 150.039 recordatorios (38 pendientes al empezar).

| Grupo              | Operación                                           | Límite (ms) | p50 (ms) | p95 (ms) | Máx. (ms) | p95 ≤ límite |
| ------------------ | --------------------------------------------------- | ----------: | -------: | -------: | --------: | ------------ |
| Sesión             | Iniciar sesión (enfermero)                          |        2000 |       83 |       86 |        86 | Cumple       |
| Al lado de la cama | Buscar paciente por apellido (todos)                |         500 |       19 |       21 |        23 | Cumple       |
| Al lado de la cama | Buscar paciente por DNI                             |         500 |       16 |       18 |        20 | Cumple       |
| Al lado de la cama | Buscar paciente por cama                            |         500 |       17 |       19 |        19 | Cumple       |
| Al lado de la cama | Internados de una sala (tablet)                     |         500 |       17 |       20 |        20 | Cumple       |
| Al lado de la cama | Ficha del paciente                                  |         500 |       12 |       13 |        14 | Cumple       |
| Al lado de la cama | Prescripciones del paciente (próxima toma)          |         500 |       20 |       22 |        25 | Cumple       |
| Al lado de la cama | Prescripción con agenda de 24 h                     |         500 |       13 |       14 |        14 | Cumple       |
| Al lado de la cama | Panel de recordatorios                              |         500 |       25 |       29 |        29 | Cumple       |
| Al lado de la cama | Panel de recordatorios de una sala                  |         500 |       22 |       26 |        26 | Cumple       |
| Registrar          | Validar el rostro                                   |        2000 |       17 |       21 |        21 | Cumple       |
| Registrar          | Registrar una administración                        |        2000 |       40 |       51 |        51 | Cumple       |
| Consultas          | Historial del paciente (pestaña de la ficha)        |        2000 |       88 |      127 |       127 | Cumple       |
| Consultas          | Historial de suministros, sin filtros               |        2000 |       41 |       48 |        48 | Cumple       |
| Consultas          | Historial de suministros de un paciente             |        2000 |       18 |       20 |        27 | Cumple       |
| Consultas          | Historial de suministros de un responsable, 30 días |        2000 |       21 |       24 |        24 | Cumple       |
| Consultas          | Historial de insumos, página 50                     |        2000 |      187 |      211 |       227 | Cumple       |
| Consultas          | Responsables (filtro del historial)                 |        2000 |      8,8 |      9,4 |       9,8 | Cumple       |
| Reportes           | Reporte de suministros, 30 días, por paciente       |        2000 |       94 |      111 |       115 | Cumple       |
| Reportes           | Reporte de suministros, 30 días, por insumo         |        2000 |      115 |      128 |       141 | Cumple       |
| Reportes           | Reporte de suministros, 30 días, por usuario        |        2000 |       90 |      117 |       122 | Cumple       |
| Reportes           | Reporte de suministros, 30 días, por dia            |        2000 |      119 |      156 |       178 | Cumple       |
| Reportes           | Reporte de suministros, 366 días, por paciente      |        2000 |      627 |      672 |       689 | Cumple       |
| Reportes           | Reporte de suministros, 366 días, por insumo        |        2000 |      968 |     1045 |      1071 | Cumple       |
| Reportes           | Reporte de suministros, 366 días, por usuario       |        2000 |      652 |      682 |       693 | Cumple       |
| Reportes           | Reporte de suministros, 366 días, por dia           |        2000 |      888 |      933 |       936 | Cumple       |
| Reportes           | Estadísticas, 30 días                               |        2000 |      141 |      183 |       194 | Cumple       |
| Reportes           | Estadísticas, 366 días                              |        2000 |     1431 |     1543 |      1610 | Cumple       |
| Exportar           | Reporte en PDF, 30 días                             |        2000 |      111 |      126 |       129 | Cumple       |
| Exportar           | Reporte en Excel, 30 días                           |        2000 |       95 |      106 |       112 | Cumple       |
| Exportar           | Estadísticas en PDF, 30 días                        |        2000 |      146 |      179 |       188 | Cumple       |
| Exportar           | Estadísticas en Excel, 30 días                      |        2000 |      147 |      166 |       168 | Cumple       |
| Auditoría          | Primera página, sin filtros                         |        2000 |       45 |       55 |        63 | Cumple       |
| Auditoría          | Página lejana (6000 de 100)                         |        2000 |       95 |      109 |       116 | Cumple       |
| Auditoría          | Acción y entidad (REGISTRAR · Suministro)           |        2000 |      100 |      123 |       132 | Cumple       |
| Auditoría          | De un paciente                                      |        2000 |       18 |       22 |        25 | Cumple       |
| Auditoría          | De un usuario, 30 días                              |        2000 |       18 |       20 |        21 | Cumple       |
| Auditoría          | Opciones de los filtros                             |        2000 |      8,0 |      8,9 |       9,5 | Cumple       |
| Temporizador       | Ciclo de recordatorios (110 internados)             |        2000 |       24 |       28 |       287 | Cumple       |

<!-- /medicion:revision -->

## Límites conocidos

- **Una sola instancia.** El bus de tiempo real es memoria del proceso (riesgo R2 de
  [diseno-e5.md](diseno-e5.md)) y el temporizador corre en el mismo proceso (con candado de
  PostgreSQL, así que dos procesos no duplicarían el ciclo, pero los avisos de uno no llegarían a
  las tablets conectadas al otro). Escalar a varias instancias pide un bus compartido
  (`LISTEN/NOTIFY` de PostgreSQL, por ejemplo). Con el volumen de un hospital de este tamaño no
  hace falta: el ciclo tarda ~50 ms por minuto y lo que se usa al lado de la cama, decenas de
  milisegundos.
- **Un usuario por vez.** Se midió cada operación sola, sin concurrencia. Lo más pesado (un año de
  reportes o estadísticas, ~0,5 a 1,3 s) usa varios procesos de PostgreSQL: varios administradores
  pidiéndolo a la vez se suman. Si un hospital más grande lo necesitara, el paso siguiente es un
  resumen diario precalculado (por día, insumo, paciente y usuario), no más índices.
- **Lo que crece con la historia.** Los reportes tienen un período máximo (366 días), pero el total
  de la auditoría y del historial de suministros sin filtros se cuenta recorriendo un índice, y la
  página lejana de la auditoría salta por el índice: los dos crecen con los años (a 600.000
  entradas, ~40 y ~75 ms). Con varios años seguiría lejos de 2 s; si no, la salida es paginar por
  cursor (cambia el contrato y la pantalla de auditoría).
- **El entorno.** PostgreSQL 17 con la configuración por defecto de la imagen (`shared_buffers`
  de 128 MB, `work_mem` de 4 MB) en Docker Desktop sobre Windows, en una PC compartida con otros
  procesos (OneDrive sincronizando la carpeta del repositorio, otros agentes con sus pruebas): los
  tiempos varían un ±30 % entre corridas, y en una corrida con la PC ocupada las estadísticas de un
  año llegaron a 4,3 s de p95 (repetida en calma, 1,3 s). Una consulta que lee la tabla entera (como
  el total de "acción y entidad", 400.000 coincidencias) depende además de qué quedó en la caché.
  Un servidor de producción debería dimensionar esa memoria. La API y el cliente corren en el mismo
  proceso: no están la red, nginx ni el navegador.
- **El volumen.** Es inventado con reglas (no hay datos reales del hospital): un año entero de
  agenda, adherencia y demoras plausibles. Los pendientes son los de la agenda (D76), los
  recordatorios cubren los últimos ~5 meses y la auditoría no tiene el `ATENDER` de cada
  recordatorio.

## Decisiones

Continúan las de [reportes.md](reportes.md) (D40–D49, D63–D68) y [seguridad.md](seguridad.md)
(D50–D62).

| #   | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                             | Por qué                                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D70 | El volumen va en una base aparte, `sgsm_volumen`, en el mismo contenedor. Los scripts usan esa base si no se indica otra y se niegan con cualquier base cuyo nombre no termine en `_volumen`, o en producción.                                                                                                                                                                                                                                       | Vaciar y llenar `sgsm` (desarrollo) o `sgsm_test` (la suite la vacía antes de correr) sería perder datos o pruebas; el nombre es el mismo resguardo que usan las pruebas con `_test`.                                                                                                                                                                              |
| D71 | Índices `detalles_suministro(suministro_id)` y `suministros(prescripcion_id, fecha_hora)`.                                                                                                                                                                                                                                                                                                                                                           | Prisma busca los detalles y las últimas administraciones con `IN (…)` por esas columnas; sin índice, cada ficha, historial o registro recorría la tabla entera, y eso crece con los años aunque el hospital no crezca.                                                                                                                                             |
| D72 | La auditoría se pagina en dos pasos: los ids de la página por el índice `auditoria(fecha_hora, id)` (reemplaza al de `fecha_hora` sola) y después las filas de esos ids. Se conserva la paginación por número de página.                                                                                                                                                                                                                             | Una página lejana se resuelve leyendo solo el índice, ~3 veces más rápido. Paginar por cursor sería más rápido todavía, pero cambia el contrato y la pantalla, y con un año no hace falta.                                                                                                                                                                         |
| D73 | Las opciones de los filtros de auditoría salen de una consulta recursiva que salta de un valor al siguiente por el índice (`auditoria(accion, fecha_hora, id)`, nuevo, y `auditoria(entidad, entidad_id)`); el orden alfabético en español sigue en el código.                                                                                                                                                                                       | `distinct` de Prisma traía toda la tabla a memoria (~1 s con un año, y crecía); saltar por el índice cuesta una búsqueda por valor distinto (unos 20).                                                                                                                                                                                                             |
| D74 | Las estadísticas cuentan cada suministro una vez por día con los tipos de sus insumos (`bool_or`); los totales y el consumo por tipo se suman de ahí, y los pacientes salen de un `DISTINCT`.                                                                                                                                                                                                                                                        | Un suministro es de un solo día: la suma por día es el total, sin recorrer el año dos veces más ni ordenar 450.000 líneas por cada `COUNT(DISTINCT)`. Probado contra la definición calculada fila por fila.                                                                                                                                                        |
| D75 | Los reportes agrupan por id (paciente, usuario, insumo con su unidad) y después unen los nombres.                                                                                                                                                                                                                                                                                                                                                    | Los nombres dependen del id, así que los grupos son los mismos; el ordenamiento que exige `COUNT(DISTINCT)` queda con una clave angosta y tarda la mitad.                                                                                                                                                                                                          |
| D76 | El volumen sigue la agenda real de cada prescripción: los suministros de medicamentos son tomas dadas y los recordatorios, tomas recordadas. Por eso hay unos 35 a 45 pendientes (las tomas de la ventana de una hora de 110 internados con ~370 prescripciones vigentes), no 200. La auditoría tiene 600.000 entradas sin el `ATENDER` de cada recordatorio. La carga apaga los disparadores de las claves foráneas y las comprueba todas al final. | Datos coherentes (cada recordatorio con su suministro, cada vencido con su aviso) prueban también la lógica del ciclo y del panel. 200 pendientes pedirían 5 veces más prescripciones vigentes, que no cierran con 400.000 suministros por año; con `ATENDER` la auditoría pasaría de 750.000. Comprobar cada clave fila por fila era el 90 % del tiempo de carga. |

## Pruebas

- [`medicion.test.ts`](../backend/src/scripts/volumen/medicion.test.ts): percentiles, tabla, bloques
  de este documento, la comparación antes y después, y el resguardo de la base (`*_volumen`).
- [`auditoria/volumen.test.ts`](../backend/src/modulos/auditoria/volumen.test.ts) (D72, D73): cada
  página en dos pasos es el tramo que le toca del orden completo, también con varias entradas a la
  misma hora y con filtro; las opciones salen una vez cada una y en orden alfabético español (Nube,
  Ñandú, Oso: la intercalación de la base pondría Ñandú primero); sin auditoría, listas vacías.
- [`reportes/volumen.test.ts`](../backend/src/modulos/reportes/volumen.test.ts) (D74, D75): el
  reporte por cada agrupación, su total y las estadísticas coinciden con la definición del contrato
  calculada fila por fila, sin filtros, por tipo y por sala, con un suministro de medicamento e
  insumo juntos y otro con el mismo insumo en dos líneas.
- [`esquema.test.ts`](../backend/tests/integracion/esquema.test.ts): los índices de D71 a D73 (el
  de D72 ya con `usuario_id`, D101).
- Las pruebas que ya había de auditoría, reportes, estadísticas y exportación siguen pasando sin
  cambios.

## Frontend: carga inicial

> E7 · T702 · RNF03: "las operaciones comunes en menos de 2 s en tablets de gama media por el
> Wi‑Fi del hospital". Código: [`RutasApp.tsx`](../frontend/src/RutasApp.tsx) (qué se difiere),
> [`componentes/cargaDiferida.ts`](../frontend/src/componentes/cargaDiferida.ts),
> [`componentes/LimiteDeCarga.tsx`](../frontend/src/componentes/LimiteDeCarga.tsx),
> [`navegacion/precarga.ts`](../frontend/src/navegacion/precarga.ts) y
> [`vite.config.ts`](../frontend/vite.config.ts) (`manualChunks`).

### Resumen

- Antes, todo el código de la interfaz iba en **un solo archivo de 1.283 kB (403 kB con gzip)**
  que la tablet tenía que bajar y compilar antes de mostrar el Ingreso, incluidos los gráficos de
  Reportes (`@mui/x-charts` + d3, ~300 kB), la Auditoría y las pantallas de gestión.
- Ahora el arranque baja **901 kB (282 kB con gzip): un 30 % menos**, en dos archivos que se
  piden en paralelo: `vendor` (React, router, MUI, Emotion, TanStack) e `index` (la app).
  Reportes, Auditoría y la gestión (usuarios, biometría, catálogo) se descargan recién al abrirlas
  o al apuntar a su enlace.
- Tras publicar una versión que solo cambia la app, la tablet vuelve a bajar `index` (**168 kB /
  55 kB con gzip**) y conserva `vendor` en la caché, en lugar de los 1.283 kB de antes.
- `face-api` (1,3 MB) ya iba aparte y sigue igual: se pide solo al encender la cámara para validar
  o registrar un rostro. Una prueba verifica que el Inicio no lo descarga ni pide la cámara.
- A modo de referencia (estimación, no medido en tablet): 121 kB menos con gzip son ~0,1 s menos
  a 10 Mbit/s y ~0,5 s menos a 2 Mbit/s, más el tiempo de compilar 382 kB menos de JavaScript.

### Tamaños antes y después

Medidos con `npx vite build` desde `frontend/` (lo mismo que construye la imagen de Docker; el
`npm run build` agrega `tsc -b` antes). Crudo = minificado; gzip = el que informa Vite. En kB
(1.000 bytes).

| Archivo                       | Antes: crudo | Antes: gzip | Después: crudo | Después: gzip | Cuándo se baja                         |
| ----------------------------- | -----------: | ----------: | -------------: | ------------: | -------------------------------------- |
| `index` (app)                 |     1.283,02 |      402,99 |         167,98 |         55,46 | Al abrir el sistema                    |
| `vendor` (librerías estables) |            — |           — |         733,13 |        226,66 | Al abrir el sistema (en paralelo)      |
| **Arranque (JS)**             | **1.283,02** |  **402,99** |     **901,11** |    **282,12** |                                        |
| `Reportes` (con los gráficos) |   (en index) |             |         340,34 |        109,09 | Al abrir Reportes o apuntar al enlace  |
| `Auditoria`                   |   (en index) |             |          18,40 |          7,43 | Al abrir Auditoría o apuntar al enlace |
| `FormularioUsuario`           |   (en index) |             |           6,15 |          2,71 | Gestión de usuarios                    |
| `CatalogoInsumos`             |   (en index) |             |           6,11 |          2,73 | Catálogo                               |
| `RostroUsuario`               |   (en index) |             |           3,63 |          1,63 | Biometría                              |
| `PruebaReconocimiento`        |   (en index) |             |           3,15 |          1,61 | Biometría                              |
| `ListaUsuarios`               |   (en index) |             |           3,06 |          1,55 | Gestión de usuarios                    |
| `PermisosUsuario`             |   (en index) |             |           2,85 |          1,43 | Gestión de usuarios                    |
| `GestionBiometria`            |   (en index) |             |           1,53 |          0,90 | Biometría                              |
| `usuarios`, `biometria` (API) |   (en index) |             |     0,62; 0,35 |    0,33; 0,21 | Compartidos por la gestión             |
| `face-api.esm`                |     1.327,95 |      340,43 |       1.327,95 |        340,43 | Al encender la cámara (sin cambios)    |
| `index.css` (fuentes aparte)  |         1,80 |        0,44 |           1,80 |          0,44 | Al abrir el sistema                    |

Con `npx vite build --mode development` los números son casi iguales: antes `index` 1.280,70 kB
(402,43 gzip); después `index` 166,94 (54,99) + `vendor` 733,13 (226,66) = 900,07 (281,65).

Verificado en el navegador con `vite preview` del build nuevo: en `/ingresar` se piden solo
`index`, `vendor`, el CSS y las fuentes.

**Composición del archivo único de antes** (un build de medición con un archivo por paquete):
`@mui/material` 271 kB, código de la app 223 kB, `@mui/x-charts` 220 kB (+ d3, gestos y
utilidades de los gráficos, ~80 kB), `react-dom` 209 kB, `react-router` 95 kB, `@mui/system`
40 kB, TanStack Query 35 kB, Popper 20 kB, Emotion ~20 kB, íconos 14 kB.

> El pedido citaba ~871 kB (270 kB gzip) para el archivo principal; con el árbol actual (E6, con
> los gráficos) el archivo único medía 1.283 kB (403 kB gzip), y esa es la línea de base de esta
> tabla. Solo con la carga diferida, sin `vendor`, el principal quedaba en 864 kB (270 kB gzip).

### Qué va en cada archivo

- **`index` + `vendor` (arranque):** Ingreso, Inicio, la disposición (menú, barra, tiempo real,
  notificaciones), "No encontrada" y **todo lo de al lado de la cama**: Recordatorios, pacientes
  (búsqueda, ficha, registro, edición), prescripciones, suministros (Administrar medicamento,
  insumos, historial) y estudios.
- **Diferido, uno por pantalla:** Reportes (con `@mui/x-charts` y d3, que **no** están en el
  arranque), Auditoría, Catálogo, Biometría (gestión, prueba, rostro de un usuario) y Usuarios
  (lista, formulario, permisos). Rollup separa además lo que comparten (las API de usuarios y
  biometría).
- **`face-api`:** aparte desde antes (`import()` en
  [`motorFaceApi.ts`](../frontend/src/biometria/motorFaceApi.ts)), y los modelos de `/models` se
  piden en el mismo momento.

### Mientras llega y si no llega

- Cada pantalla diferida trae su propio `Suspense` con el **`Cargando` común** ("Cargando…") en
  el lugar del contenido: el menú y la barra no se mueven. Es un límite por pantalla a propósito:
  el router navega con transiciones de React, y con un solo `Suspense` arriba la pantalla anterior
  quedaba quieta hasta que llegara el código, sin respuesta visible al toque. Así, al tocar una
  opción del menú, el Cargando aparece enseguida (hay una prueba). Una vez descargada, la pantalla
  abre sin Cargando de código; el de sus datos es el de siempre.
- Si la descarga falla (red cortada, o una versión nueva publicada y el archivo viejo ya no
  está), `pantallaDiferida` marca el error como `ErrorDeCargaDePantalla` y
  [`LimiteDeCarga`](../frontend/src/componentes/LimiteDeCarga.tsx) muestra "No se pudo abrir esta
  pantalla" con **Reintentar**, que recarga la página (así también trae la versión nueva). El menú
  queda a mano y al ir a otra ruta el aviso se va. Cualquier otro error sigue de largo: no se
  disfraza de falla de la red.

### Precarga al apuntar

[`usePrecargaAlApuntar`](../frontend/src/navegacion/precarga.ts) escucha `pointerover` y `focusin`
en el documento: al pasar el puntero o llegar con el teclado a un enlace interno (menú, tareas del
Inicio, cualquier lista) a una sección diferida, descarga sus pantallas una sola vez. No toca cada
enlace ni el menú. En la PC con mouse se adelanta lo que tarda en decidir el clic; en una tablet
el `pointerover` llega justo antes del toque, así que la ventaja es chica.

### Decisiones

Numeradas DF1–DF5 (decisiones del frontend) para no chocar con D70–D76 de arriba ni D80–D96 de
[despliegue.md](despliegue.md).

| #   | Decisión                                                                                             | Por qué                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DF1 | Lo clínico de al lado de la cama queda en el arranque; se difieren Reportes, Auditoría y la gestión. | Medido: diferir también lo clínico ahorraba 156 kB (45 kB gzip) más al inicio, pero partía la app en ~40 archivos chicos (las pantallas clínicas se importan entre sí) y hacía que abrir la ficha o Administrar medicamento dependiera de la red: con el Wi‑Fi cortado un momento, o tras publicar una versión a mitad del turno, aparecería "No se pudo abrir esta pantalla" en la tarea más frecuente. Así, esas pantallas abren sin descarga y sin Cargando.                                                                                                                                         |
| DF2 | `manualChunks` con un solo grupo, `vendor` (lista en `vite.config.ts`).                              | React, React DOM, React Router, `@mui/material` y su base (`system`, `utils`, `styled-engine`), Emotion, TanStack, Popper y `react-transition-group` cambian solo al actualizar dependencias, no en cada versión de la app: tras una publicación la tablet baja 168 kB en lugar de 901 kB. Costo medido en la primera carga: +37 kB (+12 kB gzip), porque `vendor` lleva todo lo de MUI que usa cualquier pantalla (también lo que solo usan Auditoría o Reportes: Auditoría pasó de 44 a 18 kB). Con HTTP/2 (nginx) el archivo extra no agrega una ida y vuelta: `index.html` lo precarga en paralelo. |
| DF3 | Sin un segundo grupo manual para los gráficos (`@mui/x-charts`, d3).                                 | Rollup mete en un grupo manual también las dependencias de lo que se nombra. Con dos grupos, una dependencia compartida (por ejemplo `clsx` o `@babel/runtime`) podía caer en el de gráficos y `vendor` terminaría importándolo, cargando los gráficos al inicio. Los gráficos quedan dentro de `Reportes`, que solo usan el administrador y el médico.                                                                                                                                                                                                                                                 |
| DF4 | No se subió `chunkSizeWarningLimit`.                                                                 | El aviso de Vite (>500 kB) sigue por `vendor` (733 kB) y `face-api` (1,3 MB). Son esperados, pero callar el aviso escondería que algo nuevo creció.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| DF5 | "Reintentar" recarga la página en vez de reintentar el `import()`.                                   | `React.lazy` recuerda el error, y si el motivo fue una versión nueva, el archivo viejo ya no existe: recargar trae el `index.html` nuevo (que nginx sirve sin caché) con los nombres nuevos. En la pantalla que falló no había nada escrito que se pierda.                                                                                                                                                                                                                                                                                                                                              |

### Pruebas

- [`componentes/LimiteDeCarga.test.tsx`](../frontend/src/componentes/LimiteDeCarga.test.tsx): el
  aviso con Reintentar, que otros errores siguen de largo y que se va al cambiar de ruta.
- [`cargaDiferida.test.tsx`](../frontend/src/cargaDiferida.test.tsx), con la app completa: el
  Cargando de siempre mientras llega el código (con el menú a mano), que aparece enseguida al tocar
  una opción del menú (no queda la pantalla anterior) y, con un `import()` que falla
  (`vi.mock` que lanza el error de red del navegador), el aviso con Reintentar y que desde el menú
  se sigue trabajando.
- [`navegacion/precarga.test.tsx`](../frontend/src/navegacion/precarga.test.tsx): el Inicio no
  descarga Reportes, Auditoría ni `face-api` ni pide la cámara; pasar el puntero por "Reportes" en
  el menú descarga esa pantalla (y no otra) y llegar con el teclado a "Ver quién cambió algo"
  descarga la Auditoría.
- Ajustadas: las pruebas de Reportes (`reportes`, `estadisticas`, `descargas`) y la de "Ver
  reportes" del Inicio cargan `Reportes` en un `beforeAll`, como si ya estuviera en la caché. Antes
  los gráficos se cargaban al importar el archivo de prueba; ahora, dentro de la primera búsqueda,
  y con la suite completa en paralelo superaban los 5 s de espera. Ninguna aserción cambió.

### Cómo volver a medir

```bash
cd frontend
npx vite build                      # tabla de archivos con crudo y gzip
npx vite build --mode development
```

Para ver la composición, sin instalar nada: un build con
`build.rollupOptions.output.manualChunks` que devuelva un nombre por paquete de `node_modules`
(en una configuración aparte, no en `vite.config.ts`).
