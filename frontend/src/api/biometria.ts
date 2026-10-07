import { api } from './cliente';

export interface PersonalBiometria {
  id: number;
  nombreUsuario: string;
  nombre: string;
  apellido: string;
  rol: string;
  registrado: boolean;
  actualizadoEn: string | null;
}

export interface EstadoBiometrico {
  usuarioId: number;
  nombreUsuario: string;
  nombre: string;
  apellido: string;
  rol: string;
  registrado: boolean;
  actualizadoEn: string | null;
}

export const biometriaApi = {
  personal: () => api.get<PersonalBiometria[]>('/api/biometria/usuarios'),
  estado: (id: number) => api.get<EstadoBiometrico>(`/api/biometria/usuarios/${id}`),
  registrar: (id: number, datos: { patron: number[]; foto: string }) =>
    api.put<EstadoBiometrico>(`/api/biometria/usuarios/${id}`, datos),
  eliminar: (id: number) => api.delete<EstadoBiometrico>(`/api/biometria/usuarios/${id}`),
  /** La versión evita que el navegador muestre la foto anterior después de actualizarla. */
  urlFoto: (id: number, version: string | null) =>
    `/api/biometria/usuarios/${id}/foto?v=${encodeURIComponent(version ?? '')}`,
};
