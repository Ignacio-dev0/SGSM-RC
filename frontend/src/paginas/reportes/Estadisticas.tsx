import { useId } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSalas } from '../../api/pacientes';
import { reportesApi, type Estadisticas as DatosEstadisticas } from '../../api/reportes';
import { useSesion } from '../../auth/useSesion';
import { Cargando } from '../../componentes/EstadoDeCarga';
import { Recargando } from '../../utilidades/listado';
import {
  AccionesDeDescarga,
  ErrorDelReporte,
  PeriodoACorregir,
  QuitarFiltros,
  ResumenYDescargas,
} from './comunes';
import { erroresDeFecha, mensajeSinSuministros, periodoEnFrase } from './mensajes';
import { useDescarga } from './Descargas';
import { salaDelResumen, tipoDelResumen } from './etiquetas';
import { FiltrosReporte } from './FiltrosReporte';
import { numero, porcentaje } from './formato';
import { GraficoEvolucion } from './evolucion';
import { GraficoConsumo, GraficoMasUsados, GraficoRecordatorios } from './graficos';
import { textoDelPeriodo } from './periodo';
import type { ParametrosReporte } from './useParametrosReporte';

type Datos = DatosEstadisticas['data'];

/** Parte de un total en porcentaje con un decimal; null si no hay sobre qué medir. */
const parte = (n: number, de: number) => (de > 0 ? Math.round((n / de) * 1000) / 10 : null);

/** Sobre qué se miden los porcentajes de los recordatorios, y qué cuenta como atendido. */
function explicacionRecordatorios(medidos: number, pendientes: number) {
  const sinPendientes =
    pendientes === 0
      ? ''
      : pendientes === 1
        ? ' (el pendiente todavía no cuenta)'
        : ` (los ${numero(pendientes)} pendientes todavía no cuentan)`;
  return `Sobre los ${numero(medidos)} recordatorios que ya se atendieron o vencieron${sinPendientes}. Atendidos: dados a tiempo o tarde, o no administrados con su motivo. A tiempo: dados antes de vencer.`;
}

/**
 * Los indicadores del plan, grandes y arriba: lo primero que se lee. De los recordatorios, dos
 * (ESC3): cuántos se atendieron y cuántos a tiempo, sobre los que ya tuvieron su oportunidad.
 */
function Indicadores({ datos }: { datos: Datos }) {
  const idExplicacion = useId();
  const { totales: t, recordatorios: r } = datos;
  // Atendidos + vencidos sin atender: los pendientes todavía no tuvieron su oportunidad (D45).
  const medidos = r.total - r.pendientes;
  const aTiempo = parte(r.aTiempo, medidos);
  const sinMedir = 'Ninguno venció ni se atendió';
  const items = [
    { nombre: 'Suministros', valor: numero(t.suministros) },
    { nombre: 'Con medicamentos', valor: numero(t.medicamentos) },
    { nombre: 'Con insumos', valor: numero(t.insumos) },
    { nombre: 'Pacientes atendidos', valor: numero(t.pacientes) },
    {
      nombre: 'Recordatorios atendidos',
      valor: r.porcentajeAtendido === null ? '—' : porcentaje(r.porcentajeAtendido),
      detalle:
        r.porcentajeAtendido === null ? sinMedir : `${numero(r.atendidos)} de ${numero(medidos)}`,
    },
    {
      nombre: 'Atendidos a tiempo',
      valor: aTiempo === null ? '—' : porcentaje(aTiempo),
      detalle: aTiempo === null ? sinMedir : `${numero(r.aTiempo)} de ${numero(medidos)}`,
    },
  ];
  return (
    <Box sx={{ mb: 3 }}>
      <Box
        component="dl"
        aria-label="Indicadores del período"
        aria-describedby={medidos > 0 ? idExplicacion : undefined}
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            sm: 'repeat(3, minmax(0, 1fr))',
            xl: 'repeat(6, minmax(0, 1fr))',
          },
          m: 0,
        }}
      >
        {items.map((i) => (
          <Paper
            key={i.nombre}
            variant="outlined"
            // Los porcentajes, que llevan más texto, van a lo ancho en el teléfono.
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
      {medidos > 0 && (
        <Typography id={idExplicacion} variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {explicacionRecordatorios(medidos, r.pendientes)}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Pestaña "Estadísticas" de Reportes (T606 · CU33): indicadores grandes y los gráficos del período
 * (medicamentos e insumos más usados, consumo por tipo, evolución diaria y recordatorios), cada
 * uno con su tabla.
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
  const descarga = useDescarga(
    (formato, senal) => reportesApi.exportarEstadisticas(formato, pedido, senal),
    { periodo: pedido, clave: JSON.stringify(pedido) },
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
          alQuitarFiltros={parametros.hayFiltros ? parametros.quitarFiltros : undefined}
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

  return (
    <>
      {filtros}
      <ResumenYDescargas
        resumen={resumen}
        acciones={
          <AccionesDeDescarga
            puedeExportar={tienePermiso('reportes.exportar')}
            hayDatos={!sinSuministros || d.recordatorios.total > 0}
            actualizando={consulta.isPlaceholderData}
            descarga={descarga}
          />
        }
      />
      {descarga.aviso}
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
            <GraficoMasUsados insumos={d.insumosMasUsados} />
            <GraficoConsumo consumo={d.consumoPorTipo} total={d.totales.suministros} />
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
