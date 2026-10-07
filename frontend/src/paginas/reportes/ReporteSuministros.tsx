import { Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSalas } from '../../api/pacientes';
import { reportesApi, type Agrupacion, type FilaReporte } from '../../api/reportes';
import { useSesion } from '../../auth/useSesion';
import { Tabla, type Columna } from '../../componentes/Tabla';
import { sinCortes } from '../../utilidades/formato';
import { ColumnaPrincipal, Recargando } from '../../utilidades/listado';
import { formatearDosis } from '../prescripciones/etiquetas';
import { ErrorDelReporte, PeriodoACorregir, QuitarFiltros, ResumenYDescargas } from './comunes';
import { erroresDeFecha, mensajeSinSuministros } from './mensajes';
import { useDescarga } from './Descargas';
import { etiquetaAgrupacion, salaDelResumen, TIPO_EN_SINGULAR, tipoDelResumen } from './etiquetas';
import { FiltrosReporte } from './FiltrosReporte';
import { numero } from './formato';
import { textoDelPeriodo } from './periodo';
import type { ParametrosReporte } from './useParametrosReporte';

/** Una fila del reporte o la del total general (con sus unidades ya escritas). */
interface FilaVista extends FilaReporte {
  total?: { unidades: string };
}

/** Las unidades de una fila: con su unidad al agrupar por insumo (D42); si no, el volumen. */
const unidadesDe = (f: FilaReporte) =>
  f.unidad ? formatearDosis(f.unidades, f.unidad) : numero(f.unidades);

/** Total por insumo: cada unidad por separado ("5 unidad, 1 comprimido, 1000 mg"), nunca sumadas. */
function totalPorUnidad(filas: FilaReporte[]) {
  const suma = new Map<string, number>();
  for (const f of filas) {
    if (f.unidad) suma.set(f.unidad, (suma.get(f.unidad) ?? 0) + f.unidades);
  }
  return [...suma].map(([unidad, n]) => formatearDosis(n, unidad)).join(', ');
}

const enNegrita = (f: FilaVista, contenido: string | number) =>
  f.total ? <strong>{contenido}</strong> : contenido;

function columnasDe(agruparPor: Agrupacion): Columna<FilaVista>[] {
  return [
    {
      titulo: etiquetaAgrupacion(agruparPor),
      valor: (f) =>
        f.total ? (
          <strong>Total</strong>
        ) : (
          <ColumnaPrincipal>{sinCortes(f.etiqueta)}</ColumnaPrincipal>
        ),
    },
    ...(agruparPor === 'insumo'
      ? [{ titulo: 'Tipo', valor: (f: FilaVista) => (f.tipo ? TIPO_EN_SINGULAR[f.tipo] : null) }]
      : []),
    {
      titulo: 'Suministros',
      alinear: 'right',
      valor: (f) => enNegrita(f, numero(f.suministros)),
    },
    {
      titulo: 'Unidades',
      alinear: 'right',
      valor: (f) => enNegrita(f, f.total ? f.total.unidades : unidadesDe(f)),
    },
  ];
}

/** Lo que aclara cada agrupación sobre cómo se suma (D42 · D43). */
const NOTAS: Record<Agrupacion, string> = {
  insumo:
    'Una fila por insumo y unidad. Un suministro con varios insumos cuenta en cada insumo y una sola vez en el total.',
  paciente:
    'Las unidades suman cantidades de distinta unidad (mg, comprimidos, pañales…): sirven para comparar volumen, no como dosis. Para ver cada unidad, agrupe por insumo.',
  usuario:
    'Las unidades suman cantidades de distinta unidad (mg, comprimidos, pañales…): sirven para comparar volumen, no como dosis. Para ver cada unidad, agrupe por insumo.',
  dia: 'Solo aparecen los días con suministros. Las unidades suman cantidades de distinta unidad: para ver cada unidad, agrupe por insumo.',
};

/**
 * Pestaña "Suministros" de Reportes (T605 · CU32): una fila por paciente, insumo, personal o día
 * con la cantidad de suministros y de unidades, y el total general del servidor. Con
 * `reportes.exportar`, se descarga en PDF o Excel con los mismos parámetros.
 */
export function ReporteSuministros({ parametros }: { parametros: ParametrosReporte }) {
  const { tienePermiso } = useSesion();
  const salas = useSalas();
  const { agruparPor } = parametros;
  const pedido = { ...parametros.pedido, agruparPor };
  const consulta = useQuery({
    queryKey: ['reportes', 'suministros', pedido],
    queryFn: () => reportesApi.suministros(pedido),
    enabled: parametros.valido,
    placeholderData: keepPreviousData,
  });
  const { botones, aviso } = useDescarga((formato) =>
    reportesApi.exportarSuministros(formato, pedido),
  );

  const datos = consulta.data;
  const filas: FilaVista[] =
    datos && datos.data.length > 0
      ? [
          ...datos.data,
          {
            clave: 'total',
            id: null,
            etiqueta: 'Total',
            suministros: datos.meta.totales.suministros,
            unidades: datos.meta.totales.unidades,
            tipo: null,
            unidad: null,
            total: {
              unidades:
                agruparPor === 'insumo'
                  ? totalPorUnidad(datos.data)
                  : numero(datos.meta.totales.unidades),
            },
          },
        ]
      : [];
  const actualizando = consulta.isFetching && consulta.isPlaceholderData;
  // Lo que se muestra es lo que dijo el servidor (parámetros normalizados), no lo que se pidió.
  const p = datos?.meta.parametros ?? { ...pedido, salaId: pedido.salaId || null };
  const sala = salaDelResumen(p.salaId, salas.data);
  const resumen = `${textoDelPeriodo(p.desde, p.hasta)} · ${sala} · ${tipoDelResumen(p.tipo)}`;
  const sinResultados = consulta.isSuccess && !consulta.isFetching && filas.length === 0;
  const puedeDescargar =
    tienePermiso('reportes.exportar') && filas.length > 0 && !consulta.isPlaceholderData;

  return (
    <>
      <FiltrosReporte
        parametros={parametros}
        conAgrupacion
        erroresServidor={erroresDeFecha(consulta.error)}
      />
      {!parametros.valido ? (
        <PeriodoACorregir que="el reporte" />
      ) : consulta.isError ? (
        <ErrorDelReporte
          que="el reporte de suministros"
          error={consulta.error}
          alReintentar={() => void consulta.refetch()}
        />
      ) : (
        <>
          <ResumenYDescargas resumen={resumen} acciones={puedeDescargar && botones} />
          {aviso}
          <Recargando activo={actualizando}>
            <Tabla
              titulo={`Reporte de suministros por ${etiquetaAgrupacion(agruparPor).toLowerCase()}`}
              columnas={columnasDe(agruparPor)}
              filas={filas}
              claveFila={(f) => f.clave}
              cargando={consulta.isFetching}
              mensajeVacio={mensajeSinSuministros(pedido, sala)}
            />
          </Recargando>
          {filas.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              {NOTAS[agruparPor]}
            </Typography>
          )}
          {sinResultados && parametros.hayFiltros && (
            <QuitarFiltros alQuitar={parametros.quitarFiltros} />
          )}
        </>
      )}
    </>
  );
}
