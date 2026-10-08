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
  /** Se resalta solo en su ruta exacta, no en las que cuelgan de ella (F10). */
  exacta?: boolean;
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
    // Es el historial: Administrar medicamento y Registrar insumos cuelgan de la ruta, pero no
    // son esta opción (F10).
    exacta: true,
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

/** Pantallas de una tarea que cuelgan de "Suministros" pero no son esa opción (el historial). */
const PANTALLAS_DE_TAREA = ['/suministros/medicamento', '/suministros/insumos'];

/**
 * Qué opción resaltar cuando no es la de la ruta (F10 · D161): en Administrar medicamento y
 * Registrar insumos, la sección desde la que se trabaja, la misma a la que lleva "Volver":
 * Recordatorios (`desde=recordatorios`), Pacientes (con un paciente elegido) o ninguna.
 * `undefined`: la de la ruta, como siempre.
 */
export function rutaResaltada(pathname: string, search: string): string | null | undefined {
  if (!PANTALLAS_DE_TAREA.includes(pathname)) return undefined;
  const parametros = new URLSearchParams(search);
  if (parametros.get('desde') === 'recordatorios') return '/recordatorios';
  if (parametros.get('pacienteId')) return '/pacientes';
  return null;
}
