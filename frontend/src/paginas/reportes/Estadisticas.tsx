import { Box, Paper, Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSalas } from '../../api/pacientes';
import { reportesApi, type Estadisticas as DatosEstadisticas } from '../../api/reportes';
import { useSesion } from '../../auth/useSesion';
import { Cargando } from '../../componentes/EstadoDeCarga';
import { Recargando } from '../../utilidades/listado';
import { ErrorDelReporte, PeriodoACorregir, QuitarFiltros, ResumenYDescargas } from './comunes';
import { erroresDeFecha, mensajeSinSuministros, periodoEnFrase } from './mensajes';
import { useDescarga } from './Descargas';
import { salaDelResumen, tipoDelResumen } from './etiquetas';
import { FiltrosReporte } from './FiltrosReporte';
import { numero, porcentaje } from './formato';
import { GraficoConsumo, GraficoEvolucion, GraficoInsumos, GraficoRecordatorios } from './graficos';
import { textoDelPeriodo } from './periodo';
import type { ParametrosReporte } from './useParametrosReporte';

type Datos = DatosEstadisticas['data'];

/** Los cinco indicadores del plan, grandes y arriba: lo primero que se lee. */
function Indicadores({ datos }: { datos: Datos }) {
  const { totales: t, recordatorios: r } = datos;
  const medidos = r.atendidos + r.vencidosSinAtender;
  const items = [
    { nombre: 'Suministros', valor: numero(t.suministros) },
    { nombre: 'Con medicamentos', valor: numero(t.medicamentos) },
    { nombre: 'Con insumos', valor: numero(t.insumos) },
    { nombre: 'Pacientes atendidos', valor: numero(t.pacientes) },
    {
      nombre: 'Recordatorios atendidos',
      valor: r.porcentajeAtendido === null ? '—' : porcentaje(r.porcentajeAtendido),
      detalle:
        r.porcentajeAtendido === null
          ? 'Ninguno venció ni se atendió'
          : `${numero(r.atendidos)} de ${numero(medidos)}`,
    },
  ];
  return (
    <Box
      component="dl"
      aria-label="Indicadores del período"
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0, 1fr))',
          sm: 'repeat(3, minmax(0, 1fr))',
          lg: 'repeat(5, minmax(0, 1fr))',
        },
        m: 0,
        mb: 3,
      }}
    >
      {items.map((i) => (
        <Paper
          key={i.nombre}
          variant="outlined"
          // El porcentaje, que lleva más texto, va a lo ancho en el teléfono.
          sx={{ p: 2, ...(i.detalle && { gridColumn: { xs: '1 / -1', sm: 'auto' } }) }}
        >
          <Typography component="dt" color="text.secondary" sx={{ fontWeight: 700 }}>
            {i.nombre}
          </Typography>
          <Typography
            component="dd"
            sx={{ m: 0, fontSize: '2rem', fontWeight: 700, lineHeight: 1.2 }}
          >
            {i.valor}
            {i.detalle && (
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
                sx={{ display: 'block' }}
              >
                {i.detalle}
              </Typography>
            )}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}

/**
 * Pestaña "Estadísticas" de Reportes (T606 · CU33): indicadores grandes y los gráficos del período
 * (insumos más usados, consumo por tipo, evolución diaria y recordatorios), cada uno con su tabla.
 * Usa el mismo período, sala y tipo que el reporte.
 */
export function Estadisticas({ parametros }: { parametros: ParametrosReporte }) {
  const { tienePermiso } = useSesion();
  const salas = useSalas();
  const { pedido } = parametros;
  const consulta = useQuery({
    queryKey: ['reportes', 'estadisticas', pedido],
    queryFn: () => reportesApi.estadisticas(pedido),
    enabled: parametros.valido,
    placeholderData: keepPreviousData,
  });
  const { botones, aviso } = useDescarga((formato) =>
    reportesApi.exportarEstadisticas(formato, pedido),
  );

  const filtros = (
    <FiltrosReporte
      parametros={parametros}
      conAgrupacion={false}
      erroresServidor={erroresDeFecha(consulta.error)}
    />
  );
  if (!parametros.valido) {
    return (
      <>
        {filtros}
        <PeriodoACorregir que="las estadísticas" />
      </>
    );
  }
  if (consulta.isError) {
    return (
      <>
        {filtros}
        <ErrorDelReporte
          que="las estadísticas"
          error={consulta.error}
          alReintentar={() => void consulta.refetch()}
        />
      </>
    );
  }
  if (!consulta.data) {
    return (
      <>
        {filtros}
        <Cargando texto="Cargando las estadísticas…" />
      </>
    );
  }

  const { data: d, meta } = consulta.data;
  const p = meta.parametros;
  const sala = salaDelResumen(p.salaId, salas.data);
  const resumen = `${textoDelPeriodo(p.desde, p.hasta)} · ${sala} · ${tipoDelResumen(p.tipo)}`;
  const sinSuministros = d.totales.suministros === 0;
  const puedeDescargar =
    tienePermiso('reportes.exportar') &&
    (!sinSuministros || d.recordatorios.total > 0) &&
    !consulta.isPlaceholderData;

  return (
    <>
      {filtros}
      <ResumenYDescargas resumen={resumen} acciones={puedeDescargar && botones} />
      {aviso}
      <Recargando activo={consulta.isFetching && consulta.isPlaceholderData}>
        <Indicadores datos={d} />
        {sinSuministros ? (
          <Box sx={{ mb: 3 }}>
            <Typography color="text.secondary">
              {mensajeSinSuministros({ ...pedido, desde: p.desde, hasta: p.hasta }, sala)}
            </Typography>
            {parametros.hayFiltros && <QuitarFiltros alQuitar={parametros.quitarFiltros} />}
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' },
              mb: 2,
            }}
          >
            <GraficoInsumos insumos={d.insumosMasUsados} />
            <GraficoConsumo consumo={d.consumoPorTipo} />
            <Box sx={{ gridColumn: { lg: '1 / -1' }, minWidth: 0 }}>
              <GraficoEvolucion dias={d.evolucionDiaria} />
            </Box>
          </Box>
        )}
        {d.recordatorios.total > 0 ? (
          <GraficoRecordatorios
            recordatorios={d.recordatorios}
            periodo={periodoEnFrase(p.desde, p.hasta)}
          />
        ) : (
          <Typography color="text.secondary">
            No hubo recordatorios con hora {periodoEnFrase(p.desde, p.hasta)}.
          </Typography>
        )}
      </Recargando>
    </>
  );
}
