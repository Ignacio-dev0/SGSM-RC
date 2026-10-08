# Supuestos y decisiones técnicas

El documento de la Actividad 6 (casos de uso CU01–CU35, DER, reglas de negocio y requisitos) no
estaba disponible al construir el prototipo. Todo lo que el plan de trabajo no define se resolvió
con la opción más simple y razonable, y queda registrado acá para que el equipo lo revise contra
el documento original.

## Dominio

| #   | Supuesto                                                                                                                                                                | Dónde impacta        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| S1  | Los **tres roles** del sistema son Administrador, Médico y Enfermero.                                                                                                   | Semilla, permisos    |
| S2  | El "**administrador principal**" que recibe las notificaciones es todo usuario activo con rol Administrador.                                                            | T112, T407           |
| S3  | El **Médico** interna pacientes y carga prescripciones; el **Enfermero** registra suministros. Cualquier otra combinación se resuelve con permisos adicionales (CU05).  | Catálogo de permisos |
| S4  | El paciente tiene **una sola ficha por DNI**: el reingreso de un paciente egresado reutiliza su ficha (para conservar el historial) en lugar de crear una nueva.        | T102, T204           |
| S5  | Las camas se organizan en **salas**; la sala es una tabla propia.                                                                                                       | T101, T201, T203     |
| S6  | La validación facial es **1:1**: compara el rostro con el patrón del usuario que tiene la sesión abierta en la tablet.                                                  | T404, T405           |
| S7  | Un suministro de medicamento registra una sola administración (una toma) de una prescripción vigente; los insumos no medicinales pueden ir varios en un mismo registro. | T408, T409           |
| S8  | La corrección de un suministro (CU23) la puede hacer cualquier usuario con `suministros.corregir`, dentro de las 24 h, validando su rostro.                             | T412                 |
| S9  | El recordatorio de una toma se genera **30 min antes**; tras una caída del servidor solo se recuperan las tomas de los últimos 30 min.                                  | T501, T502           |
| S10 | Prioridad por lo que falta: **BAJA** con más de 15 min, **MEDIA** entre 5 y 15, **ALTA** con 5 o menos o atrasada; los de estudio, siempre MEDIA.                       | T503                 |
| S11 | Un recordatorio **vence a los 60 min** de generado sin atenderse (unos 30 min después de la toma), sigue visible 12 h y se puede atender tarde.                         | T503, T508           |
| S12 | Atender es **registrar la administración** de esa toma o indicar **"No se administró"** con el motivo (sin rostro, auditado). A validar con enfermería.                 | T507                 |
| S13 | Los recordatorios son de **todo el hospital**, filtrables por sala; no hay asignación por turno.                                                                        | T506                 |
| S14 | Ven recordatorios los tres roles; atienden enfermería y administración; el vencido avisa a **todo administrador activo**.                                               | T505, T508           |
| S15 | Los estudios los **programa el médico** y los **confirma enfermería con su rostro**.                                                                                    | T509–T513            |
| S16 | El tono y la vibración de un recordatorio nuevo son solo para quien atiende, como mucho cada 10 s y desactivables por tablet.                                           | T505, T506           |
| S17 | Ven reportes y estadísticas el administrador y el médico; **exporta el administrador**; la auditoría la consulta **solo el administrador**.                             | T601–T607            |
| S18 | Los reportes cuentan los días en **hora de Argentina** y abarcan como mucho 366 días.                                                                                   | T601, T602           |
| S19 | Un suministro corregido cuenta en los reportes con sus **valores corregidos**; la corrección se ve en la auditoría.                                                     | T601                 |
| S20 | Un recordatorio "atendido a tiempo" se atendió antes de vencer; "tarde", después.                                                                                       | T602                 |

## Técnicas

