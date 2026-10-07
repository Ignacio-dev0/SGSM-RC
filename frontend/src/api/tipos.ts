// Tipos de los datos que devuelve la API (ver docs/endpoints.md).

export interface UsuarioSesion {
  id: number;
  nombreUsuario: string;
  nombre: string;
  apellido: string;
  rol: { codigo: string; nombre: string };
  permisos: string[];
  tieneBiometria: boolean;
  inactividadMinutos: number;
}

export interface Usuario {
  id: number;
  nombreUsuario: string;
  dni: string;
  nombre: string;
  apellido: string;
  email: string | null;
  matricula: string | null;
  rol: { codigo: string; nombre: string };
  activo: boolean;
  fechaBaja: string | null;
  bloqueadoHasta: string | null;
  ultimoAcceso: string | null;
  tieneBiometria: boolean;
  permisosDelRol: string[];
  permisosAdicionales: string[];
}

export interface Rol {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  permisos: string[];
}

export interface Permiso {
  codigo: string;
  modulo: string;
  descripcion: string;
}

export interface Notificacion {
  id: number;
  tipo: string;
  mensaje: string;
  leida: boolean;
  creadaEn: string;
}
