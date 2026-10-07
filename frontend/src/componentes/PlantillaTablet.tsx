import type { ReactNode } from 'react';
import {
  AppBar,
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { NavLink } from 'react-router-dom';

export interface OpcionMenu {
  ruta: string;
  etiqueta: string;
  icono?: ReactNode;
}

interface Props {
  opciones: OpcionMenu[];
  /** Zona derecha de la barra superior (usuario, cerrar sesión). */
  acciones?: ReactNode;
  children: ReactNode;
}

const ANCHO_MENU = 264;
const ANCHO_RIEL = 96;

/**
 * Plantilla de pantalla para tablet (T004 · RF14 · RNF02): barra superior, menú lateral
 * siempre visible y área de contenido. En pantallas angostas (tablet vertical) el menú
 * se reduce a un riel con ícono y etiqueta corta, para no tapar el contenido.
 */
export function PlantillaTablet({ opciones, acciones, children }: Props) {
  const tema = useTheme();
  const ancho = useMediaQuery(tema.breakpoints.up('md'));
  const anchoMenu = ancho ? ANCHO_MENU : ANCHO_RIEL;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" elevation={0} sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" component="p" sx={{ flexGrow: 1, fontWeight: 700 }}>
            SGSM-RC
            <Typography component="span" sx={{ ml: 1.5, opacity: 0.85, fontSize: '0.95rem' }}>
              Hospital El Dique
            </Typography>
          </Typography>
          {acciones}
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: anchoMenu,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: anchoMenu, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box component="nav" aria-label="Menú principal" sx={{ overflowY: 'auto', py: 1 }}>
          <List disablePadding>
            {opciones.map((o) => (
              <ListItemButton
                key={o.ruta}
                component={NavLink}
                to={o.ruta}
                end={o.ruta === '/'}
                sx={{
                  mx: 1,
                  my: 0.5,
                  borderRadius: 2,
                  flexDirection: ancho ? 'row' : 'column',
                  textAlign: ancho ? 'left' : 'center',
                  '&.active': {
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    '& .MuiListItemIcon-root': { color: 'inherit' },
                  },
                }}
              >
                {o.icono && (
                  <ListItemIcon sx={{ minWidth: ancho ? 44 : 0, justifyContent: 'center' }}>
                    {o.icono}
                  </ListItemIcon>
                )}
                <ListItemText
                  primary={o.etiqueta}
                  slotProps={{
                    primary: { sx: { fontSize: ancho ? '1.05rem' : '0.8rem', fontWeight: 600 } },
                  }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, minWidth: 0 }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
