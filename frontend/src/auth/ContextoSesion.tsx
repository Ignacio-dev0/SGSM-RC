import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { alExpirarSesion, api } from '../api/cliente';
import type { UsuarioSesion } from '../api/tipos';
import { AvisoInactividad } from './AvisoInactividad';
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

  // Renueva la sesión del servidor mientras se usa la tablet sin hacer pedidos (leyendo una
  // ficha): si no, el servidor la vencería aunque la persona esté trabajando.
  const renovarEnServidor = useCallback(() => {
    void api.get('/api/auth/sesion').catch(() => undefined);
  }, []);

  const { segundosRestantes, seguir } = useInactividad(
    usuario ? usuario.inactividadMinutos : null,
    () => void cerrarSesion('La sesión se cerró por inactividad. Vuelva a ingresar.'),
    { alHaberActividad: renovarEnServidor },
  );

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

  return (
    <Contexto.Provider value={valor}>
      {children}
      {segundosRestantes !== null && (
        <AvisoInactividad
          segundos={segundosRestantes}
          alSeguir={() => {
            seguir();
            renovarEnServidor();
          }}
          alSalir={() => void cerrarSesion()}
        />
      )}
    </Contexto.Provider>
  );
}
