import { api } from './cliente';
import type { Usuario } from './tipos';

/** Consulta de la auditoría (E6 · T604 · CU35). Contrato en docs/reportes.md. */

export interface EntradaAuditoria {
  id: number;
  fechaHora: string; // ISO 8601 en UTC
  accion: string;
  entidad: string;
  entidadId: string | null;
  /** "Apellido, Nombre"; { id: null, nombre: 'Sistema' } si no hubo usuario (temporizador). */
  usuario: { id: number | null; nombre: string };
  /** Paciente afectado, si corresponde. */
  paciente: { id: number; nombre: string; dni: string | null } | null;
  /** Solo los campos que cambiaron; las claves sensibles llegan como "[oculto]" (D49). */
  valorAnterior: Record<string, unknown> | null;
  valorNuevo: Record<string, unknown> | null;
  detalle: string | null;
}

/** Filtros tal como están en la URL: días 'AAAA-MM-DD' de Argentina e ids (vacío = sin filtro). */
export interface FiltrosAuditoria {
  desde: string;
  hasta: string;
  usuarioId: string;
  pacienteId: string;
  accion: string;
  entidad: string;
  pagina: number;
}

/** Acciones y entidades que hay en la base, en orden alfabético. */
export interface OpcionesAuditoria {
  acciones: string[];
  entidades: string[];
}

export const auditoriaApi = {
  buscar: (f: FiltrosAuditoria) => api.lista<EntradaAuditoria>('/api/auditoria', { ...f }),
  opciones: () => api.get<OpcionesAuditoria>('/api/auditoria/opciones'),
  /** El personal para el filtro "Usuario" (pide `usuarios.gestionar`, como la lista de usuarios). */
  personal: () => api.lista<Usuario>('/api/usuarios', { porPagina: 100 }),
};
