import type { ReactNode } from 'react';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import FaceOutlinedIcon from '@mui/icons-material/FaceOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import PlaylistAddOutlinedIcon from '@mui/icons-material/PlaylistAddOutlined';
import GroupAddOutlinedIcon from '@mui/icons-material/GroupAddOutlined';

export interface Tarea {
  ruta: string;
  /** Con las palabras de quien la hace (PRODUCT.md, tareas núcleo). */
  etiqueta: string;
  descripcion: string;
  icono: ReactNode;
  permiso: string;
  /** Tarea de administración del sistema: quien gestiona usuarios la ve antes que las clínicas. */
  gestion?: boolean;
}

/**
 * Tareas del día que ofrece el Inicio, ordenadas por frecuencia: primero lo de enfermería al
 * lado de la cama, después lo médico y al final la gestión. Cada rol ve solo las que puede hacer;
 * quien gestiona usuarios ve primero las de gestión (ver `tareasDe`).
 */
export const TAREAS: Tarea[] = [
  {
    ruta: '/recordatorios',
    etiqueta: 'Tomas para dar ahora',
    descripcion: 'Las atrasadas y las de la próxima media hora, de la más urgente a la menos',
    icono: <AlarmOutlinedIcon />,
    permiso: 'recordatorios.atender',
  },
  {
    ruta: '/suministros/medicamento',
    etiqueta: 'Administrar medicamento',
    descripcion: 'Dar una toma y registrarla con su rostro',
    icono: <MedicationOutlinedIcon />,
    permiso: 'suministros.registrar',
  },
  {
    ruta: '/suministros/insumos',
    etiqueta: 'Registrar insumos',
    descripcion: 'Pañales, gasas, filtros… usados con un paciente',
    icono: <Inventory2OutlinedIcon />,
    permiso: 'suministros.registrar',
  },
  {
    ruta: '/pacientes',
    etiqueta: 'Buscar paciente',
    descripcion: 'Por apellido, DNI o cama',
    icono: <PersonSearchOutlinedIcon />,
    permiso: 'pacientes.ver',
  },
  {
    ruta: '/pacientes/nuevo',
    etiqueta: 'Internar paciente',
    descripcion: 'Registrar el ingreso y asignar la cama',
    icono: <PersonAddAltOutlinedIcon />,
    permiso: 'pacientes.gestionar',
  },
  {
    ruta: '/suministros',
    etiqueta: 'Ver lo que se registró',
    descripcion: 'Medicamentos e insumos dados, por paciente, fecha o responsable',
    icono: <HistoryOutlinedIcon />,
    permiso: 'suministros.ver',
  },
  {
    ruta: '/usuarios/nuevo',
    etiqueta: 'Nuevo usuario',
    descripcion: 'Registrar a alguien del personal con su rol',
    icono: <GroupAddOutlinedIcon />,
    permiso: 'usuarios.gestionar',
    gestion: true,
  },
  {
    ruta: '/biometria',
    etiqueta: 'Registrar el rostro del personal',
    descripcion: 'Sin rostro registrado no se pueden confirmar suministros',
    icono: <FaceOutlinedIcon />,
    permiso: 'biometria.gestionar',
    gestion: true,
  },
  {
    ruta: '/catalogo',
    etiqueta: 'Agregar al catálogo',
    descripcion: 'Medicamentos e insumos que se pueden prescribir y registrar',
    icono: <PlaylistAddOutlinedIcon />,
    permiso: 'catalogo.gestionar',
    gestion: true,
  },
];

/**
 * Las tareas que puede hacer quien tiene esos permisos, en el orden en que se muestran: el de
 * `TAREAS`, salvo para quien administra el sistema (`usuarios.gestionar`), cuya gestión va
 * primero. La primera es la más frecuente del rol y el Inicio la destaca.
 */
export function tareasDe(permisos: string[]) {
  const posibles = TAREAS.filter((t) => permisos.includes(t.permiso));
  if (!permisos.includes('usuarios.gestionar')) return posibles;
  return [...posibles.filter((t) => t.gestion), ...posibles.filter((t) => !t.gestion)];
}
