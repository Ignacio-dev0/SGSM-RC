import { useQuery } from '@tanstack/react-query';
import { api } from './cliente';
import type { EstadoPrescripcion, Insumo, Prescripcion, TipoInsumo, Via } from './tipos';

export interface DatosPrescripcion {
  insumoId: number;
  dosis: number;
  unidadDosis: string;
  frecuenciaHoras: number;
  via: Via;
  fechaInicio: string;
  fechaFin: string | null;
  observaciones: string;
  confirmarDuplicada?: boolean;
}

export type CambiosPrescripcion = Partial<
  Pick<
    DatosPrescripcion,
    'dosis' | 'unidadDosis' | 'frecuenciaHoras' | 'via' | 'fechaFin' | 'observaciones'
  >
> & { motivo: string };

export const prescripcionesApi = {
  dePaciente: (pacienteId: number, estado?: EstadoPrescripcion) =>
    api.get<Prescripcion[]>(`/api/pacientes/${pacienteId}/prescripciones`, { estado }),
  obtener: (id: number) => api.get<Prescripcion>(`/api/prescripciones/${id}`),
  crear: (pacienteId: number, d: DatosPrescripcion) =>
    api.post<Prescripcion>(`/api/pacientes/${pacienteId}/prescripciones`, d),
  modificar: (id: number, d: CambiosPrescripcion) =>
    api.patch<Prescripcion>(`/api/prescripciones/${id}`, d),
  cambiarEstado: (id: number, estado: EstadoPrescripcion, motivo: string) =>
    api.post<Prescripcion>(`/api/prescripciones/${id}/estado`, { estado, motivo }),
};

export interface DatosInsumo {
  nombre: string;
  tipo: TipoInsumo;
  unidadMedida: string;
  presentacion: string;
}

export const insumosApi = {
  listar: (f: { tipo?: TipoInsumo | ''; texto?: string; activo?: string }) =>
    api.get<Insumo[]>('/api/insumos', f),
  crear: (d: DatosInsumo) => api.post<Insumo>('/api/insumos', d),
  modificar: (id: number, d: Partial<DatosInsumo> & { activo?: boolean }) =>
    api.patch<Insumo>(`/api/insumos/${id}`, d),
  darDeBaja: (id: number) => api.delete<Insumo>(`/api/insumos/${id}`),
};

/** Catálogo activo de un tipo, para los selectores. */
export const useCatalogo = (tipo: TipoInsumo) =>
  useQuery({
    queryKey: ['insumos', { tipo, activo: 'true' }],
    queryFn: () => insumosApi.listar({ tipo, activo: 'true' }),
    staleTime: 60_000,
  });

export const usePrescripcion = (id: number) =>
  useQuery({ queryKey: ['prescripcion', id], queryFn: () => prescripcionesApi.obtener(id) });
