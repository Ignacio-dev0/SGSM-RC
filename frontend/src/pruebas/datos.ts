// Usuarios de ejemplo para las pruebas de pantallas, con los permisos reales de cada rol.
import type { UsuarioSesion } from '../api/tipos';

// Con los de E6 (docs/reportes.md, S17): reportes.ver para el administrador y el médico;
// reportes.exportar y auditoria.ver, solo para el administrador.
const PERMISOS_ADMIN = [
  'auditoria.ver',
  'biometria.gestionar',
  'catalogo.gestionar',
  'catalogo.ver',
  'estudios.confirmar',
  'estudios.gestionar',
  'estudios.ver',
  'pacientes.gestionar',
  'pacientes.ver',
  'prescripciones.gestionar',
  'prescripciones.ver',
  'recordatorios.atender',
  'recordatorios.ver',
  'reportes.exportar',
  'reportes.ver',
  'suministros.corregir',
  'suministros.registrar',
  'suministros.ver',
  'usuarios.gestionar',
  'usuarios.permisos',
];

const base = { tieneBiometria: false, inactividadMinutos: 15 };

export const ADMIN: UsuarioSesion = {
  ...base,
  id: 1,
  nombreUsuario: 'admin',
  nombre: 'Laura',
  apellido: 'Méndez',
  rol: { codigo: 'ADMINISTRADOR', nombre: 'Administrador' },
  permisos: PERMISOS_ADMIN,
};

export const MEDICO: UsuarioSesion = {
  ...base,
  id: 2,
  nombreUsuario: 'medico',
  nombre: 'Martín',
  apellido: 'Ferreyra',
  rol: { codigo: 'MEDICO', nombre: 'Médico' },
  permisos: [
    'catalogo.ver',
    'estudios.gestionar',
    'estudios.ver',
    'pacientes.gestionar',
    'pacientes.ver',
    'prescripciones.gestionar',
    'prescripciones.ver',
    'recordatorios.ver',
    'reportes.ver',
    'suministros.ver',
  ],
};

export const ENFERMERO: UsuarioSesion = {
  ...base,
  id: 3,
  nombreUsuario: 'enfermero',
  nombre: 'Sofía',
  apellido: 'Acosta',
  rol: { codigo: 'ENFERMERO', nombre: 'Enfermero' },
  permisos: [
    'catalogo.ver',
    'estudios.confirmar',
    'estudios.ver',
    'pacientes.ver',
    'prescripciones.ver',
    'recordatorios.atender',
    'recordatorios.ver',
    'suministros.corregir',
    'suministros.registrar',
    'suministros.ver',
  ],
  tieneBiometria: true,
};
