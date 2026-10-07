# DESIGN · SGSM-RC

Sistema visual de la interfaz. Fuente de verdad en código:
[`frontend/src/tema.ts`](frontend/src/tema.ts). Fundamentos en
[docs/diseno-visual.md](docs/diseno-visual.md) y componentes en
[docs/componentes.md](docs/componentes.md). Lo que dice este archivo sale de la interfaz
construida: si el código y este texto no coinciden, manda el código y se corrige el texto.

## Principios

1. **Para la tablet al lado de la cama**: objetivos táctiles de 56 px, una acción principal por
   pantalla, lectura rápida a un brazo de distancia.
2. **Seguridad antes que estética**: dosis, horas y nombres de paciente siempre grandes y sin
   ambigüedad (24 h, sin separador de miles, coma decimal, número y unidad juntos).
3. **Calma**: sin animaciones decorativas; respeta `prefers-reduced-motion`, salvo los
   indicadores de carga.
4. **Legible de día y de noche**: tema claro y oscuro con contraste AA; de noche nada encandila.
5. **Lo que llama la vista es lo que pide atención**: lo normal va neutro y con contorno; el
   relleno de color queda para lo que hay que hacer.

## Tokens (roles de la paleta de MUI)

| Rol                  | Claro     | Oscuro    | Uso                                                                  |
| -------------------- | --------- | --------- | -------------------------------------------------------------------- |
| `primary`            | `#0b5d6b` | `#5fb8c6` | Acción principal, barra superior (claro), navegación activa, foco    |
| `primary.dark`       | `#07434d` | `#3d8794` | Fondo de la acción principal al pasar el puntero                     |
| `primary.light`      | `#3d8794` | `#8fd3de` | Texto del ítem activo del menú en oscuro                             |
| `secondary`          | `#5b3f8c` | `#b39ddb` | Definido en el tema; hoy ningún componente lo usa                    |
| `error`              | `#b3261e` | `#f2b8b5` | Errores, acciones de peligro (egreso, bajas). Nunca un estado        |
| `warning`            | `#8a5300` | `#ffcc80` | Advertencias clínicas, estados que piden atención, franja de demo    |
| `success`            | `#1e6b3a` | `#8fd19e` | Confirmaciones (`Alerta tipo="exito"`)                               |
| `info`               | `#1f5a99` | `#9ec5f0` | Mensajes informativos; chip "Corregido"                              |
| `background.default` | `#f3f6f7` | `#0f1416` | Fondo                                                                |
| `background.paper`   | `#ffffff` | `#182024` | Superficies, campos de texto, barra superior en oscuro               |
| `text.primary`       | `#1a2326` | `#e3e9eb` | Texto                                                                |
| `text.secondary`     | `#4a5a5f` | `#a9b7bb` | Texto de apoyo, rótulos de los pares "título: valor"                 |
| `divider`            | `#d5dee0` | `#2c393d` | Bordes de superficies, tarjetas y barra superior en oscuro           |
| Encabezado de tabla  | `#e8eff0` | `#22303a` | Fondo de `TableCell` de cabecera (fijado en `MuiTableCell` del tema) |

Los componentes consumen roles (`color="primary"`, `bgcolor="background.paper"`), nunca valores
hexadecimales sueltos; los dos del encabezado de tabla son la única excepción y viven en el tema.

**Tintes.** Para fondos tenues se usa `tinte(tema, rol, opacidad)` de `tema.ts`, que parte de la
variable CSS del rol y sigue solo al tema claro u oscuro: ítem activo del menú en oscuro
(`primary` al 16 %), franja de aviso (`warning` al 14 %), tarjeta de prescripción elegida
(`primary` al 8 %).

## Tipografía

Atkinson Hyperlegible 400 y 700 (distingue `1/l/I` y `0/O`); respaldo Segoe UI, Roboto, Arial.

