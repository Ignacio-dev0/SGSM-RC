import { useState } from 'react';
import { Box, Chip, InputAdornment } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import type { Usuario } from '../../api/tipos';
import { useRoles, usuariosApi } from '../../api/usuarios';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Selector } from '../../componentes/Selector';
import { Tabla, type Columna } from '../../componentes/Tabla';
import { useRetardo } from '../../utilidades/useRetardo';

const COLUMNAS: Columna<Usuario>[] = [
  { titulo: 'Apellido y nombre', valor: (u) => `${u.apellido}, ${u.nombre}` },
  { titulo: 'Usuario', valor: (u) => u.nombreUsuario },
  { titulo: 'DNI', valor: (u) => u.dni },
  { titulo: 'Rol', valor: (u) => u.rol.nombre },
  {
    titulo: 'Estado',
    valor: (u) =>
      !u.activo ? (
        <Chip label="Inactivo" size="small" />
      ) : u.bloqueadoHasta && new Date(u.bloqueadoHasta) > new Date() ? (
        <Chip label="Bloqueado" size="small" color="warning" />
      ) : (
        <Chip label="Activo" size="small" color="success" variant="outlined" />
      ),
  },
  {
    titulo: 'Rostro',
    valor: (u) => (u.tieneBiometria ? 'Registrado' : 'Sin registrar'),
  },
];

/** Listado y búsqueda de usuarios (T110 · CU02). */
export function ListaUsuarios() {
  const navegar = useNavigate();
  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso;
  const [texto, setTexto] = useState('');
  const [rol, setRol] = useState('');
  const [activo, setActivo] = useState('true');
  const [pagina, setPagina] = useState(1);
  const textoBuscado = useRetardo(texto);
  const roles = useRoles();

  const filtros = { texto: textoBuscado, rol, activo, pagina };
  const consulta = useQuery({
    queryKey: ['usuarios', filtros],
    queryFn: () => usuariosApi.buscar(filtros),
    placeholderData: keepPreviousData,
  });

  const cambiarFiltro = (aplicar: () => void) => {
    aplicar();
    setPagina(1);
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
          etiqueta="Buscar por apellido, usuario o DNI"
          valor={texto}
          alCambiar={(v) => cambiarFiltro(() => setTexto(v))}
          type="search"
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
          alCambiar={(v) => cambiarFiltro(() => setRol(v))}
          textoVacio="Todos"
          opciones={(roles.data ?? []).map((r) => ({ valor: r.codigo, etiqueta: r.nombre }))}
        />
        <Selector
          etiqueta="Estado"
          valor={activo}
          alCambiar={(v) => cambiarFiltro(() => setActivo(v))}
          opciones={[
            { valor: 'true', etiqueta: 'Activos' },
            { valor: 'false', etiqueta: 'Inactivos' },
            { valor: '', etiqueta: 'Todos' },
          ]}
        />
      </Box>

      <Tabla
        titulo="Usuarios"
        columnas={COLUMNAS}
        filas={consulta.data?.data ?? []}
        claveFila={(u) => u.id}
        cargando={consulta.isFetching}
        mensajeVacio="No hay usuarios que coincidan con la búsqueda"
        alTocarFila={(u) => navegar(`/usuarios/${u.id}`)}
        {...(consulta.data && {
          paginacion: { ...consulta.data.meta, alCambiarPagina: setPagina },
        })}
      />
    </>
  );
}
