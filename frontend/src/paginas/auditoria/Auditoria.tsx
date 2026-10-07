import { useState } from 'react';
import { Box } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { auditoriaApi, type EntradaAuditoria } from '../../api/auditoria';
import { ErrorApi, erroresPorCampo } from '../../api/cliente';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { Tabla, type Columna } from '../../componentes/Tabla';
import {
  formatearFechaHora,
  formatearFechaHoraCorta,
  rangoDeFechas,
} from '../../utilidades/formato';
import { ColumnaPrincipal, Recargando } from '../../utilidades/listado';
import { oracionDe, pasosParaProbar } from '../../utilidades/sinResultados';
import { useFiltrosEnUrl } from '../../utilidades/useFiltrosEnUrl';
import { DetalleAuditoria } from './DetalleAuditoria';
import { FiltrosAuditoria, type ValoresFiltros } from './FiltrosAuditoria';
import { accionEnPalabras, entidadConId, entidadEnPalabras, pacienteConDni } from './palabras';

const COLUMNAS: Columna<EntradaAuditoria>[] = [
  { titulo: 'Fecha y hora', valor: (e) => formatearFechaHora(e.fechaHora), ancho: 170 },
  { titulo: 'Usuario', valor: (e) => e.usuario.nombre },
  {
    titulo: 'Acción',
    valor: (e) => <ColumnaPrincipal ancho={130}>{accionEnPalabras(e.accion)}</ColumnaPrincipal>,
  },
  { titulo: 'Registro', valor: (e) => entidadConId(e.entidad, e.entidadId) },
  { titulo: 'Paciente', valor: (e) => (e.paciente ? pacienteConDni(e.paciente) : null) },
];

/** Vista inicial: todo, de lo más reciente a lo más viejo. Lo que se aparta va en la URL. */
const FILTROS_INICIALES: ValoresFiltros = {
  desde: '',
  hasta: '',
  usuarioId: '',
  pacienteId: '',
  accion: '',
  entidad: '',
};

/** Mismo mensaje que el servidor si "hasta" es anterior a "desde" (no hay límite de días). */
const validarFechas = ({ desde, hasta }: ValoresFiltros) =>
  desde && hasta && desde > hasta
    ? { hasta: 'La fecha "hasta" no puede ser anterior a "desde"' }
    : {};

/** Qué no se encontró y qué probar, con los filtros usados. */
function mensajeSinRegistros(f: ValoresFiltros, conFiltros: boolean, entradas: EntradaAuditoria[]) {
  if (!conFiltros) return 'Todavía no hay registros de auditoría.';
  const usuario = entradas.find((e) => String(e.usuario.id) === f.usuarioId)?.usuario.nombre;
  const causa = oracionDe([
    'No hay registros de auditoría',
    f.usuarioId && `de ${usuario ?? 'el usuario elegido'}`,
    f.pacienteId && 'sobre el paciente elegido',
    f.accion && `con la acción "${accionEnPalabras(f.accion)}"`,
    f.entidad && `de la entidad "${entidadEnPalabras(f.entidad)}"`,
    rangoDeFechas(f.desde, f.hasta),
  ]);
  const pasos = pasosParaProbar([
    f.usuarioId && 'elija otro usuario',
    f.pacienteId && 'elija otro paciente',
    f.accion && 'cambie Acción a Todas',
    f.entidad && 'cambie Entidad a Todas',
    (f.desde || f.hasta) && 'amplíe las fechas',
  ]);
  return `${causa} ${pasos}`;
}

/**
 * Consulta de la auditoría (E6 · T607 · CU35): quién hizo qué y cuándo, con filtros en la URL y
 * paginada de a 50, de lo más reciente a lo más viejo. Al abrir un registro (toque o teclado) se ve
 * el valor de antes y el de después de cada campo, con lo que cambió marcado.
 */
export function Auditoria() {
  const filtros = useFiltrosEnUrl(FILTROS_INICIALES);
  const valores = filtros.valores;
  const [abierta, setAbierta] = useState<EntradaAuditoria | null>(null);
  const erroresCliente = validarFechas(valores);
  const valido = !erroresCliente.hasta;

  const pedido = { ...valores, pagina: filtros.pagina };
  const consulta = useQuery({
    queryKey: ['auditoria', pedido],
    queryFn: () => auditoriaApi.buscar(pedido),
    enabled: valido,
    placeholderData: keepPreviousData,
  });

  const entradas = consulta.data?.data ?? [];
  const erroresServidor = erroresPorCampo(consulta.error);
  const errores = {
    desde: erroresServidor.desde,
    hasta: erroresCliente.hasta ?? erroresServidor.hasta,
  };
  const conFiltros = filtros.hayFiltros();
  const sinResultados = consulta.isSuccess && !consulta.isFetching && entradas.length === 0;
  const rechazado = consulta.error instanceof ErrorApi && consulta.error.estado === 400;

  return (
    <>
      <EncabezadoPagina
        titulo="Auditoría"
        subtitulo="Quién hizo qué y cuándo, con los valores de antes y después"
      />
      <FiltrosAuditoria
        valores={valores}
        alCambiar={filtros.fijar}
        errores={errores}
        entradas={entradas}
      />
      {!valido ? null : rechazado ? (
        // Un 400 dice qué corregir en los filtros: reintentar daría lo mismo.
        <Alerta tipo="error">{`No se pudo consultar la auditoría. ${consulta.error?.message ?? ''}`}</Alerta>
      ) : consulta.isError ? (
        <ErrorDeCarga
          que="la auditoría"
          error={consulta.error}
          alReintentar={() => void consulta.refetch()}
        />
      ) : (
        <Recargando activo={consulta.isFetching && consulta.isPlaceholderData}>
          <Tabla
            titulo="Registros de auditoría"
            columnas={COLUMNAS}
            filas={entradas}
            claveFila={(e) => e.id}
            cargando={consulta.isFetching}
            mensajeVacio={mensajeSinRegistros(valores, conFiltros, entradas)}
            alTocarFila={setAbierta}
            etiquetaFila={(e) =>
              `Ver el detalle: ${accionEnPalabras(e.accion)} · ${entidadConId(e.entidad, e.entidadId)}, ${formatearFechaHoraCorta(e.fechaHora)}`
            }
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
          <Boton variante="secundario" onClick={filtros.quitarFiltros}>
            Quitar filtros
          </Boton>
        </Box>
      )}
      {abierta && <DetalleAuditoria entrada={abierta} alCerrar={() => setAbierta(null)} />}
    </>
  );
}
