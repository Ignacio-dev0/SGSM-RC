import { useState } from 'react';
import { Box, Chip, InputAdornment } from '@mui/material';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import SearchIcon from '@mui/icons-material/Search';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import { pacientesApi, useSalas } from '../../api/pacientes';
import type { Paciente } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Selector } from '../../componentes/Selector';
import { Tabla, type Columna } from '../../componentes/Tabla';
import { edad } from '../../utilidades/formato';
import { useRetardo } from '../../utilidades/useRetardo';

const COLUMNAS: Columna<Paciente>[] = [
  {
    titulo: 'Cama',
    valor: (p) => (p.cama ? <strong>{p.cama.numero}</strong> : '—'),
    ancho: 90,
  },
  { titulo: 'Apellido y nombre', valor: (p) => `${p.apellido}, ${p.nombre}` },
  { titulo: 'DNI', valor: (p) => p.dni },
  { titulo: 'Edad', valor: (p) => `${edad(p.fechaNacimiento)} años` },
  { titulo: 'Sala', valor: (p) => p.cama?.sala.nombre ?? '—' },
  {
    titulo: 'Estado',
    valor: (p) =>
      p.estado === 'INTERNADO' ? (
        <Chip label="Internado" size="small" color="primary" variant="outlined" />
      ) : (
        <Chip label="Egresado" size="small" />
      ),
  },
];

/**
 * Búsqueda de pacientes (T206 · CU12). Pensada para encontrar al paciente en dos toques:
 * escribir parte del apellido, el DNI o la cama, y tocar la fila.
 */
export function BusquedaPacientes() {
  const navegar = useNavigate();
  const { tienePermiso } = useSesion();
  const salas = useSalas();
  const [texto, setTexto] = useState('');
  const [salaId, setSalaId] = useState('');
  const [estado, setEstado] = useState('INTERNADO');
  const [pagina, setPagina] = useState(1);
  const textoBuscado = useRetardo(texto);

  const filtros = { texto: textoBuscado, salaId, estado, pagina };
  const consulta = useQuery({
    queryKey: ['pacientes', filtros],
    queryFn: () => pacientesApi.buscar(filtros),
    placeholderData: keepPreviousData,
  });

  const filtrar = (aplicar: () => void) => {
    aplicar();
    setPagina(1);
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Pacientes"
        acciones={
          tienePermiso('pacientes.gestionar') && (
            <Boton
              startIcon={<PersonAddAlt1OutlinedIcon />}
              onClick={() => navegar('/pacientes/nuevo')}
            >
              Internar paciente
            </Boton>
          )
        }
      />
      {consulta.isError && <Alerta tipo="error">{mensajeDeError(consulta.error)}</Alerta>}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' },
          mb: 2,
        }}
      >
        <CampoTexto
          etiqueta="Buscar por apellido, DNI o cama"
          valor={texto}
          alCambiar={(v) => filtrar(() => setTexto(v))}
          type="search"
          autoFocus
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
        />
        <Selector
          etiqueta="Sala"
          valor={salaId}
          alCambiar={(v) => filtrar(() => setSalaId(v))}
          textoVacio="Todas"
          opciones={(salas.data ?? []).map((s) => ({ valor: String(s.id), etiqueta: s.nombre }))}
        />
        <Selector
          etiqueta="Estado"
          valor={estado}
          alCambiar={(v) => filtrar(() => setEstado(v))}
          opciones={[
            { valor: 'INTERNADO', etiqueta: 'Internados' },
            { valor: 'EGRESADO', etiqueta: 'Egresados' },
            { valor: '', etiqueta: 'Todos' },
          ]}
        />
      </Box>

      <Tabla
        titulo="Pacientes"
        columnas={COLUMNAS}
        filas={consulta.data?.data ?? []}
        claveFila={(p) => p.id}
        cargando={consulta.isFetching}
        mensajeVacio="No se encontraron pacientes con esos datos"
        alTocarFila={(p) => navegar(`/pacientes/${p.id}`)}
        {...(consulta.data && {
          paginacion: { ...consulta.data.meta, alCambiarPagina: setPagina },
        })}
      />
    </>
  );
}