| Uso                                   | Tamaño                   | Peso / alto de línea |
| ------------------------------------- | ------------------------ | -------------------- |
| Título de pantalla (`h4`, es el `h1`) | 30 px; 24 px en teléfono | 700                  |
| Nombre del paciente (`h5`)            | 24 px                    | 700                  |
| Título de sección o tarjeta (`h6`)    | ≈ 21 px                  | 700 · 1.3            |
| Texto base (`body1`) y campos         | 17 px                    | 400                  |
| Botones                               | 17 px, sin mayúsculas    | 700                  |
| Título de tarjeta en teléfono         | 18 px                    | 700                  |
| Celdas de tabla                       | 16 px                    | cabecera en 700      |
| Ayuda flotante                        | 15 px                    | 600 · 1.35           |
| Franja de aviso                       | 15 px; 14 px en teléfono | 700 · 1.35           |
| Chip de estado                        | 14 px (alto 28 px)       | —                    |
| Etiqueta del riel (tablet vertical)   | ≈ 13 px                  | 600                  |

El título de pantalla baja a 24 px en teléfono para no ocupar dos renglones. El `h6` lleva alto de
línea 1.3 para que un nombre de medicamento largo en dos renglones no se separe.

## Formatos

- Horas: 24 h (`19:00`). Fechas: `dd/mm/aaaa`. Fecha y hora: `07/10/2026 19:00`.
- Dosis: coma decimal, sin separador de miles (`1000 mg`, `0,5 comprimido`).
- **Número y unidad nunca se cortan**: la dosis y la frecuencia (`cada 8 h`) llevan espacio no
  separable; la cama (`A‑01`) lleva guion no separable. Una toma ya dada se informa con hora
  absoluta (`Ya se dio a las 08:05`), que se puede cotejar con el historial.
- **Campos de fecha y hora** (`datetime-local`): siempre en hora de Argentina, como el resto de la
  pantalla, aunque la tablet tenga otra zona (`utilidades/campoFechaHora.ts`). El campo nativo
  puede mostrarla con otro formato (a. m./p. m., mes primero): debajo se repite con el de la app
  antes de confirmar ("Quedará para el 08/10/2026 10:00").

## Radios

| Elemento                                              | Radio                        |
| ----------------------------------------------------- | ---------------------------- |
| Botones, campos, tarjetas, superficies, alertas       | 12 px (`shape.borderRadius`) |
| Diálogos                                              | 16 px                        |
| Ítems del menú lateral y enlace "Saltar al contenido" | 24 px: píldora sobre 56 px   |
| Chips                                                 | píldora completa             |
| Franja de aviso                                       | 0 (de borde a borde)         |

## Superficies y profundidad

Plano: botones sin elevación, barra superior con `elevation={0}`, tarjetas y tablas con
`variant="outlined"` (borde `divider`, sin sombra). Solo los diálogos conservan la sombra de MUI,
porque están por encima de todo.

## Plantilla de pantalla

`PlantillaTablet` en tres anchos:

| Ancho                        | Menú                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| Teléfono (< 600 px)          | Cajón que se abre con el botón de menú; todo el ancho libre |
| Tablet vertical (600–899 px) | Riel de 96 px con ícono y etiqueta corta                    |
| Tablet horizontal y PC       | Menú lateral de 264 px                                      |

- **Barra superior**: fija, "SGSM-RC" y "Hospital El Dique" (este último se oculta en teléfono).
  De día va en `primary` con texto blanco. **De noche** el cian brillante encandila: pasa a
  `background.paper` con texto normal y un borde inferior `divider`.
- **Ítem activo del menú**: relleno `primary` de día; de noche, tinte `primary` al 16 % con texto
  `primary.light`.
