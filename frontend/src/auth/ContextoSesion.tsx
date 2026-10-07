import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { alExpirarSesion, api } from '../api/cliente';
import type { UsuarioSesion } from '../api/tipos';
import { useInactividad } from './useInactividad';
import { Contexto, type ValorSesion } from './useSesion';

/** Sesión del usuario (T105 · T107): quién está conectado, sus permisos y el cierre por inactividad. */
export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null | undefined>(undefined);
  const [aviso, setAviso] = useState<string | null>(null);
  const usuarioRef = useRef(usuario);
  usuarioRef.current = usuario;
  const clienteQuery = useQueryClient();

  const refrescarSesion = useCallback(async () => {
    try {
      setUsuario(await api.get<UsuarioSesion>('/api/auth/sesion'));
    } catch {
      setUsuario(null);
    }
  }, []);

  useEffect(() => {
    void refrescarSesion();
  }, [refrescarSesion]);

  const terminarSesionLocal = useCallback(
    (motivo: string | null) => {
      setUsuario(null);
      setAviso(motivo);
      clienteQuery.clear();
    },
    [clienteQuery],
  );

  // Si el backend responde que la sesión venció, se vuelve a la pantalla de ingreso.
  useEffect(() => {
    alExpirarSesion((mensaje) => {
      if (usuarioRef.current) terminarSesionLocal(mensaje);
    });
    return () => alExpirarSesion(null);
  }, [terminarSesionLocal]);

  const iniciarSesion = useCallback(async (nombreUsuario: string, contrasena: string) => {
    const u = await api.post<UsuarioSesion>('/api/auth/login', { nombreUsuario, contrasena });
    setAviso(null);
    setUsuario(u);
  }, []);

  const cerrarSesion = useCallback(
    async (motivo?: string) => {
      try {
        await api.post('/api/auth/logout');
      } finally {
        terminarSesionLocal(motivo ?? null);
      }
    },
    [terminarSesionLocal],
  );

  useInactividad(usuario ? usuario.inactividadMinutos : null, () => {
    void cerrarSesion('La sesión se cerró por inactividad. Vuelva a ingresar.');
  });

  const valor = useMemo<ValorSesion>(
    () => ({
      usuario,
      aviso,
      iniciarSesion,
      cerrarSesion,
      refrescarSesion,
      tienePermiso: (codigo) => usuario?.permisos.includes(codigo) ?? false,
    }),
    [usuario, aviso, iniciarSesion, cerrarSesion, refrescarSesion],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
