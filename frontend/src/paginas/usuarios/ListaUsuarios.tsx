import { useRef } from 'react';
import { Box, InputAdornment } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Usuario } from '../../api/tipos';
import { useRoles, usuariosApi } from '../../api/usuarios';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { ChipEstado, type EstadoChip } from '../../componentes/ChipEstado';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { Selector } from '../../componentes/Selector';
import { Tabla, type Columna } from '../../componentes/Tabla';
import { ColumnaPrincipal, GrillaDeFiltros, Recargando } from '../../utilidades/listado';
import { oracionDe, pasosParaProbar } from '../../utilidades/sinResultados';
import { useFiltrosEnUrl } from '../../utilidades/useFiltrosEnUrl';
import { useRetardo } from '../../utilidades/useRetardo';

/** Dada de baja, bloqueada por intentos fallidos (todavía vigente) o activa. */
function estadoDeLaCuenta(u: Usuario): EstadoChip {
  if (!u.activo) return 'DADO_DE_BAJA';
  return u.bloqueadoHasta && new Date(u.bloqueadoHasta) > new Date() ? 'BLOQUEADO' : 'ACTIVO';
}

const COLUMNAS: Columna<Usuario>[] = [
  {
    titulo: 'Nombre',
    valor: (u) => <ColumnaPrincipal>{`${u.apellido}, ${u.nombre}`}</ColumnaPrincipal>,
  },
  { titulo: 'Usuario', valor: (u) => u.nombreUsuario },
  { titulo: 'DNI', valor: (u) => u.dni },
  { titulo: 'Rol', valor: (u) => u.rol.nombre },
  {
    titulo: 'Estado',
    valor: (u) => <ChipEstado estado={estadoDeLaCuenta(u)} />,
  },
  {
    titulo: 'Rostro',
    valor: (u) => (u.tieneBiometria ? 'Registrado' : 'Sin registrar'),
  },
];

/** Vista inicial: los usuarios activos, sin búsqueda. Lo que se aparta de esto va en la URL. */
const FILTROS_INICIALES = { texto: '', rol: '', activo: 'true' };

/** Qué no se encontró y qué probar: la causa y el paso siguiente, con lo que se buscó. */
function mensajeSinUsuarios(
  { texto, rol, activo }: typeof FILTROS_INICIALES,
  conFiltros: boolean,
  nombreRol: string | undefined,
) {
  const buscado = texto.trim();
  const causa = oracionDe([
    'No hay',
    activo === 'true'
      ? 'usuarios activos'
      : activo === 'false'
        ? 'usuarios dados de baja'
        : 'usuarios',
    rol && `con rol ${nombreRol ?? rol}`,
    buscado && `que coincidan con «${buscado}»`,
  ]);
  if (!conFiltros) return `${causa} Use «Nuevo usuario» para registrar al personal.`;
  const pasos = pasosParaProbar([
    buscado && 'pruebe con otro apellido, usuario o DNI',
    rol && 'elija otro rol',
    activo && 'cambie Estado a Todos',
  ]);
  return `${causa} ${pasos}`;
}

/**
 * Listado y búsqueda de usuarios (T110 · CU02). Los filtros y la página viven en la URL: al
 * abrir un usuario y volver, la búsqueda sigue ahí.
 */
export function ListaUsuarios() {
  const navegar = useNavigate();
  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso;
  const filtros = useFiltrosEnUrl(FILTROS_INICIALES);
  const { texto, rol, activo } = filtros.valores;
  const textoBuscado = useRetardo(texto);
  const campoBusqueda = useRef<HTMLInputElement>(null);
  const roles = useRoles();

  // Al escribir se espera a que termine de tipear; al vaciar el campo se aplica enseguida.
  const aplicados = { texto: texto ? textoBuscado : '', rol, activo };
  const pedido = { ...aplicados, pagina: filtros.pagina };
  const consulta = useQuery({
    queryKey: ['usuarios', pedido],
    queryFn: () => usuariosApi.buscar(pedido),
    placeholderData: keepPreviousData,
  });

  // Solo con la respuesta ya asentada y sin error: un fallo de carga no es "no hay usuarios".
  const sinResultados =
    consulta.isSuccess && !consulta.isFetching && consulta.data.data.length === 0;
  const conFiltros = filtros.hayFiltros(aplicados);
  const nombreRol = roles.data?.find((r) => r.codigo === rol)?.nombre;
  const quitarFiltros = () => {
    filtros.quitarFiltros();
    // El botón desaparece al recargar la lista: el foco pasa al campo para buscar de nuevo.
    campoBusqueda.current?.focus();
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Usuarios"
        subtitulo="Personal con acceso al sistema"
        acciones={
          <Boton startIcon={<AddIcon />} onClick={() => navegar('/usuarios/nuevo')}>
            Nuevo usuario
          </Boton>
        }
      />
      {aviso && <Alerta tipo="exito">{aviso}</Alerta>}

      <GrillaDeFiltros columnas="2fr 1fr 1fr">
        <CampoTexto
          etiqueta="Buscar por apellido, usuario o DNI"
          valor={texto}
          alCambiar={(v) => filtros.fijar({ texto: v })}
          type="search"
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
          etiqueta="Rol"
          valor={rol}
          alCambiar={(v) => filtros.fijar({ rol: v })}
          textoVacio="Todos"
          opciones={(roles.data ?? []).map((r) => ({ valor: r.codigo, etiqueta: r.nombre }))}
        />
        <Selector
          etiqueta="Estado"
          valor={activo}
          alCambiar={(v) => filtros.fijar({ activo: v })}
          opciones={[
            { valor: 'true', etiqueta: 'Activos' },
            { valor: 'false', etiqueta: 'Dados de baja' },
            { valor: '', etiqueta: 'Todos' },
          ]}
        />
      </GrillaDeFiltros>

      {consulta.isError ? (
        // Un fallo de carga no se lee como "no hay usuarios": sin tabla ni mensaje de vacío.
        <ErrorDeCarga
          que="la lista de usuarios"
          error={consulta.error}
          alReintentar={() => void consulta.refetch()}
        />
      ) : (
        <Recargando activo={consulta.isFetching && consulta.isPlaceholderData}>
          <Tabla
            titulo="Usuarios"
            columnas={COLUMNAS}
            filas={consulta.data?.data ?? []}
            claveFila={(u) => u.id}
            cargando={consulta.isFetching}
            mensajeVacio={mensajeSinUsuarios(aplicados, conFiltros, nombreRol)}
            alTocarFila={(u) => navegar(`/usuarios/${u.id}`)}
            etiquetaFila={(u) => `Abrir ${u.apellido}, ${u.nombre}`}
            {...(consulta.data && {
              paginacion: { ...consulta.data.meta, alCambiarPagina: filtros.irAPagina },
            })}
          />
        </Recargando>
      )}
      {sinResultados && conFiltros && (
        <Box
          role="group"
          aria-label="Qué puede hacer ahora"
          sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}
        >
          <Boton variante="secundario" onClick={quitarFiltros}>
            Quitar filtros
          </Boton>
        </Box>
      )}
    </>
  );
}
