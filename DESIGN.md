# DESIGN · SGSM-RC

Sistema visual de la interfaz. Fuente de verdad en código:
[`frontend/src/tema.ts`](frontend/src/tema.ts). Fundamentos en
[docs/diseno-visual.md](docs/diseno-visual.md) y componentes en
[docs/componentes.md](docs/componentes.md).

## Principios

1. **Para la tablet al lado de la cama**: objetivos táctiles de 56 px, una acción principal por
   pantalla, lectura rápida.
2. **Seguridad antes que estética**: dosis, horas y nombres de paciente siempre grandes y sin
   ambigüedad (24 h, sin separador de miles, coma decimal).
3. **Calma**: sin animaciones decorativas; respeta `prefers-reduced-motion`.
4. **Legible de día y de noche**: tema claro y oscuro con contraste AA.

## Tokens (roles de la paleta de MUI)

| Rol                  | Claro     | Oscuro    | Uso                                               |
| -------------------- | --------- | --------- | ------------------------------------------------- |
| `primary`            | `#0b5d6b` | `#5fb8c6` | Acción principal, navegación activa               |
| `secondary`          | `#5b3f8c` | `#b39ddb` | Acciones secundarias de biometría                 |
| `error`              | `#b3261e` | `#f2b8b5` | Errores, egreso, bajas                            |
| `warning`            | `#8a5300` | `#ffcc80` | Advertencias clínicas (dosis distinta, duplicada) |
| `success`            | `#1e6b3a` | `#8fd19e` | Confirmaciones                                    |
| `background.default` | `#f3f6f7` | `#0f1416` | Fondo                                             |
| `background.paper`   | `#ffffff` | `#182024` | Superficies                                       |
| `text.primary`       | `#1a2326` | `#e3e9eb` | Texto                                             |
| `text.secondary`     | `#4a5a5f` | `#a9b7bb` | Texto de apoyo                                    |

Los componentes consumen roles (`color="primary"`, `bgcolor="background.paper"`), nunca valores
hexadecimales sueltos.

## Tipografía

Atkinson Hyperlegible (distingue `1/l/I` y `0/O`). Texto base 17 px; botones 17 px en negrita sin
mayúsculas; títulos de pantalla 30 px.

## Formatos

- Horas: 24 h (`19:00`). Fechas: `dd/mm/aaaa`. Fecha y hora: `07/10/2026 19:00`.
- Dosis: coma decimal, sin separador de miles (`1000 mg`, `0,5 comprimido`).

## Temas

`Sistema` (por defecto, sigue al dispositivo), `Claro` u `Oscuro`, elegible desde la barra
superior; la elección se recuerda en la tablet.
