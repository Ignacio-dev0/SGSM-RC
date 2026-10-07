import { createContext, useContext } from 'react';
import type { UsuarioSesion } from '../api/tipos';

export interface ValorSesion {
  /** `undefined` mientras se consulta la sesión al cargar la aplicación. */
  usuario: UsuarioSesion | null | undefined;
  /** Motivo del último cierre de sesión automático (inactividad, sesión vencida). */
  aviso: string | null;
  iniciarSesion: (nombreUsuario: string, contrasena: string) => Promise<void>;
  cerrarSesion: (aviso?: string) => Promise<void>;
  tienePermiso: (codigo: string) => boolean;
  refrescarSesion: () => Promise<void>;
}

export const Contexto = createContext<ValorSesion | null>(null);

export function useSesion() {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return valor;
}

/** Usuario de la sesión en pantallas que ya están protegidas por RutaProtegida. */
export function useUsuario(): UsuarioSesion {
  const { usuario } = useSesion();
  if (!usuario) throw new Error('No hay sesión iniciada');
  return usuario;
}
