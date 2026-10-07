import type { ReactNode } from 'react';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import FaceOutlinedIcon from '@mui/icons-material/FaceOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import HotelOutlinedIcon from '@mui/icons-material/HotelOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import ManageSearchOutlinedIcon from '@mui/icons-material/ManageSearchOutlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';

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
    ruta: '/recordatorios',
    etiqueta: 'Recordatorios',
    icono: <AlarmOutlinedIcon />,
    permiso: 'recordatorios.ver',
  },
  {
    ruta: '/pacientes',
    etiqueta: 'Pacientes',
    icono: <HotelOutlinedIcon />,
    permiso: 'pacientes.ver',
  },
  {
    ruta: '/suministros',
    etiqueta: 'Suministros',
    icono: <MedicationOutlinedIcon />,
    permiso: 'suministros.ver',
  },
  {
    // E6: lo que se consumió en un período, para el administrador y el médico (S17).
    ruta: '/reportes',
    etiqueta: 'Reportes',
    icono: <AssessmentOutlinedIcon />,
    permiso: 'reportes.ver',
  },
  {
    ruta: '/catalogo',
    etiqueta: 'Catálogo',
    icono: <Inventory2OutlinedIcon />,
    permiso: 'catalogo.gestionar',
  },
  {
    ruta: '/biometria',
    etiqueta: 'Biometría',
    icono: <FaceOutlinedIcon />,
    permiso: 'biometria.gestionar',
  },
  {
    ruta: '/usuarios',
    etiqueta: 'Usuarios',
    icono: <ManageAccountsOutlinedIcon />,
    permiso: 'usuarios.gestionar',
  },
  {
    // E6: quién hizo qué y cuándo, con los valores de antes y después (CU35).
    ruta: '/auditoria',
    etiqueta: 'Auditoría',
    icono: <ManageSearchOutlinedIcon />,
    permiso: 'auditoria.ver',
  },
];

/** Opciones que habilitan el rol y los permisos adicionales del usuario (RF15). */
export const opcionesDelMenu = (permisos: string[]) =>
  OPCIONES_DEL_MENU.filter((o) => o.permiso === null || permisos.includes(o.permiso));
