import { Box, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { Outlet } from 'react-router-dom';
import { useSesion, useUsuario } from '../auth/useSesion';
import { modoBiometria } from '../biometria/motor';
import { Boton } from '../componentes/Boton';
import { PlantillaTablet } from '../componentes/PlantillaTablet';
import { SelectorTema } from '../componentes/SelectorTema';
import { AvisoNuevos } from '../tiempoReal/AvisoNuevos';
import { useTiempoReal } from '../tiempoReal/contexto';
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
  return (
    <ProveedorTiempoReal>
      <Plantilla />
    </ProveedorTiempoReal>
  );
}

/**
 * La plantilla con lo que va en la franja fija bajo la barra: el aviso de demostración y el de
 * recordatorios nuevos (E5-05). Ahí ningún aviso tapa botones ni diálogos.
 */
function Plantilla() {
  const usuario = useUsuario();
  const { cerrarSesion, tienePermiso } = useSesion();
  const { aviso, cerrarAviso, hayUrgentes } = useTiempoReal();
  const telefono = useMediaQuery(useTheme().breakpoints.down('sm'));
  const salir = () => void cerrarSesion();
  const demostracion = modoBiometria() === 'simulado';

  return (
    <PlantillaTablet
      opciones={opcionesDelMenu(usuario.permisos)}
      {...(demostracion || aviso
        ? {
            aviso: (
              <>
                {demostracion && <div>{AVISO_DEMOSTRACION}</div>}
                {aviso && (
                  <Box
                    sx={{
                      ...(demostracion && { mt: 0.75, pt: 0.75, borderTop: 1 }),
                      borderColor: 'warning.main',
                    }}
                  >
                    <AvisoNuevos aviso={aviso} alCerrar={cerrarAviso} fijo={hayUrgentes} />
                  </Box>
                )}
              </>
            ),
          }
        : {})}
      // En el teléfono el tema va al cajón del menú: la barra deja lugar a "SGSM-RC" (R10).
      pieDelCajon={
        telefono && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontWeight: 600 }}>Tema de la pantalla</Typography>
            <SelectorTema />
          </Box>
        )
      }
      acciones={
        // En el teléfono sin separación extra: la barra es angosta (riesgo R10).
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0, sm: 1 } }}>
          {!telefono && <SelectorTema />}
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
  );
}
