import { useQuery } from '@tanstack/react-query';
import { api } from './cliente';

/** Estudios programados (E5 · T509–T513). Contrato en docs/estudios.md. */

export type EstadoEstudio = 'PROGRAMADO' | 'REALIZADO' | 'CANCELADO';

export interface TipoEstudio {
  id: number;
  nombre: string;
  preparacionPorDefecto: string | null;
}

export interface Estudio {
  id: number;
  pacienteId: number;
  tipoEstudio: { id: number; nombre: string };
  /** El del tipo o el que precisó el médico ("Rx de tórax frente y perfil"). */
  nombre: string;
  /** Fecha y hora programada (ISO 8601 en UTC). */
  fechaHora: string;
  preparacion: string | null;
  /** De quien lo programó. */
  observaciones: string | null;
  estado: EstadoEstudio;
  /** Solo en un CANCELADO (también por el egreso). */
  motivoCancelacion: string | null;
  /** Cuándo se confirmó que se realizó (solo en un REALIZADO). */
  realizadoEn: string | null;
  /** nombre: "Apellido, Nombre". */
  confirmadoPor: { id: number; nombre: string } | null;
  /** De quien confirmó. */
  observacionesRealizacion: string | null;
  creadoPor: { id: number; nombre: string };
  creadoEn: string;
}

export interface DatosProgramacion {
  tipoEstudioId: number;
  /** ISO 8601 con zona. */
  fechaHora: string;
  /** Si se omite, el del tipo. */
  nombre?: string;
  /** Si se omite, la del tipo; null, sin preparación (D27). */
  preparacion?: string | null;
  observaciones?: string | null;
}

export interface DatosConfirmacion {
  /** Comprobante de la validación facial (POST /api/biometria/validar). */
  validacionToken: string;
  observaciones?: string;
}

export const estudiosApi = {
  tiposEstudio: () => api.get<TipoEstudio[]>('/api/tipos-estudio'),
  /** Programados primero (el más próximo arriba) y después el resto (D35). */
  dePaciente: (pacienteId: number, estado?: EstadoEstudio) =>
    api.get<Estudio[]>(`/api/pacientes/${pacienteId}/estudios`, { estado }),
  detalle: (id: number) => api.get<Estudio>(`/api/estudios/${id}`),
  programar: (pacienteId: number, datos: DatosProgramacion) =>
    api.post<Estudio>(`/api/pacientes/${pacienteId}/estudios`, datos),
  reprogramar: (id: number, fechaHora: string) =>
    api.patch<Estudio>(`/api/estudios/${id}`, { fechaHora }),
  cancelar: (id: number, motivo: string) =>
    api.post<Estudio>(`/api/estudios/${id}/cancelar`, { motivo }),
  confirmar: (id: number, datos: DatosConfirmacion) =>
    api.post<Estudio>(`/api/estudios/${id}/confirmar`, datos),
};

/** Raíz de las consultas de listas de estudios: ['estudios', pacienteId]. */
export const CLAVE_ESTUDIOS = 'estudios';

export const useTiposEstudio = (habilitado = true) =>
  useQuery({
    queryKey: ['tipos-estudio'],
    queryFn: estudiosApi.tiposEstudio,
    staleTime: 5 * 60_000,
    enabled: habilitado,
  });

export const useEstudiosDePaciente = (pacienteId: number) =>
  useQuery({
    queryKey: [CLAVE_ESTUDIOS, pacienteId],
    queryFn: () => estudiosApi.dePaciente(pacienteId),
  });

export const useEstudio = (id: number, conocido?: Estudio) =>
  useQuery({
    queryKey: ['estudio', id],
    queryFn: () => estudiosApi.detalle(id),
    // Lo que ya se ve en la lista se muestra enseguida mientras llega el estado actual.
    placeholderData: conocido,
  });
