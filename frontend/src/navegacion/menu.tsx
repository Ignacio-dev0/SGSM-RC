import type { ReactNode } from 'react';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import HotelOutlinedIcon from '@mui/icons-material/HotelOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';

export interface OpcionDelMenu {
  ruta: string;
  etiqueta: string;
  icono: ReactNode;
  /** Permiso que habilita la opción; null = cualquier usuario con sesión. */
  permiso: string | null;
}

/** Todas las opciones del menú principal, en el orden en que se muestran (T108). */
export const OPCIONES_DEL_MENU: OpcionDelMenu[] = [
  { ruta: '/', etiqueta: 'Inicio', icono: <HomeOutlinedIcon />, permiso: null },
  {
    ruta: '/pacientes',
    etiqueta: 'Pacientes',
    icono: <HotelOutlinedIcon />,
    permiso: 'pacientes.ver',
  },
  {
    ruta: '/usuarios',
    etiqueta: 'Usuarios',
    icono: <ManageAccountsOutlinedIcon />,
    permiso: 'usuarios.gestionar',
  },
];

/** Opciones que habilitan el rol y los permisos adicionales del usuario (RF15). */
export const opcionesDelMenu = (permisos: string[]) =>
  OPCIONES_DEL_MENU.filter((o) => o.permiso === null || permisos.includes(o.permiso));
