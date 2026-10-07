# PRODUCT · SGSM-RC

Sistema de Gestión de Suministros Médicos y Recordatorios Clínicos del Hospital Zonal
Especializado en Rehabilitación "El Dique". Conocimiento estable del producto: quién lo usa,
para qué y con qué palabras. El detalle técnico está en [docs/](docs/).

## Problema

Hoy la administración de medicamentos e insumos se anota en papel y depende de la memoria del
personal. El hospital necesita saber **qué se le dio a cada paciente, cuándo y quién lo hizo**,
y avisar a tiempo de cada toma y de cada estudio.

## Actores

| Actor             | Qué hace con el sistema                                                                                                                                              | Dónde y cómo                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Enfermería**    | Da la medicación indicada y registra los insumos que usa con cada paciente; consulta qué le toca a cada uno                                                          | Tablet, al lado de la cama, muchas veces con guantes, de día y de noche, con apuro |
| **Médicos**       | Internan pacientes, los trasladan y les dan el alta; cargan, cambian y suspenden indicaciones (prescripciones); programan estudios; consultan reportes               | Tablet o PC, en la recorrida o en el office                                        |
| **Administrador** | Da de alta al personal, sus permisos y su rostro; mantiene el catálogo de insumos; recibe los avisos de seguridad y de tomas vencidas; consulta reportes y auditoría | PC                                                                                 |

## Tareas núcleo (con las palabras de quien las hace)

| Tarea                                                        | Actor                  | Frecuencia | Criticidad                                                |
| ------------------------------------------------------------ | ---------------------- | ---------- | --------------------------------------------------------- |
| Darle a un paciente la medicación que le toca                | Enfermería             | Muy alta   | Alta (paciente, medicamento, dosis, vía y hora correctos) |
| Anotar los insumos que usé con un paciente (pañales, gasas…) | Enfermería             | Alta       | Media                                                     |
| Ver qué medicación le toca a un paciente y a qué hora        | Enfermería, médicos    | Alta       | Alta                                                      |
| Encontrar a un paciente por su cama o apellido               | Todos                  | Muy alta   | Media                                                     |
| Corregir algo que cargué mal                                 | Enfermería             | Baja       | Media                                                     |
| Internar a un paciente en una cama libre                     | Médicos                | Media      | Media                                                     |
| Indicar un medicamento (cargar una prescripción)             | Médicos                | Alta       | Alta                                                      |
| Cambiar o suspender una indicación                           | Médicos                | Media      | Alta                                                      |
| Cambiar de cama a un paciente                                | Médicos                | Baja       | Baja                                                      |
| Dar de alta a un paciente                                    | Médicos                | Media      | Alta (libera la cama y suspende indicaciones)             |
| Dar de alta a un enfermero nuevo y registrar su cara         | Administrador          | Baja       | Media                                                     |
| Agregar un insumo o medicamento al catálogo                  | Administrador          | Baja       | Baja                                                      |
| Ver qué tomas y estudios hay que atender ahora               | Enfermería             | Muy alta   | Alta (que ninguna toma pase sin verse)                    |
| Anotar que una toma no se dio y por qué                      | Enfermería             | Media      | Alta                                                      |
| Programar un estudio y confirmar que se hizo                 | Médicos, Enfermería    | Media      | Media                                                     |
| Ver cuánto se usó en un período y descargarlo                | Administrador, médicos | Baja       | Baja                                                      |
| Averiguar quién cambió algo y cuándo                         | Administrador          | Baja       | Media                                                     |

## Glosario

Un concepto, un nombre, en todas las pantallas.

