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

## Paleta

| Rol       | Color     | Uso                                               |
| --------- | --------- | ------------------------------------------------- |
| primary   | `#0b5d6b` | Acciones principales, barra superior, menú activo |
| secondary | `#5b3f8c` | Acciones secundarias, biometría                   |
| error     | `#b3261e` | Errores, bajas, operaciones canceladas            |
| warning   | `#8a5300` | Advertencias (prescripción duplicada, etc.)       |
| success   | `#1e6b3a` | Confirmaciones                                    |
| info      | `#1f5a99` | Mensajes informativos                             |
| fondo     | `#f3f6f7` | Fondo de la aplicación                            |

Todos los colores de texto y de acción tienen contraste AA (≥ 4.5:1) sobre blanco.

## Plantilla de pantalla

[`PlantillaTablet`](../frontend/src/componentes/PlantillaTablet.tsx): barra superior fija,
menú lateral siempre visible (264 px en tablet horizontal; riel de 96 px con ícono y etiqueta
en tablet vertical) y área de contenido con márgenes de 16–24 px.
