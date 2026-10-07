# Diseño visual base

> Tarea T009 · Cubre RNF01 (usabilidad) y RNF02 (uso en tablet).
> Fuente de verdad en código: [`frontend/src/tema.ts`](../frontend/src/tema.ts).

El SGSM-RC se usa en tablets al lado de la cama del paciente, muchas veces con guantes y con
poco tiempo. El tema de MUI se ajustó para eso.

## Tamaños táctiles

| Elemento                                 | Mínimo        |
| ---------------------------------------- | ------------- |
| Botones, botones de ícono, ítems de menú | 56 × 56 px    |
| Campos de texto (alto)                   | 56 px         |
| Pestañas                                 | 56 px de alto |
| Casillas de verificación (área táctil)   | 52 px         |

56 px supera el mínimo de 48 px de Material Design para compensar la pérdida de precisión al
tocar con guantes. La constante `TAMANO_TACTIL_MINIMO` se usa en el tema y en las pruebas.

## Tipografía

- Familia: **Atkinson Hyperlegible** (diseñada para baja visión: distingue bien `1`, `l`, `I`,
  `0` y `O`, algo crítico al leer dosis y DNI). Respaldo: Segoe UI, Roboto, Arial.
- Texto base de 17 px (`body1` = 1.0625rem) y botones en negrita de 17 px, sin mayúsculas.
- Título de pantalla (`h4`) de 30 px, que baja a 24 px en teléfono para no ocupar dos renglones;
  `h6` en negrita con alto de línea 1.3.

## Paleta

| Rol        | Claro     | Oscuro    | Uso                                                      |
| ---------- | --------- | --------- | -------------------------------------------------------- |
| primary    | `#0b5d6b` | `#5fb8c6` | Acción principal, barra superior (claro), menú activo    |
| secondary  | `#5b3f8c` | `#b39ddb` | Definido en el tema; hoy ningún componente lo usa        |
| error      | `#b3261e` | `#f2b8b5` | Errores, acciones de peligro (bajas, egreso)             |
| warning    | `#8a5300` | `#ffcc80` | Advertencias (prescripción duplicada, etc.), franja demo |
| success    | `#1e6b3a` | `#8fd19e` | Confirmaciones                                           |
| info       | `#1f5a99` | `#9ec5f0` | Mensajes informativos                                    |
| fondo      | `#f3f6f7` | `#0f1416` | Fondo de la aplicación                                   |
| superficie | `#ffffff` | `#182024` | Tarjetas, campos, barra superior en oscuro               |
| divider    | `#d5dee0` | `#2c393d` | Bordes                                                   |
| cabecera   | `#e8eff0` | `#22303a` | Fondo del encabezado de tabla                            |

Todos los colores de texto y de acción tienen contraste AA (≥ 4.5:1) sobre blanco en claro y
sobre las superficies oscuras en oscuro. De noche la barra superior no va en el color de la marca
(encandila): pasa a la superficie del tema con texto normal y un borde sutil.

## Radios

12 px en botones, campos y tarjetas; 16 px en diálogos; píldora en los ítems del menú y en los
chips.

## Plantilla de pantalla

[`PlantillaTablet`](../frontend/src/componentes/PlantillaTablet.tsx): barra superior fija y
área de contenido con márgenes de 16–24 px. El menú depende del ancho: lateral de 264 px en
tablet horizontal y PC; riel de 96 px con ícono y etiqueta en tablet vertical; en teléfono, un
cajón que se abre con el botón de menú. Si hay un aviso permanente (modo demostración), va en una
franja de borde a borde fija bajo la barra superior.
