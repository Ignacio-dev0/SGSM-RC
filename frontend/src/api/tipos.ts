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

export type Sexo = 'FEMENINO' | 'MASCULINO' | 'OTRO';
export type EstadoPaciente = 'INTERNADO' | 'EGRESADO';

export interface CamaDePaciente {
  id: number;
  numero: string;
  sala: { id: number; nombre: string };
  desde: string;
}

export interface Paciente {
  id: number;
  dni: string;
  nombre: string;
  apellido: string;
  fechaNacimiento: string;
  sexo: Sexo;
  obraSocial: string | null;
  numeroAfiliado: string | null;
  diagnostico: string | null;
  contactoEmergenciaNombre: string | null;
  contactoEmergenciaTelefono: string | null;
  observaciones: string | null;
  estado: EstadoPaciente;
  fechaIngreso: string;
  fechaEgreso: string | null;
  motivoEgreso: string | null;
  cama: CamaDePaciente | null;
}

export interface Cama {
  id: number;
  numero: string;
  habilitada: boolean;
  sala: { id: number; nombre: string };
  ocupada: boolean;
  paciente: { id: number; apellido: string; nombre: string; dni: string } | null;
}

export interface Sala {
  id: number;
  nombre: string;
  piso: string | null;
  camas: number;
  libres: number;
}

export interface HistorialPaciente {
  asignaciones: {
    id: number;
    cama: string;
    motivo: 'INGRESO' | 'TRASLADO' | 'REINGRESO';
    fechaDesde: string;
    fechaHasta: string | null;
    asignadoPor: string | null;
    liberadoPor: string | null;
  }[];
  modificaciones: {
    id: number;
    fechaHora: string;
    accion: string;
    entidad: string;
    usuario: string | null;
    valorAnterior: Record<string, unknown> | null;
    valorNuevo: Record<string, unknown> | null;
    detalle: string | null;
  }[];
  suministros: {
    id: number;
    fechaHora: string;
    tipo: 'MEDICAMENTO' | 'INSUMOS';
    prescripcionId: number | null;
    usuario: string | null;
    corregido: boolean;
    detalles: { insumo: string; cantidad: number; unidad: string }[];
  }[];
}

export type TipoInsumo = 'MEDICAMENTO' | 'INSUMO';

export interface Insumo {
  id: number;
  nombre: string;
  tipo: TipoInsumo;
  unidadMedida: string;
  presentacion: string;
  activo: boolean;
}

export type EstadoPrescripcion = 'VIGENTE' | 'SUSPENDIDA' | 'FINALIZADA';

export type Via =
  | 'ORAL'
  | 'SUBLINGUAL'
  | 'INTRAVENOSA'
  | 'INTRAMUSCULAR'
  | 'SUBCUTANEA'
  | 'TOPICA'
  | 'INHALATORIA'
  | 'SONDA'
  | 'RECTAL'
  | 'OTRA';

export interface Prescripcion {
  id: number;
  pacienteId: number;
  medicamento: { id: number; nombre: string; presentacion: string; unidadMedida: string };
  dosis: number;
  unidadDosis: string;
  frecuenciaHoras: number;
  via: Via;
  fechaInicio: string;
  fechaFin: string | null;
  observaciones: string | null;
  estado: EstadoPrescripcion;
  motivoCambioEstado: string | null;
  prescriptor: string;
  creadoEn: string;
  proximaToma: string | null;
  ultimasAdministraciones: {
    id: number;
    fechaHora: string;
    cantidad: number | null;
    usuario: string;
  }[];
  /** Solo en el detalle: tomas de las próximas 24 horas. */
  agenda?: string[];
}

export interface Suministro {
  id: number;
  tipo: 'MEDICAMENTO' | 'INSUMOS';
  fechaHora: string;
  paciente: { id: number; apellido: string; nombre: string; dni: string; cama: string | null };
  usuario: { id: number; nombre: string };
  prescripcion: {
    id: number;
    medicamento: string;
    dosis: number;
    unidadDosis: string;
    frecuenciaHoras: number;
  } | null;
  tomaProgramada: string | null;
  detalles: {
    insumoId: number;
    insumo: string;
    tipoInsumo: TipoInsumo;
    cantidad: number;
    unidad: string;
  }[];
  observaciones: string | null;
  validadoBiometricamente: boolean;
  corregido: boolean;
  motivoCorreccion: string | null;
  corregidoEn: string | null;
  corregidoPor: string | null;
  corregibleHasta: string;
}