- **Franja de modo demostración**: aviso permanente de borde a borde, fijo bajo la barra superior
  mientras se desplaza el contenido. Fondo opaco con tinte `warning` al 14 %, borde inferior
  `warning`, texto `text.primary` en negrita ("Modo demostración: la validación facial se simula.
  No usar con pacientes reales."). Los diálogos que la tapan repiten el aviso adentro. En la misma
  franja aparece el **aviso de recordatorios nuevos** (ver Recordatorios); si están los dos, los
  separa una línea `warning`.
- **Contenido**: márgenes de 16 px en teléfono y 24 px desde `md`. Primer elemento enfocable:
  "Saltar al contenido".

## Títulos de pantalla

`EncabezadoPagina`: flecha de volver (con ayuda flotante que dice a dónde), título `h4` como
`h1`, subtítulo en `text.secondary` y acciones a la derecha; 24 px de separación debajo. En
teléfono la flecha y el título comparten la fila y las acciones pasan abajo. Al abrir la pantalla,
el título toma el foco y da nombre al documento.

## Botones

| Variante           | Aspecto              | Cuándo                                                            |
| ------------------ | -------------------- | ----------------------------------------------------------------- |
| `principal`        | Relleno `primary`    | La única acción llena de la pantalla                              |
| `secundario`       | Contorno `primary`   | Acciones alternativas                                             |
| `peligro`          | Contorno `error`     | Abre una confirmación (Finalizar, Dar de alta, Dar de baja)       |
| `peligroConfirmar` | Relleno `error`      | Solo el botón de confirmar de `ModalConfirmacion` con `peligroso` |
| `texto`            | Sin borde, `primary` | Cancelar, Reintentar                                              |

- Lo irreversible no es lo más llamativo hasta que se decidió seguir: en la pantalla es contorno
  rojo; el rojo relleno aparece recién en el diálogo.
- **La acción principal va al final.** En formularios, dentro de `AccionesFormulario`: primero
  los secundarios y al final el principal. En teléfono se apilan a lo ancho (el principal abajo,
  donde llega el pulgar); desde 600 px van en fila a la derecha, con 8 px entre sí. En los
  diálogos, Cancelar (`texto`) a la izquierda y confirmar a la derecha.
- Mientras se guarda, `cargando`: el botón se deshabilita y muestra un círculo de carga.

## Chips de estado

Una sola regla, en `ESTADOS_CHIP` (`componentes/estadosChip.ts`), aplicada por `ChipEstado`
(28 px de alto, 14 px). El énfasis sube con lo que hay que hacer:

| Nivel                         | Aspecto               | Estados                                          |
| ----------------------------- | --------------------- | ------------------------------------------------ |
| Esperable                     | Contorno, neutro      | Vigente, Internado, Activo, Validado, Registrado |
| Hecho a tener en cuenta       | Contorno, `info`      | Corregido                                        |
| Pide atención                 | Relleno, `warning`    | Suspendida, Bloqueado, Sin registrar             |
| Cerrado (ya no está en curso) | Relleno suave, neutro | Finalizada, Egresado, Dado de baja               |

**Estado de la toma** (`paginas/suministros/estadoToma.ts`), en la tarjeta de prescripción:

| Estado                     | Aspecto                                   |
| -------------------------- | ----------------------------------------- |
| Atrasada 1 h               | Relleno `warning`                         |
| Toca ahora (hasta 30 min)  | Relleno `primary`                         |
| Ya se dio a las 08:05      | Contorno `warning` con ícono de historial |
| Faltan 2 h / Sin más tomas | Contorno neutro                           |

- **Sin verde para los estados**: una toma ya dada no es un "todo bien" sino un riesgo de duplicar
  la dosis. El rojo queda para errores y acciones de peligro, nunca para un estado.
- El estado nunca se dice solo con el color: la etiqueta dice de qué se trata (y la toma dada
  suma el ícono).

## Recordatorios

**Chip de urgencia** (`paginas/recordatorios/urgencia.ts`), en cada tarjeta del panel; mismo
tamaño que `ChipEstado` (28 px, 14 px, negrita) y siempre con ícono:

| Nivel      | Chip (toma / estudio)   | Aspecto                                              | Cuándo                                                   |
| ---------- | ----------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| Vencida    | Vencida / Vencido       | Relleno `warning`, reloj de arena; tarjeta con borde | Pasaron 60 min sin atenderse (`VENCIDO`)                 |
| Urgente    | Urgente                 | Relleno `warning`, triángulo; tarjeta con borde      | Prioridad `ALTA`, o pendiente que ya pasó su hora        |
| Pronto     | Pronto                  | Contorno `primary`, despertador                      | Prioridad `MEDIA` (un estudio, mientras no pasa su hora) |
| Programada | Programada / Programado | Contorno neutro, reloj                               | Prioridad `BAJA` (falta más de 15 min)                   |

- Lo urgente y lo vencido llevan además la **tarjeta con borde `warning` de 2 px**. Nunca verde ni
  rojo, como el resto de los estados.
- "Pendiente que ya pasó su hora" se calcula en la tablet con la hora del servidor: el servidor
  deja un estudio siempre en `MEDIA` y recalcula la prioridad una vez por minuto.
- El texto de al lado de la hora grande dice el tiempo, no otro estado: "Faltan 12 min", "Toca
  ahora", "Atrasada 8 min" (pendiente; "Atrasado" en un estudio) y, si venció, **"Hace 45 min"**:
  el chip ya dice "Vencida", y "Atrasada" al lado se leería como un segundo estado.
- La insignia de la barra y el resumen del panel cuentan como urgentes los mismos que van
  rellenos.

**Aviso de recordatorios nuevos** (solo a quien atiende): en la franja fija bajo la barra (la del
modo demostración), así no tapa los botones de abajo; los diálogos quedan por encima. Despertador
`warning`, el texto ("2 recordatorios nuevos", 17 px), "Ver recordatorios" (`texto`, salvo en el
panel) y cerrar (ícono). Suena un tono corto y vibra si la tablet no los apagó.

- Se cierra solo a los 15 s; el tiempo no corre mientras el puntero o el foco están adentro ni
  mientras un diálogo lo tapa (al volver cuenta 15 s de nuevo). Con urgentes o vencidos sin
  atender queda hasta cerrarlo, y el tono se repite cada 5 min.
- El lector de pantalla lo oye por una región `aria-live` aparte, fuera de la aplicación (o dentro
  del diálogo abierto): MUI oculta todo lo que queda al lado de un diálogo.
- **Sin tiempo real**: el panel muestra una franja con el ícono de sin señal (tinte `warning` al
  14 %, borde `warning`) y la insignia de la barra lleva el mismo ícono abajo a la izquierda, en un
  círculo con fondo propio (se lee en la barra clara y en la oscura).

## Listados

- **Tabla** desde 600 px: cabecera con fondo propio y negrita, celdas de 16 px; si la fila se
  abre, se toca entera y lleva un chevron a la derecha.
- **Tarjetas en teléfono** (< 600 px): cada fila es una tarjeta con borde, de al menos 56 px, con
  12 px entre tarjetas; la primera columna es el título (18 px, negrita) y el resto, pares
  "título: valor" en dos columnas. Si se abre, chevron a la derecha; los controles de adentro
  (como "Administrar") no la abren.
- **Filtros** (`GrillaDeFiltros`): apilados en teléfono; en tablet vertical de a dos, con la
  búsqueda a todo el ancho; en pantalla ancha, en las columnas pedidas.
- La columna que identifica la fila (`ColumnaPrincipal`) va en negrita y con ancho mínimo desde
  tablet, para que su encabezado no se parta.
- Al refiltrar, las filas anteriores se atenúan al 50 % (`Recargando`) hasta que llegan las nuevas.
- Vacío, carga y error son tres estados distintos: un fallo nunca se muestra como "no hay datos".

## Gráficos

Los de Reportes (`@mui/x-charts`, `paginas/reportes/`), siempre dentro de `GraficoConTabla`:
título, descripción y "Ver como tabla" con los mismos números (ver
[docs/componentes.md](docs/componentes.md)).

**Un color es una serie, y quiere decir lo mismo en toda la pantalla** (`useColoresGrafico`):

| Serie                                                   | Rol              | Por qué                               |
| ------------------------------------------------------- | ---------------- | ------------------------------------- |
| Suministros (todos): la línea "Suministros", más usados | `info`           | Cantidades de suministros             |
| Con medicamentos                                        | `primary`        | Barra del consumo por tipo y su línea |
| Con insumos                                             | `secondary`      | Barra del consumo por tipo y su línea |
| Recordatorios (a tiempo, tarde, no administrados)       | `text.secondary` | Neutro: lo normal no llama la vista   |
| Vencidos sin atender                                    | `warning`        | Lo único que pide atención            |

- **Una sola paleta por gráfico**: un gráfico de una sola medida (más usados, recordatorios) va de
  un color; el de aviso solo marca lo que pide atención. Ningún rol se reusa con otro sentido.
- **Nunca `success` ni `error`**: un "a tiempo" verde o un "vencido" rojo serían un juicio, y el
  rojo es de errores y acciones de peligro (igual que en los chips).
- **Cada serie con texto o forma además del color**: las barras llevan el nombre en el eje y el
  número al final (sin leyenda: el nombre ya está); las líneas, forma de punto y trazo propios
  (continuo, rayado, punteado) y la leyenda dibuja los dos. Sin tortas ni barras apiladas, que
  solo se leen por el color.
- Ejes con letra de 14 px y el de abajo de 56 px de alto; un nombre largo va en dos renglones y el
  eje se mide con el más largo, hasta la mitad del ancho; el eje de los valores se estira para que
  el número de la barra más larga entre a su derecha.
  En el teléfono, si el eje no alcanza, la tabla empieza abierta.
- Los colores se pasan ya resueltos del esquema activo (claro u oscuro): la biblioteca pinta con
  atributos SVG.
- **Sin animación con `prefers-reduced-motion`** (`skipAnimation`).

## Seguridad clínica

Son parte del diseño, no del contenido:

- **Identidad del paciente siempre visible** donde se actúa sobre él (`IdentidadPaciente`):
  nombre en 24 px, DNI, edad y cama en negrita, juntos en una superficie con borde. En los
  diálogos, nombre, DNI y cama en el mensaje.
- **Resumen antes de confirmar** una administración ("Revise antes de confirmar": paciente, qué
  se da, vía, toma), con la dosis distinta o la toma ya dada avisadas.
- **Avisos que piden una decisión** (`Alerta` con `enfocar`): se llevan a la vista y toman el foco.
- **Número y unidad sin cortes**, horas en 24 h (ver Formatos).
- **Toda baja o cambio de estado** pasa por `ModalConfirmacion`, que dice sobre qué se hace y si
  se puede deshacer, y no se cierra tocando afuera.
- **Tarjeta de prescripción elegida**: borde `primary` de 2 px, tinte `primary` al 8 % y tilde;
  nunca un gris, que se leería "deshabilitada".

## Ayuda flotante

`AyudaFlotante`, solo para controles de ícono y siempre secundaria: el nombre del control va en
su `aria-label`. Fondo `text.primary` con texto `background.default` (invertido, AA en los dos
temas), 15 px en 600. Aparece con el foco o el puntero; en pantallas táctiles solo con pulsación
larga, para no estorbar al toque.

## Foco y movimiento

- Foco visible: contorno de 3 px en `primary` con 2 px de separación.
- Con `prefers-reduced-motion` se anulan animaciones y transiciones, **salvo** los círculos y
  barras de carga: quietos no dejan distinguir "cargando" de "colgado".

## Temas

`Sistema` (por defecto, sigue al dispositivo), `Claro` u `Oscuro`, elegible desde la barra
superior; la elección se recuerda en la tablet (`sgsm.tema`).
