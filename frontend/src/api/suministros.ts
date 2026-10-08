import { api } from './cliente';
import type { Suministro } from './tipos';

export interface ItemInsumo {
  insumoId: number;
  cantidad: number;
}

export interface FiltrosSuministros {
  pacienteId?: string;
  usuarioId?: string;
  tipoInsumo?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
}

export const suministrosApi = {
  administrar: (d: {
    pacienteId: number;
    prescripcionId: number;
    cantidad: number;
    observaciones: string;
    validacionToken: string;
    /** C1: registrar aunque esa toma ya tenga una administración (la casilla de otra toma). */
    otraToma?: boolean;
  }) => api.post<Suministro>('/api/suministros/medicamentos', d),
  registrarInsumos: (d: {
    pacienteId: number;
    items: ItemInsumo[];
    observaciones: string;
    validacionToken: string;
  }) => api.post<Suministro>('/api/suministros/insumos', d),
  buscar: (f: FiltrosSuministros) => api.lista<Suministro>('/api/suministros', { ...f }),
  obtener: (id: number) => api.get<Suministro>(`/api/suministros/${id}`),
  responsables: () => api.get<{ id: number; nombre: string }[]>('/api/suministros/responsables'),
  corregir: (
    id: number,
    d: {
      motivo: string;
      cantidad?: number;
      items?: ItemInsumo[];
      /** Si se omite quedan como estaban; null las borra. */
      observaciones?: string | null;
      validacionToken: string;
    },
  ) => api.patch<Suministro>(`/api/suministros/${id}`, d),
};
