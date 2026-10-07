import type { ReactNode } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from './useSesion';

/** Exige sesión iniciada; si no la hay, lleva a la pantalla de ingreso. */
export function RutaProtegida({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  const ubicacion = useLocation();

  if (usuario === undefined) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <CircularProgress aria-label="Cargando" />
      </Box>
    );
  }
  if (!usuario) return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname }} />;
  return <>{children}</>;
}

/**
 * Muestra la pantalla solo si el usuario tiene el permiso. Es una ayuda visual: la seguridad
 * real está en el backend, que valida el permiso en cada endpoint.
 */
export function ConPermiso({ permiso, children }: { permiso: string; children: ReactNode }) {
  const { tienePermiso } = useSesion();
  if (tienePermiso(permiso)) return <>{children}</>;
  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <LockOutlinedIcon sx={{ fontSize: 56, color: 'text.secondary' }} />
      <Typography variant="h5" component="h1" sx={{ mt: 2 }}>
        No tiene permiso para ver esta pantalla
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>
        Si lo necesita para su trabajo, pídaselo al administrador del sistema.
      </Typography>
    </Box>
  );
}
