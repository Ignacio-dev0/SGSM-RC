import { Chip } from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { biometriaApi, type PersonalBiometria } from '../../api/biometria';
import { mensajeDeError } from '../../api/cliente';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Tabla, type Columna } from '../../componentes/Tabla';
import { formatearFechaHora } from '../../utilidades/formato';

const COLUMNAS: Columna<PersonalBiometria>[] = [
  { titulo: 'Apellido y nombre', valor: (u) => `${u.apellido}, ${u.nombre}` },
  { titulo: 'Usuario', valor: (u) => u.nombreUsuario },
  { titulo: 'Rol', valor: (u) => u.rol },
  {
    titulo: 'Rostro',
    valor: (u) =>
      u.registrado ? (
        <Chip size="small" color="success" label="Registrado" />
      ) : (
        <Chip size="small" color="warning" variant="outlined" label="Sin registrar" />
      ),
  },
  { titulo: 'Actualizado', valor: (u) => formatearFechaHora(u.actualizadoEn) },
];

/** Personal y estado de su registro facial (T406 · CU07–CU09). */
export function GestionBiometria() {
  const navegar = useNavigate();
  const personal = useQuery({
    queryKey: ['biometria', 'personal'],
    queryFn: biometriaApi.personal,
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Biometría del personal"
        subtitulo="Quien no tiene el rostro registrado no puede registrar suministros."
        acciones={
          <Boton
            variante="secundario"
            startIcon={<ScienceOutlinedIcon />}
            onClick={() => navegar('/biometria/prueba')}
          >
            Prueba de reconocimiento
          </Boton>
        }
      />
      {personal.isError && <Alerta tipo="error">{mensajeDeError(personal.error)}</Alerta>}
      <Tabla
        titulo="Personal"
        columnas={COLUMNAS}
        filas={personal.data ?? []}
        claveFila={(u) => u.id}
        cargando={personal.isFetching}
        alTocarFila={(u) => navegar(`/biometria/${u.id}`)}
      />
    </>
  );
}
