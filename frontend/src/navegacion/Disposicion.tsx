import { Box, Typography } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { Outlet } from 'react-router-dom';
import { useSesion, useUsuario } from '../auth/useSesion';
import { Boton } from '../componentes/Boton';
import { PlantillaTablet } from '../componentes/PlantillaTablet';
import { CampanaNotificaciones } from './CampanaNotificaciones';
import { opcionesDelMenu } from './menu';

/** Estructura común de todas las pantallas con sesión: menú por rol y barra superior. */
export function Disposicion() {
  const usuario = useUsuario();
  const { cerrarSesion } = useSesion();

  return (
    <PlantillaTablet
      opciones={opcionesDelMenu(usuario.permisos)}
      acciones={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CampanaNotificaciones />
          <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
            <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {usuario.nombre} {usuario.apellido}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              {usuario.rol.nombre}
            </Typography>
          </Box>
          <Boton
            variante="texto"
            onClick={() => void cerrarSesion()}
            startIcon={<LogoutIcon />}
            sx={{ color: 'inherit' }}
          >
            Salir
          </Boton>
        </Box>
      }
    >
      <Outlet />
    </PlantillaTablet>
  );
}
