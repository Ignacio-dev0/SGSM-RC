import { useState } from 'react';
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  useColorScheme,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import SettingsBrightnessOutlinedIcon from '@mui/icons-material/SettingsBrightnessOutlined';
import { AyudaFlotante } from './AyudaFlotante';

type Modo = 'system' | 'light' | 'dark';

const OPCIONES: { modo: Modo; etiqueta: string; icono: typeof DarkModeOutlinedIcon }[] = [
  { modo: 'system', etiqueta: 'Igual que el dispositivo', icono: SettingsBrightnessOutlinedIcon },
  { modo: 'light', etiqueta: 'Claro', icono: LightModeOutlinedIcon },
  { modo: 'dark', etiqueta: 'Oscuro', icono: DarkModeOutlinedIcon },
];

/**
 * Elige el tema de la pantalla: el del dispositivo (por defecto), claro u oscuro (para el turno
 * noche en salas a oscuras). La elección se recuerda en la tablet.
 */
export function SelectorTema() {
  const { mode, setMode } = useColorScheme();
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const actual = OPCIONES.find((o) => o.modo === (mode ?? 'system')) ?? OPCIONES[0]!;
  const Icono = actual.icono;

  return (
    <>
      {/* El ícono muestra el estado; la ayuda dice la acción (el nombre accesible no cambia). */}
      <AyudaFlotante texto={`Cambiar el tema (ahora: ${actual.etiqueta})`}>
        <IconButton
          color="inherit"
          aria-label={`Tema de la pantalla: ${actual.etiqueta}`}
          aria-haspopup="menu"
          aria-expanded={Boolean(ancla)}
          onClick={(e) => setAncla(e.currentTarget)}
        >
          <Icono />
        </IconButton>
      </AyudaFlotante>
      <Menu anchorEl={ancla} open={Boolean(ancla)} onClose={() => setAncla(null)}>
        {OPCIONES.map((o) => (
          <MenuItem
            key={o.modo}
            role="menuitemradio"
            aria-checked={o.modo === actual.modo}
            selected={o.modo === actual.modo}
            onClick={() => {
              setMode(o.modo);
              setAncla(null);
            }}
          >
            <ListItemIcon>{o.modo === actual.modo ? <CheckIcon /> : null}</ListItemIcon>
            <ListItemText>{o.etiqueta}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
