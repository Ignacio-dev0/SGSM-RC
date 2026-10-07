import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { biometriaApi, type PersonalBiometria } from '../../api/biometria';
import { Boton } from '../../componentes/Boton';
import { ChipEstado } from '../../componentes/ChipEstado';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { Tabla, type Columna } from '../../componentes/Tabla';
import { formatearFechaHora } from '../../utilidades/formato';
import { ColumnaPrincipal } from '../../utilidades/listado';

const COLUMNAS: Columna<PersonalBiometria>[] = [
  // La persona, en negrita y con un ancho mínimo: el encabezado corto no se parte en tablet.
  {
    titulo: 'Nombre',
    valor: (u) => <ColumnaPrincipal>{`${u.apellido}, ${u.nombre}`}</ColumnaPrincipal>,
  },
  { titulo: 'Usuario', valor: (u) => u.nombreUsuario },
  { titulo: 'Rol', valor: (u) => u.rol },
  {
    titulo: 'Rostro',
    valor: (u) => <ChipEstado estado={u.registrado ? 'REGISTRADO' : 'SIN_REGISTRAR'} />,
  },
  { titulo: 'Actualizado', valor: (u) => formatearFechaHora(u.actualizadoEn) },
];

const MENSAJE_SIN_PERSONAL =
  'No hay personal activo. Cuando se registre un usuario nuevo, va a aparecer en esta lista para cargar su rostro.';

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
      {personal.isError ? (
        // Un fallo de carga no se lee como "no hay personal": sin tabla ni mensaje de vacío.
        <ErrorDeCarga
          que="la lista del personal"
          error={personal.error}
          alReintentar={() => void personal.refetch()}
        />
      ) : (
        <Tabla
          titulo="Personal"
          columnas={COLUMNAS}
          filas={personal.data ?? []}
          claveFila={(u) => u.id}
          cargando={personal.isFetching}
          mensajeVacio={MENSAJE_SIN_PERSONAL}
          alTocarFila={(u) => navegar(`/biometria/${u.id}`)}
          etiquetaFila={(u) => `Abrir el registro facial de ${u.apellido}, ${u.nombre}`}
        />
      )}
    </>
  );
}