| #   | Decisión                                                                                                                  | Por qué                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Prisma 6** (no 7/8) y **TypeScript 5.9** (no 7).                                                                        | Prisma 7 exige ESM y adaptadores, y TypeScript 7 todavía no es compatible con ts-jest ni typescript-eslint. Se eligieron las últimas versiones estables compatibles con el stack del plan. |
| D2  | **Vite 7, Vitest 3, MUI 7, ESLint 9, MSW 2.**                                                                             | Mismo criterio: versiones estables con compatibilidad probada entre sí.                                                                                                                    |
| D3  | Sesión en **cookie httpOnly** con JWT deslizante, en lugar de guardar el token en el navegador.                           | El token no queda accesible a JavaScript (mitiga XSS) y el cierre por inactividad se controla en el servidor.                                                                              |
| D4  | La auditoría se registra **explícitamente en cada servicio**, dentro de la transacción, y un trigger la hace inalterable. | Más fácil de probar y de leer que un middleware implícito, y garantiza que no queden cambios sin auditar.                                                                                  |
| D5  | Las restricciones de negocio también viven en la **base** (índices parciales, checks).                                    | La base es la última barrera aunque haya un error en el código.                                                                                                                            |
| D6  | **Atkinson Hyperlegible** como tipografía y objetivos táctiles de **56 px**.                                              | Legibilidad de dosis y DNI; uso con guantes.                                                                                                                                               |
| D7  | El `<select>` es **nativo**.                                                                                              | En la tablet abre el selector del sistema, más cómodo que un menú desplegable.                                                                                                             |
| D8  | Despliegue **solo local** (Docker Compose); T007/T008 en la nube quedaron fuera.                                          | Pedido del equipo para esta etapa. Ver [despliegue.md](despliegue.md).                                                                                                                     |

Las decisiones técnicas de cada etapa siguiente están junto a su diseño: D9–D14 en
[diseno-e5.md](diseno-e5.md), D15–D25 en [recordatorios.md](recordatorios.md#decisiones), las de
reportes y auditoría en [diseno-e6.md](diseno-e6.md) y las de la revisión de seguridad (D50–D62)
en [seguridad.md](seguridad.md#decisiones).

## Limitaciones conocidas del prototipo

Lo que el prototipo no resuelve y conviene definir con el hospital antes de usarlo con pacientes.
Surgió de las revisiones de interfaz y de la lectura de los manuales por usuarios simulados.

| Tema                                  | Hoy                                                                                                                           | Qué haría falta                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Alergias e interacciones              | No hay campo de alergias ni controles de interacción o dosis máxima; se anotan en las Observaciones del paciente.             | Campo estructurado, aviso al indicar y al administrar (modelo de la Actividad 6). |
| Indicaciones especiales               | No hay SOS, dosis única, infusión continua ni horarios desiguales; sin prescripción vigente no se registra la administración. | Tipos de indicación en el modelo y en la agenda.                                  |
| Atribución de una toma muy atrasada   | Una administración cuenta para la toma más cercana a la hora en que se confirma (D23); muy tarde, cuenta como la siguiente.   | Registrar la toma elegida (o la hora real) en el suministro.                      |
| Anular una administración             | No se puede: se corrige la cantidad dentro de las 24 h; pasado ese plazo nadie puede corregirla.                              | Anulación con motivo y doble control.                                             |
| Estudio no realizado                  | Enfermería no puede marcarlo; lo reprograma o lo cancela el médico.                                                           | Estado "no realizado" con motivo.                                                 |
| Avisos al médico                      | Las notificaciones (vencidos, bloqueos) van solo a los administradores.                                                       | Destinatarios por rol o por paciente.                                             |
| Identificación sin DNI                | El DNI es obligatorio (7 u 8 dígitos); no hay número provisorio ni pasaporte.                                                 | Identificador provisorio.                                                         |
| Roles                                 | Tres roles fijos; farmacia, kinesiología y otras profesiones se cubren con permisos adicionales.                              | Rol de solo consulta.                                                             |
| Contraseña olvidada                   | La cambia el administrador; si el único administrador la olvidó, el área de sistemas usa el instalador.                       | Recuperación con validación de identidad.                                         |
| Avisos con la tablet quieta           | El cierre por inactividad (15 min) apaga los avisos aunque el panel esté a la vista (R1); sin notificaciones del sistema.     | Tablet "tablero" con sesión de solo lectura y notificaciones con HTTPS.           |
| Pruebas con personas y equipos reales | No se hicieron T703 (tablets y navegadores reales), T706 (usabilidad con enfermería), T805 (sala piloto) ni T808.             | Hacerlas antes del uso real; los manuales están listos para la capacitación.      |
