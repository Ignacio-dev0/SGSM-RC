/**
 * Catálogo de permisos y su asignación a los roles (T103 · T106 · RN05).
 *
 * Los permisos se piden por código en cada endpoint (`requierePermiso('pacientes.gestionar')`),
 * nunca por rol. El rol define el conjunto base y el administrador puede sumar permisos
 * adicionales a un usuario puntual (CU05). Ver docs/seguridad.md.
 */
export const PERMISOS = {
  'usuarios.gestionar': {
    modulo: 'usuarios',
    descripcion: 'Dar de alta, buscar, modificar y dar de baja usuarios (CU01–CU04)',
  },
  'usuarios.permisos': {
    modulo: 'usuarios',
    descripcion: 'Asignar permisos adicionales a un usuario (CU05)',
  },
  'biometria.gestionar': {
    modulo: 'biometria',
    descripcion: 'Registrar, actualizar y eliminar datos biométricos (CU07–CU09)',
  },
  'pacientes.ver': {
    modulo: 'pacientes',
    descripcion: 'Buscar pacientes y consultar su historial (CU12, CU16)',
  },
  'pacientes.gestionar': {
    modulo: 'pacientes',
    descripcion: 'Registrar, modificar, trasladar y dar de baja pacientes (CU11, CU13–CU15)',
  },
  'catalogo.ver': {
    modulo: 'catalogo',
    descripcion: 'Consultar el catálogo de insumos y medicamentos',
  },
  'catalogo.gestionar': {
    modulo: 'catalogo',
    descripcion: 'Administrar el catálogo de insumos y medicamentos',
  },
  'prescripciones.ver': {
    modulo: 'prescripciones',
    descripcion: 'Consultar las prescripciones de un paciente (CU18)',
  },
  'prescripciones.gestionar': {
    modulo: 'prescripciones',
    descripcion: 'Cargar, modificar, suspender y finalizar prescripciones (CU17, CU19)',
  },
  'suministros.registrar': {
    modulo: 'suministros',
    descripcion: 'Registrar la administración de medicamentos e insumos (CU20, CU21)',
  },
  'suministros.ver': {
    modulo: 'suministros',
    descripcion: 'Consultar el historial de suministros (CU22)',
  },
  'suministros.corregir': {
    modulo: 'suministros',
    descripcion: 'Corregir un suministro dentro de las 24 horas (CU23)',
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
    ],
  },
};
