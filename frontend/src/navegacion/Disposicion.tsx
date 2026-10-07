import { Box, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { Outlet } from 'react-router-dom';
import { useSesion, useUsuario } from '../auth/useSesion';
import { modoBiometria } from '../biometria/motor';
import { Boton } from '../componentes/Boton';
import { PlantillaTablet } from '../componentes/PlantillaTablet';
import { SelectorTema } from '../componentes/SelectorTema';
import { ProveedorTiempoReal } from '../tiempoReal/ProveedorTiempoReal';
import { CampanaNotificaciones } from './CampanaNotificaciones';
import { InsigniaRecordatorios } from './InsigniaRecordatorios';
import { opcionesDelMenu } from './menu';

/** Franja fija bajo la barra superior mientras la validación facial es simulada (F27). */
const AVISO_DEMOSTRACION =
  'Modo demostración: la validación facial se simula. No usar con pacientes reales.';

/**
 * Estructura común de todas las pantallas con sesión: menú por rol, barra superior y el tiempo
 * real de recordatorios (insignia en la barra y avisos de recordatorios nuevos).
 */
export function Disposicion() {
  const usuario = useUsuario();
  const { cerrarSesion, tienePermiso } = useSesion();
  const telefono = useMediaQuery(useTheme().breakpoints.down('sm'));
  const salir = () => void cerrarSesion();

  return (
    <ProveedorTiempoReal>
      <PlantillaTablet
        opciones={opcionesDelMenu(usuario.permisos)}
        {...(modoBiometria() === 'simulado' ? { aviso: AVISO_DEMOSTRACION } : {})}
        acciones={
          // En el teléfono sin separación extra: la barra es angosta (riesgo R10).
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0, sm: 1 } }}>
            <SelectorTema />
            {tienePermiso('recordatorios.ver') && <InsigniaRecordatorios />}
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
        <Outlet />
      </PlantillaTablet>
    </ProveedorTiempoReal>
  );
}
