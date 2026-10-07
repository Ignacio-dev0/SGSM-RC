# PRODUCT · SGSM-RC

Sistema de Gestión de Suministros Médicos y Recordatorios Clínicos del Hospital Zonal
Especializado en Rehabilitación "El Dique". Conocimiento estable del producto: quién lo usa,
para qué y con qué palabras. El detalle técnico está en [docs/](docs/).

## Problema

Hoy la administración de medicamentos e insumos se anota en papel y depende de la memoria del
personal. El hospital necesita saber **qué se le dio a cada paciente, cuándo y quién lo hizo**,
y avisar a tiempo de cada toma y de cada estudio.

## Actores

| Actor             | Qué hace con el sistema                                                                                           | Dónde y cómo                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Enfermería**    | Da la medicación indicada y registra los insumos que usa con cada paciente; consulta qué le toca a cada uno       | Tablet, al lado de la cama, muchas veces con guantes, de día y de noche, con apuro |
| **Médicos**       | Internan pacientes, los trasladan y les dan el alta; cargan, cambian y suspenden indicaciones (prescripciones)    | Tablet o PC, en la recorrida o en el office                                        |
| **Administrador** | Da de alta al personal, sus permisos y su rostro; mantiene el catálogo de insumos; recibe los avisos de seguridad | PC                                                                                 |

## Tareas núcleo (con las palabras de quien las hace)

| Tarea                                                        | Actor               | Frecuencia | Criticidad                                                |
| ------------------------------------------------------------ | ------------------- | ---------- | --------------------------------------------------------- |
| Darle a un paciente la medicación que le toca                | Enfermería          | Muy alta   | Alta (paciente, medicamento, dosis, vía y hora correctos) |
| Anotar los insumos que usé con un paciente (pañales, gasas…) | Enfermería          | Alta       | Media                                                     |
| Ver qué medicación le toca a un paciente y a qué hora        | Enfermería, médicos | Alta       | Alta                                                      |
| Encontrar a un paciente por su cama o apellido               | Todos               | Muy alta   | Media                                                     |
| Corregir algo que cargué mal                                 | Enfermería          | Baja       | Media                                                     |
| Internar a un paciente en una cama libre                     | Médicos             | Media      | Media                                                     |
| Indicar un medicamento (cargar una prescripción)             | Médicos             | Alta       | Alta                                                      |
| Cambiar o suspender una indicación                           | Médicos             | Media      | Alta                                                      |
| Cambiar de cama a un paciente                                | Médicos             | Baja       | Baja                                                      |
| Dar de alta a un paciente                                    | Médicos             | Media      | Alta (libera la cama y suspende indicaciones)             |
| Dar de alta a un enfermero nuevo y registrar su cara         | Administrador       | Baja       | Media                                                     |
| Agregar un insumo o medicamento al catálogo                  | Administrador       | Baja       | Baja                                                      |

## Glosario

Un concepto, un nombre, en todas las pantallas.

| Término                              | Significa                                                                   | No usar                                  |
| ------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------- |
| **Internar** / **Internación**       | Registrar el ingreso de un paciente con su cama                             | "Alta" de paciente, "crear paciente"     |
| **Dar de alta** / **Egreso**         | El paciente se va del hospital: libera la cama, suspende sus prescripciones | "Baja" de paciente                       |
| **Reingreso**                        | Volver a internar a un paciente que ya estuvo, en su misma ficha            |                                          |
| **Traslado**                         | Cambio de cama                                                              |                                          |
| **Prescripción**                     | Indicación médica de un medicamento: dosis, frecuencia, vía                 | "Receta"                                 |
| **Toma**                             | Cada momento en que corresponde dar un medicamento según la prescripción    |                                          |
| **Administrar**                      | Dar un medicamento a un paciente y registrarlo                              | "Suministrar" en pantallas de enfermería |
| **Insumo**                           | Material no medicinal (pañal, gasa, filtro…)                                |                                          |
| **Suministro**                       | Registro de una administración o de insumos usados (historial)              |                                          |
| **Confirmar con mi rostro**          | Validación facial de quien registra                                         | "Biometría" en pantallas de enfermería   |
| **Dar de baja**                      | Desactivar un usuario o un insumo del catálogo (nunca un paciente)          | "Eliminar"                               |
| **Nuevo usuario** / **Nuevo insumo** | Registrar personal o catálogo                                               | "Alta" (en la interfaz)                  |

## Reglas que la interfaz tiene que hacer visibles

- Un medicamento solo se administra sobre una prescripción vigente del paciente (RN07).
- Una cama tiene un solo paciente (RN02); un DNI, una sola ficha (RN08).
- Lo que se registra queda a nombre de quien confirmó con su rostro; se corrige solo dentro de
  las 24 horas, con motivo.
- Las horas de las tomas se leen en formato de 24 horas (08:00, 16:00, 00:00).
- Donde se actúa sobre un paciente se lo identifica siempre con nombre, DNI y cama: la cara
  identifica a quien registra, no al paciente.
- Antes de confirmar una administración se ve un resumen (paciente, qué se da, vía, toma). Una
  dosis distinta de la prescripta o una toma adelantada **se avisan**; una toma que **ya se dio**
  exige marcar a propósito que corresponde otra (las decisiones clínicas no las toma el sistema).
- El número y la unidad de una dosis nunca se separan ("500 mg", sin separador de miles).
- Toda baja o cambio de estado dice sobre qué se hace y si se puede deshacer (suspender sí,
  finalizar no; un usuario o un insumo dado de baja se reactiva).
- Un fallo de carga nunca se muestra como "no hay datos".
- Un minuto antes de cerrar la sesión por inactividad, el sistema avisa.

## Cómo se llega a cada tarea

El **inicio** de cada rol ofrece sus tareas con estas mismas palabras (Administrar medicamento,
Registrar insumos, Buscar paciente, Internar paciente, Ver lo que se registró, Nuevo usuario,
Registrar el rostro del personal, Agregar al catálogo). La ficha del paciente abre en sus
**prescripciones**, con **Administrar** en cada una; donde se ve un registro, se puede abrir y
corregir.

## Fuera del alcance actual

Recordatorios en tiempo real (E5), reportes (E6). Datos clínicos como alergias no están en el
modelo de la Actividad 6 que se infirió; ver [docs/supuestos.md](docs/supuestos.md).
