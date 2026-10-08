import { useQuery } from '@tanstack/react-query';
import { api } from './cliente';
import type { Permiso, Rol, Usuario } from './tipos';

export interface FiltrosUsuarios {
  texto?: string;
  rol?: string;
  activo?: string;
  pagina?: number;
}

export interface DatosUsuario {
  nombre: string;
  apellido: string;
  dni: string;
  nombreUsuario: string;
  email: string;
  matricula: string;
  rol: string;
  contrasena?: string;
}

export const usuariosApi = {
  buscar: (f: FiltrosUsuarios) => api.lista<Usuario>('/api/usuarios', { ...f }),
  obtener: (id: number) => api.get<Usuario>(`/api/usuarios/${id}`),
  crear: (d: DatosUsuario) => api.post<Usuario>('/api/usuarios', d),
  modificar: (id: number, d: Partial<DatosUsuario>) => api.patch<Usuario>(`/api/usuarios/${id}`, d),
  darDeBaja: (id: number) => api.delete<Usuario>(`/api/usuarios/${id}`),
  reactivar: (id: number) => api.post<Usuario>(`/api/usuarios/${id}/reactivar`),
  asignarPermisos: (id: number, permisos: string[]) =>
    api.put<Usuario>(`/api/usuarios/${id}/permisos-adicionales`, { permisos }),
};

export const useRoles = () =>
  useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Rol[]>('/api/roles'),
    staleTime: 300_000,
  });

export const usePermisos = () =>
  useQuery({
    queryKey: ['permisos'],
    queryFn: () => api.get<Permiso[]>('/api/permisos'),
    staleTime: 300_000,
  });
