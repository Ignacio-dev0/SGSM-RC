import { useRef } from 'react';
import { Box, Chip, InputAdornment } from '@mui/material';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import SearchIcon from '@mui/icons-material/Search';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { pacientesApi, useSalas } from '../../api/pacientes';
import type { Paciente } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { Selector } from '../../componentes/Selector';
import { Tabla, type Columna } from '../../componentes/Tabla';
import { edad } from '../../utilidades/formato';
import { ColumnaPrincipal, GrillaDeFiltros, Recargando } from '../../utilidades/listado';
import { oracionDe, pasosParaProbar } from '../../utilidades/sinResultados';
import { useFiltrosEnUrl } from '../../utilidades/useFiltrosEnUrl';
import { useRetardo } from '../../utilidades/useRetardo';
import { formatearCama } from './etiquetas';

const COLUMNAS: Columna<Paciente>[] = [
  {
    titulo: 'Cama',
    valor: (p) => (p.cama ? <strong>{formatearCama(p.cama.numero)}</strong> : '—'),
    ancho: 90,
  },
  {
    titulo: 'Paciente',
    valor: (p) => <ColumnaPrincipal>{`${p.apellido}, ${p.nombre}`}</ColumnaPrincipal>,
  },
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

/** Vista inicial: los internados, sin búsqueda. Lo que se aparta de esto va en la URL. */
const FILTROS_INICIALES = { texto: '', salaId: '', estado: 'INTERNADO' };

/** Qué no se encontró y qué probar: la causa y el paso siguiente, con lo que se buscó. */
function mensajeSinPacientes(
  { texto, salaId, estado }: typeof FILTROS_INICIALES,
  conFiltros: boolean,
  nombreSala: string | undefined,
) {
  const buscado = texto.trim();
  const causa = oracionDe([
    'No hay',
    estado === 'INTERNADO'
      ? 'pacientes internados'
      : estado === 'EGRESADO'
        ? 'pacientes egresados'
        : 'pacientes',
    salaId && `en ${nombreSala ?? 'la sala elegida'}`,
    buscado && `que coincidan con «${buscado}»`,
  ]);
  if (!conFiltros) return `${causa} Cuando se interne uno, va a aparecer en esta lista.`;
  const pasos = pasosParaProbar([
    buscado && 'pruebe con otro apellido, DNI o cama',
    salaId && 'elija otra sala',
    estado && 'cambie Estado a Todos',
  ]);
  return `${causa} ${pasos}`;
}

/**
 * Búsqueda de pacientes (T206 · CU12). Pensada para encontrar al paciente en dos toques:
 * escribir parte del apellido, el DNI o la cama, y tocar la fila. Los filtros y la página viven
 * en la URL: al abrir una ficha y volver, la búsqueda sigue ahí.
 */
export function BusquedaPacientes() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const { tienePermiso } = useSesion();
  const puedeInternar = tienePermiso('pacientes.gestionar');
  const salas = useSalas();
  const filtros = useFiltrosEnUrl(FILTROS_INICIALES);
  const { texto, salaId, estado } = filtros.valores;
  const textoBuscado = useRetardo(texto);
  const campoBusqueda = useRef<HTMLInputElement>(null);

  // Al escribir se espera a que termine de tipear; al vaciar el campo se aplica enseguida.
  const aplicados = { texto: texto ? textoBuscado : '', salaId, estado };
  const pedido = { ...aplicados, pagina: filtros.pagina };
  const consulta = useQuery({
    queryKey: ['pacientes', pedido],
    queryFn: () => pacientesApi.buscar(pedido),
    placeholderData: keepPreviousData,
  });

  // Solo con la respuesta ya asentada y sin error: un fallo de carga no es "no hay pacientes".
  const sinResultados =
    consulta.isSuccess && !consulta.isFetching && consulta.data.data.length === 0;
  const conFiltros = filtros.hayFiltros(aplicados);
  const nombreSala = salas.data?.find((s) => String(s.id) === salaId)?.nombre;
  const quitarFiltros = () => {
    filtros.quitarFiltros();
    // El botón desaparece al recargar la lista: el foco pasa al campo para buscar de nuevo.
    campoBusqueda.current?.focus();
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Pacientes"
        acciones={
          puedeInternar && (
            <Boton
              startIcon={<PersonAddAlt1OutlinedIcon />}
              onClick={() => navegar('/pacientes/nuevo')}
            >
              Internar paciente
            </Boton>
          )
        }
      />

      <GrillaDeFiltros columnas="2fr 1fr 1fr">
        <CampoTexto
          etiqueta="Buscar por apellido, DNI o cama"
          valor={texto}
          alCambiar={(v) => filtros.fijar({ texto: v })}
          type="search"
          autoFocus
          inputRef={campoBusqueda}
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
          alCambiar={(v) => filtros.fijar({ salaId: v })}
          textoVacio="Todas"
          opciones={(salas.data ?? []).map((s) => ({ valor: String(s.id), etiqueta: s.nombre }))}
        />
        <Selector
          etiqueta="Estado"
          valor={estado}
          alCambiar={(v) => filtros.fijar({ estado: v })}
          opciones={[
            { valor: 'INTERNADO', etiqueta: 'Internados' },
            { valor: 'EGRESADO', etiqueta: 'Egresados' },
            { valor: '', etiqueta: 'Todos' },
          ]}
        />
      </GrillaDeFiltros>

      {consulta.isError ? (
        // Un fallo de carga no se lee como "no hay pacientes": sin tabla ni mensaje de vacío.
        <ErrorDeCarga
          que="la lista de pacientes"
          error={consulta.error}
          alReintentar={() => void consulta.refetch()}
        />
      ) : (
        <Recargando activo={consulta.isFetching && consulta.isPlaceholderData}>
          <Tabla
            titulo="Pacientes"
            columnas={COLUMNAS}
            filas={consulta.data?.data ?? []}
            claveFila={(p) => p.id}
            cargando={consulta.isFetching}
            mensajeVacio={mensajeSinPacientes(aplicados, conFiltros, nombreSala)}
            // La ficha vuelve a esta búsqueda, con sus filtros, con la flecha Volver.
            alTocarFila={(p) =>
              navegar(`/pacientes/${p.id}`, {
                state: { volverA: ubicacion.pathname + ubicacion.search },
              })
            }
            etiquetaFila={(p) => `Abrir ${p.apellido}, ${p.nombre}`}
            {...(consulta.data && {
              paginacion: { ...consulta.data.meta, alCambiarPagina: filtros.irAPagina },
            })}
          />
        </Recargando>
      )}
      {sinResultados && (conFiltros || puedeInternar) && (
        <Box
          role="group"
          aria-label="Qué puede hacer ahora"
          sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}
        >
          {conFiltros && (
            <Boton variante="secundario" onClick={quitarFiltros}>
              Quitar filtros
            </Boton>
          )}
          {puedeInternar && (
            <Boton
              startIcon={<PersonAddAlt1OutlinedIcon />}
              onClick={() => navegar('/pacientes/nuevo')}
            >
              Internar paciente
            </Boton>
          )}
        </Box>
      )}
    </>
  );
}
