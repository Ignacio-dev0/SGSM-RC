/**
 * Catálogo de permisos y su asignación a los roles (T103 · T106 · RN05).
 *
 * Los permisos se piden por código en cada endpoint (`requierePermiso('pacientes.gestionar')`),
 * nunca por rol. El rol define el conjunto base y el administrador puede sumar permisos
 * adicionales a un usuario puntual (CU05). Ver docs/seguridad.md.
 */
export const PERMISOS = {
  // La descripción se muestra en la pantalla de permisos: palabras del usuario y glosario de
  // PRODUCT.md (D117). Los códigos de trazabilidad van en estos comentarios.
  // CU01–CU04 y la reactivación.
  'usuarios.gestionar': {
    modulo: 'usuarios',
    descripcion: 'Crear, buscar, modificar, dar de baja y reactivar usuarios',
  },
  // CU05.
  'usuarios.permisos': {
    modulo: 'usuarios',
    descripcion: 'Asignar permisos adicionales a otros usuarios',
  },
  // CU07–CU09.
  'biometria.gestionar': {
    modulo: 'biometria',
    descripcion: 'Registrar, actualizar y eliminar el rostro del personal',
  },
  // CU12, CU16.
  'pacientes.ver': {
    modulo: 'pacientes',
    descripcion: 'Buscar pacientes y ver su ficha e historial',
  },
  // CU11, CU13–CU15 (y el reingreso).
  'pacientes.gestionar': {
    modulo: 'pacientes',
    descripcion: 'Internar, modificar, trasladar y dar de alta pacientes',
  },
  // T303.
  'catalogo.ver': {
    modulo: 'catalogo',
    descripcion: 'Consultar el catálogo de medicamentos e insumos',
  },
  // T303.
  'catalogo.gestionar': {
    modulo: 'catalogo',
    descripcion: 'Agregar, modificar, dar de baja y reactivar medicamentos e insumos del catálogo',
  },
  // CU18.
  'prescripciones.ver': {
    modulo: 'prescripciones',
    descripcion: 'Ver las prescripciones de un paciente y sus próximas tomas',
  },
  // CU17, CU19.
  'prescripciones.gestionar': {
    modulo: 'prescripciones',
    descripcion: 'Indicar, modificar, suspender, reanudar y finalizar prescripciones',
  },
  // CU20, CU21.
  'suministros.registrar': {
    modulo: 'suministros',
    descripcion: 'Administrar medicamentos y registrar los insumos usados con cada paciente',
  },
  // CU22.
  'suministros.ver': {
    modulo: 'suministros',
    descripcion: 'Ver lo que se registró: medicamentos administrados e insumos usados',
  },
  // CU23.
  'suministros.corregir': {
    modulo: 'suministros',
    descripcion: 'Corregir lo que se registró, dentro de las 24 horas y con motivo',
  },
  // T505, T506.
  'recordatorios.ver': {
    modulo: 'recordatorios',
    descripcion: 'Ver las tomas y los estudios para atender y recibir sus avisos',
  },
  // T507.
  'recordatorios.atender': {
    modulo: 'recordatorios',
    descripcion: 'Atender recordatorios: administrar la toma o anotar por qué no se administró',
  },
  // T510.
  'estudios.ver': {
    modulo: 'estudios',
    descripcion: 'Ver los estudios programados de un paciente',
  },
  // T511, T512.
  'estudios.gestionar': {
    modulo: 'estudios',
    descripcion: 'Programar, reprogramar y cancelar estudios',
  },
  // T513.
  'estudios.confirmar': {
    modulo: 'estudios',
    descripcion: 'Confirmar con el rostro que un estudio se realizó',
  },
  // CU32, CU33.
  'reportes.ver': {
    modulo: 'reportes',
    descripcion: 'Ver el reporte de suministros y las estadísticas',
  },
  // CU34.
  'reportes.exportar': {
    modulo: 'reportes',
    descripcion: 'Descargar el reporte y las estadísticas en PDF o Excel',
  },
  // CU35.
  'auditoria.ver': {
    modulo: 'auditoria',
    descripcion: 'Ver la auditoría: quién cambió algo, cuándo y qué había antes y después',
  },
} as const;

export type CodigoPermiso = keyof typeof PERMISOS;

export const CODIGOS_PERMISO = Object.keys(PERMISOS) as CodigoPermiso[];

export type CodigoRol = 'ADMINISTRADOR' | 'MEDICO' | 'ENFERMERO';

export const ROLES: Record<
  CodigoRol,
  { nombre: string; descripcion: string; permisos: readonly CodigoPermiso[] }
> = {
  ADMINISTRADOR: {
    nombre: 'Administrador',
    descripcion: 'Administrador principal: usuarios, permisos, biometría y catálogo',
    permisos: CODIGOS_PERMISO,
  },
  MEDICO: {
    nombre: 'Médico',
    descripcion: 'Interna pacientes y carga las prescripciones',
    permisos: [
      'pacientes.ver',
      'pacientes.gestionar',
      'catalogo.ver',
      'prescripciones.ver',
      'prescripciones.gestionar',
      'suministros.ver',
      'recordatorios.ver',
      'estudios.ver',
      'estudios.gestionar',
      'reportes.ver',
    ],
  },
  ENFERMERO: {
    nombre: 'Enfermero',
    descripcion: 'Administra medicamentos e insumos al lado de la cama',
    permisos: [
      'pacientes.ver',
      'catalogo.ver',
      'prescripciones.ver',
      'suministros.registrar',
      'suministros.ver',
      'suministros.corregir',
      'recordatorios.ver',
      'recordatorios.atender',
      'estudios.ver',
      'estudios.confirmar',
    ],
  },
};
