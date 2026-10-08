import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
  type Theme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { TAMANO_TACTIL_MINIMO, tinte } from '../tema';

export interface OpcionMenu {
  ruta: string;
  etiqueta: string;
  icono?: ReactNode;
  /** Se resalta solo en su ruta exacta (Inicio siempre). */
  exacta?: boolean;
}

interface Props {
  opciones: OpcionMenu[];
  /**
   * La opción a resaltar cuando no es la de la ruta (la ruta de la opción, o null para ninguna).
   * Sin esto (undefined), se resalta la opción de la ruta actual.
   */
  resaltada?: string | null | undefined;
  /** Zona derecha de la barra superior (usuario, cerrar sesión). */
  acciones?: ReactNode;
  /**
   * Aviso permanente (por ejemplo, el modo demostración): una franja de borde a borde que queda
   * fija bajo la barra superior mientras se desplaza el contenido.
   */
  aviso?: ReactNode;
  /**
   * Lo que va al pie del cajón del menú en el teléfono (por ejemplo, el tema): así la barra
   * angosta deja lugar al nombre del sistema (riesgo R10).
   */
  pieDelCajon?: ReactNode;
  children: ReactNode;
}

const ANCHO_MENU = 264;
const ANCHO_RIEL = 96;

/** Identificador del contenido principal: destino del enlace "Saltar al contenido". */
const ID_CONTENIDO = 'contenido';

type Estilos = { [clave: string]: unknown };

/** Pasa cada `minHeight` de un estilo (también dentro de consultas anidadas) a `top`. */
const minHeightATop = (estilos: Estilos): Estilos =>
  Object.fromEntries(
    Object.entries(estilos).map(([clave, valor]) =>
      clave === 'minHeight' ? ['top', valor] : [clave, minHeightATop(valor as Estilos)],
    ),
  );

/** `top` igual al alto de la barra superior: reutiliza theme.mixins.toolbar con sus consultas. */
const topBajoLaBarra = (t: Theme) => minHeightATop(t.mixins.toolbar as Estilos);