| Término                                   | Significa                                                                                           | No usar                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Internar** / **Internación**            | Registrar el ingreso de un paciente con su cama                                                     | "Alta" de paciente, "crear paciente"     |
| **Dar de alta** / **Egreso**              | El paciente se va del hospital: libera la cama, suspende sus prescripciones                         | "Baja" de paciente                       |
| **Reingreso**                             | Volver a internar a un paciente que ya estuvo, en su misma ficha                                    |                                          |
| **Traslado**                              | Cambio de cama                                                                                      |                                          |
| **Prescripción**                          | Indicación médica de un medicamento: dosis, frecuencia, vía                                         | "Receta"                                 |
| **Toma**                                  | Cada momento en que corresponde dar un medicamento según la prescripción                            |                                          |
| **Administrar**                           | Dar un medicamento a un paciente y registrarlo                                                      | "Suministrar" en pantallas de enfermería |
| **Insumo**                                | Material no medicinal (pañal, gasa, filtro…)                                                        |                                          |
| **Suministro**                            | Registro de una administración o de insumos usados (historial)                                      |                                          |
| **Confirmar con mi rostro**               | Validación facial de quien registra                                                                 | "Biometría" en pantallas de enfermería   |
| **Dar de baja**                           | Desactivar un usuario o un insumo del catálogo (nunca un paciente)                                  | "Eliminar"                               |
| **Nuevo usuario** / **Nuevo insumo**      | Registrar personal o catálogo                                                                       | "Alta" (en la interfaz)                  |
| **Recordatorio**                          | Aviso de una toma o de un estudio que se acerca (30 min antes) o que está atrasado                  | "Alarma", "alerta"                       |
| **Urgente** / **Pronto** / **Programada** | Cuánto falta para la toma: 5 min o menos (o atrasada), entre 5 y 15, más de 15                      | Colores sin texto                        |
| **Vencida**                               | Toma que pasó unos 30 min sin atenderse: avisa al administrador y se puede atender tarde            | "Perdida"                                |
| **No se administró**                      | Registrar que una toma no se dio, con el motivo (ayuno, rechazo, estudio…)                          | "Cancelar la toma"                       |
| **Estudio**                               | Práctica programada a un paciente (laboratorio, radiografía…) que enfermería confirma con su rostro | "Turno"                                  |
| **Reporte** / **Estadísticas**            | Totales de lo que se usó en un período; se descargan en PDF o Excel                                 |                                          |
| **Auditoría**                             | Registro de quién hizo cada cambio, cuándo, y qué había antes y después                             | "Log"                                    |

## Reglas que la interfaz tiene que hacer visibles

- Un medicamento solo se administra sobre una prescripción vigente del paciente (RN07).
- Una cama tiene un solo paciente (RN02); un DNI, una sola ficha (RN08).
- Lo que se registra queda a nombre de quien confirmó con su rostro; se corrige solo dentro de
  las 24 horas, con motivo.
- Las horas de las tomas se leen en formato de 24 horas (08:00, 16:00, 00:00).
- Donde se actúa sobre un paciente se lo identifica siempre con nombre, DNI y cama: el rostro
  identifica a quien registra, no al paciente.
- Antes de confirmar una administración se ve un resumen (paciente, qué se da, vía, toma). Una
  dosis distinta de la prescripta o una toma adelantada **se avisan**; una toma que **ya se dio**
  exige marcar a propósito que corresponde otra (las decisiones clínicas no las toma el sistema).
- El número y la unidad de una dosis nunca se separan ("500 mg", sin separador de miles).
- Toda baja o cambio de estado dice sobre qué se hace y si se puede deshacer (suspender sí,
  finalizar no; un usuario o un insumo dado de baja se reactiva).
- Un fallo de carga nunca se muestra como "no hay datos".
- Un minuto antes de cerrar la sesión por inactividad, el sistema avisa; después del cierre, el
  ingreso dice que los avisos de recordatorios quedaron apagados.
- Un recordatorio nunca depende solo del sonido: texto, insignia en la barra y vibración. Si se
  corta el tiempo real, la pantalla lo dice y la lista se sigue actualizando sola.

## Cómo se llega a cada tarea

El **inicio** de cada rol ofrece sus tareas con estas mismas palabras (Tomas y estudios para
atender, Administrar medicamento, Registrar insumos, Buscar paciente, Internar paciente, Ver lo que
se registró, Nuevo usuario, Registrar el rostro del personal, Agregar al catálogo). La barra tiene
la **insignia de recordatorios** (cuántos hay para atender y cuántos urgentes) a un toque desde
cualquier pantalla. La ficha del paciente abre en sus **prescripciones**, con **Administrar** en
cada una, y tiene la pestaña **Estudios**; donde se ve un registro, se puede abrir y corregir.
**Reportes** y **Auditoría** están en el menú de quien los puede ver.

## Fuera del alcance actual

Notificaciones del sistema con la tablet bloqueada o el navegador cerrado (necesitan HTTPS y un
service worker), asignación de pacientes por turno y escalamiento al médico. Datos clínicos como
alergias no están en el modelo de la Actividad 6 que se infirió; ver
[docs/supuestos.md](docs/supuestos.md).
