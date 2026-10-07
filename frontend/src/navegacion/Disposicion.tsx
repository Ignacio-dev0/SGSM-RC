import { Box, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { Outlet } from 'react-router-dom';
import { useSesion, useUsuario } from '../auth/useSesion';
import { modoBiometria } from '../biometria/motor';
import { Boton } from '../componentes/Boton';
import { PlantillaTablet } from '../componentes/PlantillaTablet';
import { SelectorTema } from '../componentes/SelectorTema';
import { CampanaNotificaciones } from './CampanaNotificaciones';
import { opcionesDelMenu } from './menu';

/** Estructura común de todas las pantallas con sesión: menú por rol y barra superior. */
export function Disposicion() {
  const usuario = useUsuario();
  const { cerrarSesion } = useSesion();
  const telefono = useMediaQuery(useTheme().breakpoints.down('sm'));
  const salir = () => void cerrarSesion();

  return (
    <PlantillaTablet
      opciones={opcionesDelMenu(usuario.permisos)}
      acciones={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SelectorTema />
          <CampanaNotificaciones />
          <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
            <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {usuario.nombre} {usuario.apellido}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              {usuario.rol.nombre}
            </Typography>
          </Box>
          {telefono ? (
            // En el teléfono, solo el ícono: así entra el nombre del sistema en la barra.
            <IconButton color="inherit" aria-label="Salir" title="Salir" onClick={salir}>
              <LogoutIcon />
            </IconButton>
          ) : (
            <Boton
              variante="texto"
              onClick={salir}
              startIcon={<LogoutIcon />}
              sx={{ color: 'inherit' }}
            >
              Salir
            </Boton>
          )}
        </Box>
      }
    >
      {modoBiometria() === 'simulado' && (
        <Box
          role="note"
          sx={{
            mb: 2,
            px: 2,
            py: 0.75,
            borderRadius: 2,
            border: 1,
            borderColor: 'warning.main',
            color: 'text.primary',
            fontWeight: 700,
            fontSize: '0.95rem',
          }}
        >
          Modo demostración: la validación facial se simula. No usar con pacientes reales.
        </Box>
      )}
      <Outlet />
    </PlantillaTablet>
  );
}
