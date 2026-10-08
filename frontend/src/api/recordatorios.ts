import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './cliente';
import type { Via } from './tipos';

/** Recordatorios de tomas y estudios (E5). Contrato en docs/recordatorios.md. */

export type TipoRecordatorio = 'MEDICAMENTO' | 'ESTUDIO';
export type EstadoRecordatorio = 'PENDIENTE' | 'VENCIDO' | 'ATENDIDO' | 'CANCELADO';
export type PrioridadRecordatorio = 'ALTA' | 'MEDIA' | 'BAJA';

export interface Recordatorio {
  id: number;
  tipo: TipoRecordatorio;
  /** El panel solo recibe PENDIENTE y VENCIDO; "No se administró" devuelve el ATENDIDO. */
  estado: EstadoRecordatorio;
  prioridad: PrioridadRecordatorio;
  /** Hora de la toma o del estudio (ISO 8601 en UTC). */
  fechaHoraObjetivo: string;
  generadoEn: string;
  vencidoEn: string | null;
  paciente: { id: number; apellido: string; nombre: string; dni: string };
  /** Cama actual (null si no tiene asignación activa). */
  cama: { numero: string; sala: { id: number; nombre: string } } | null;
  /** Solo en los de MEDICAMENTO. */
  prescripcion: {
    id: number;
    medicamento: string;
    presentacion: string;
    dosis: number;
    unidadDosis: string;
    via: Via;
    frecuenciaHoras: number;
    /** Las de la prescripción ("Si fiebre"), para la tarjeta (F7); null si no tiene. */
    observaciones: string | null;
  } | null;
  /** Solo en los de ESTUDIO (fase 3). */
  estudio: { id: number; nombre: string; tipoEstudio: string; preparacion: string | null } | null;
  atendidoEn: string | null;
  atendidoPor: { id: number; nombre: string } | null;
  suministroId: number | null;
  motivoNoAdministrado: string | null;
}

export interface MetaRecordatorios {
  /** Cuántos hay para atender (con los filtros aplicados). */
  total: number;
  /** Cuántos tienen prioridad ALTA o están vencidos. */
  urgentes: number;
  /** Hora del servidor: corrige el reloj de la tablet (R6). */
  ahora: string;
}

export interface ListaRecordatorios {
  data: Recordatorio[];
  meta: MetaRecordatorios;
}

export interface FiltrosRecordatorios {
  tipo?: TipoRecordatorio;
  salaId?: number;
}

export const recordatoriosApi = {
  /** Para atender, por urgencia (el servidor ya los ordena). */
  listar: async (filtros: FiltrosRecordatorios = {}): Promise<ListaRecordatorios> => {
    const r = await api.lista<Recordatorio>('/api/recordatorios', { ...filtros });
    return r as unknown as ListaRecordatorios;
  },
  /** "No se administró" con el motivo (3 a 255 caracteres). */
  noAdministrar: (id: number, motivo: string) =>
    api.post<Recordatorio>(`/api/recordatorios/${id}/no-administrar`, { motivo }),
};

/** Raíz de las consultas: el tiempo real la invalida entera cuando algo cambia. */
export const CLAVE_RECORDATORIOS = 'recordatorios';

/** Lista para atender. Sin filtros es la misma consulta que usa la insignia de la barra. */
export const useRecordatorios = (filtros: FiltrosRecordatorios = {}) =>
  useQuery({
    queryKey: [CLAVE_RECORDATORIOS, filtros],
    queryFn: () => recordatoriosApi.listar(filtros),
    placeholderData: keepPreviousData,
  });