function ListaMenu({
  opciones,
  compacto,
  resaltada,
  alElegir,
}: {
  opciones: OpcionMenu[];
  compacto: boolean;
  resaltada: string | null | undefined;
  alElegir?: () => void;
}) {
  const { pathname } = useLocation();
  // La de la ruta (Inicio y las `exacta`, solo en la suya), salvo que la pantalla diga otra.
  const activa = (o: OpcionMenu) =>
    resaltada !== undefined
      ? o.ruta === resaltada
      : matchPath({ path: o.ruta, end: o.ruta === '/' || Boolean(o.exacta) }, pathname) !== null;
  return (
    <Box component="nav" aria-label="Menú principal" sx={{ overflowY: 'auto', py: 1 }}>
      <List disablePadding>
        {opciones.map((o) => (
          <ListItemButton
            key={o.ruta}
            component={Link}
            to={o.ruta}
            className={activa(o) ? 'active' : undefined}
            // "page" en su pantalla; "true" en la sección desde la que se hace una tarea.
            aria-current={activa(o) ? (resaltada !== undefined ? 'true' : 'page') : undefined}
            onClick={alElegir}
            sx={(t) => ({
              mx: 1,
              my: 0.5,
              borderRadius: 2,
              flexDirection: compacto ? 'column' : 'row',
              textAlign: compacto ? 'center' : 'left',
              '&.active': {
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '& .MuiListItemIcon-root': { color: 'inherit' },
                // De noche el relleno cian brillante encandila: tinte tenue y texto claro (F26).
                ...t.applyStyles('dark', {
                  backgroundColor: tinte(t, 'primary', 0.16),
                  color: t.vars?.palette.primary.light ?? t.palette.primary.light,
                }),
              },
            })}
          >
            {o.icono && (
              <ListItemIcon sx={{ minWidth: compacto ? 0 : 44, justifyContent: 'center' }}>
                {o.icono}
              </ListItemIcon>
            )}
            <ListItemText
              primary={o.etiqueta}
              slotProps={{
                primary: { sx: { fontSize: compacto ? '0.8rem' : '1.05rem', fontWeight: 600 } },
              }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}

/**
 * Plantilla de pantalla (T004 · RF14 · RNF02): barra superior, menú lateral y área de contenido.
 * - Tablet horizontal y PC: menú lateral completo.
 * - Tablet vertical: riel con ícono y etiqueta corta, para no tapar el contenido.
 * - Teléfono: el menú se abre en un cajón con el botón de menú y deja todo el ancho al contenido.
 */
export function PlantillaTablet({
  opciones,
  resaltada,
  acciones,
  aviso,
  pieDelCajon,
  children,
}: Props) {
  const tema = useTheme();
  const telefono = useMediaQuery(tema.breakpoints.down('sm'));
  const riel = useMediaQuery(tema.breakpoints.down('md'));
  const [abierto, setAbierto] = useState(false);
  const refContenido = useRef<HTMLElement>(null);
  const anchoMenu = riel ? ANCHO_RIEL : ANCHO_MENU;

  // Lleva el foco al contenido sin tocar la dirección: un salto de hash agregaría una entrada al
  // historial con el estado de navegación vacío (por ejemplo, a qué búsqueda vuelve la flecha).
  const saltarAlContenido = (e: MouseEvent) => {
    e.preventDefault();
    refContenido.current?.focus();
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Primer elemento enfocable: quien usa teclado o lector evita recorrer el menú en cada pantalla. */}
      <Box
        component="a"
        href={`#${ID_CONTENIDO}`}
        onClick={saltarAlContenido}
        sx={(t) => ({
          position: 'fixed',
          top: 8,
          left: 8,
          // Por encima de la barra superior y del cajón del menú.
          zIndex: t.zIndex.drawer + 2,
          display: 'inline-flex',
          alignItems: 'center',
          minHeight: TAMANO_TACTIL_MINIMO,
          px: 3,
          borderRadius: 2,
          border: 2,
          borderColor: 'primary.main',
          bgcolor: 'background.paper',
          color: 'text.primary',
          fontWeight: 700,
          fontSize: '1.05rem',
          textDecoration: 'none',
          // Fuera de la vista hasta recibir el foco; sin animación (movimiento reducido).
          transform: 'translateY(-200%)',
          '&:focus, &:focus-visible': { transform: 'none' },
        })}
      >
        Saltar al contenido
      </Box>
      <AppBar position="fixed" elevation={0} sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: { xs: 0.5, sm: 2 } }}>
          {telefono && (
            <IconButton
              color="inherit"
              aria-label="Abrir el menú"
              onClick={() => setAbierto(true)}
              edge="start"
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography
            variant="h6"
            component="p"
            sx={{ flexGrow: 1, fontWeight: 700, minWidth: 0 }}
            noWrap
          >
            SGSM-RC
            <Typography
              component="span"
              sx={{
                ml: 1.5,
                opacity: 0.85,
                fontSize: '0.95rem',
                display: { xs: 'none', sm: 'inline' },
              }}
            >
              Hospital El Dique
            </Typography>
          </Typography>
          {acciones}
        </Toolbar>
      </AppBar>

      {telefono ? (
        <Drawer
          variant="temporary"
          open={abierto}
          onClose={() => setAbierto(false)}
          sx={{ '& .MuiDrawer-paper': { width: ANCHO_MENU, boxSizing: 'border-box' } }}
        >
          <Toolbar />
          <ListaMenu
            opciones={opciones}
            compacto={false}
            resaltada={resaltada}
            alElegir={() => setAbierto(false)}
          />
          {pieDelCajon && (
            <Box sx={{ mt: 'auto', px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
              {pieDelCajon}
            </Box>
          )}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: anchoMenu,
            flexShrink: 0,
            '& .MuiDrawer-paper': { width: anchoMenu, boxSizing: 'border-box' },
          }}
        >
          <Toolbar />
          <ListaMenu opciones={opciones} compacto={riel} resaltada={resaltada} />
        </Drawer>
      )}

      <Box
        component="main"
        id={ID_CONTENIDO}
        ref={refContenido}
        tabIndex={-1}
        // El contenido no es un control: al recibir el foco por el enlace no lleva recuadro.
        sx={{ flexGrow: 1, minWidth: 0, '&:focus, &:focus-visible': { outline: 'none' } }}
      >
        <Toolbar />
        {aviso && (
          <Box
            role="note"
            sx={(t) => ({
              position: 'sticky',
              ...topBajoLaBarra(t),
              // Debajo de la barra superior y del cajón del menú, encima del contenido.
              zIndex: t.zIndex.appBar - 1,
              px: { xs: 2, md: 3 },
              py: 0.75,
              borderRadius: 0,
              borderBottom: 1,
              borderColor: 'warning.main',
              // Base opaca con el tinte encima: el contenido que se desplaza no se transparenta.
              bgcolor: 'background.default',
              backgroundImage: `linear-gradient(${tinte(t, 'warning', 0.14)}, ${tinte(t, 'warning', 0.14)})`,
              color: 'text.primary',
              fontWeight: 700,
              fontSize: { xs: '0.9rem', sm: '0.95rem' },
              lineHeight: 1.35,
            })}
          >
            {aviso}
          </Box>
        )}
        <Box sx={{ p: { xs: 2, md: 3 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
