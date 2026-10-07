import { useMediaQuery, useTheme } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { PieChart } from '@mui/x-charts/PieChart';
import type { Estadisticas, RecordatoriosDelPeriodo, TipoInsumo } from '../../api/reportes';
import type { Columna } from '../../componentes/Tabla';
import { formatearFechaSinZona, sinCortes } from '../../utilidades/formato';
import { ColumnaPrincipal } from '../../utilidades/listado';
import { TIPO_EN_SINGULAR } from './etiquetas';
import { diaYMes, numero, porcentaje } from './formato';
import { GraficoConTabla } from './GraficoConTabla';
import { useColoresGrafico, useSinAnimacion } from './usarGraficos';

type Datos = Estadisticas['data'];

/** Lo que tienen en común todos los gráficos: textos en castellano y la animación. */
function useComunes() {
  const telefono = useMediaQuery(useTheme().breakpoints.down('sm'), { noSsr: true });
  return {
    telefono,
    colores: useColoresGrafico(),
    props: {
      skipAnimation: useSinAnimacion(),
      localeText: { loading: 'Cargando…', noData: 'No hay datos en el período' },
    },
  };
}

/** Letra de los ejes legible a un brazo de distancia (la de la biblioteca es de 12 px). */
const EJE = { tickLabelStyle: { fontSize: 14 }, labelStyle: { fontSize: 15 } } as const;
/** El eje de abajo, con lugar para esa letra y el título (si no, la biblioteca oculta las marcas). */
const EJE_X = { ...EJE, height: 56 } as const;

/** Leyendas con el tamaño del texto de apoyo, no el de la biblioteca. */
const LEYENDA = { '& .MuiChartsLegend-label': { fontSize: '0.9375rem' } } as const;

const suministros = (v: number | null) => (v === null ? '' : `${numero(v)} suministros`);

const PLURAL: Record<TipoInsumo, string> = { MEDICAMENTO: 'Medicamentos', INSUMO: 'Insumos' };

// ─── Insumos más usados (barras horizontales) ─────────────────────────────────────────────

type Insumo = Datos['insumosMasUsados'][number];
const nombreInsumo = (i: Insumo) => sinCortes(`${i.nombre} · ${i.presentacion}`);

const COLUMNAS_INSUMOS: Columna<Insumo>[] = [
  { titulo: 'Insumo', valor: (i) => <ColumnaPrincipal>{nombreInsumo(i)}</ColumnaPrincipal> },
  { titulo: 'Tipo', valor: (i) => TIPO_EN_SINGULAR[i.tipo] },
  { titulo: 'Suministros', alinear: 'right', valor: (i) => numero(i.suministros) },
];

export function GraficoInsumos({ insumos }: { insumos: Insumo[] }) {
  const { telefono, colores, props } = useComunes();
  return (
    <GraficoConTabla
      titulo="Insumos más usados"
      descripcion="Los 10 que se usaron en más suministros del período, de más a menos."
      columnas={COLUMNAS_INSUMOS}
      filas={insumos}
      claveFila={(i) => i.insumoId}
    >
      <BarChart
        {...props}
        height={Math.max(160, insumos.length * 44 + 70)}
        layout="horizontal"
        yAxis={[
          {
            ...EJE,
            scaleType: 'band',
            data: insumos.map(nombreInsumo),
            width: telefono ? 130 : 240,
          },
        ]}
        xAxis={[{ ...EJE_X, label: 'Suministros (cantidad)', tickMinStep: 1 }]}
        series={[
          {
            data: insumos.map((i) => i.suministros),
            label: 'Suministros',
            color: colores.info,
            // El número junto a cada barra, sobre el fondo (buen contraste en los dos temas).
            barLabel: 'value',
            barLabelPlacement: 'outside',
            valueFormatter: suministros,
          },
        ]}
        hideLegend
        margin={{ right: 32 }}
      />
    </GraficoConTabla>
  );
}

// ─── Consumo por tipo (torta) ─────────────────────────────────────────────────────────────

interface Porcion {
  tipo: TipoInsumo;
  suministros: number;
  porcentaje: number;
}

const COLUMNAS_CONSUMO: Columna<Porcion>[] = [
  { titulo: 'Tipo', valor: (p) => <ColumnaPrincipal>{PLURAL[p.tipo]}</ColumnaPrincipal> },
  { titulo: 'Suministros', alinear: 'right', valor: (p) => numero(p.suministros) },
  { titulo: 'Porcentaje', alinear: 'right', valor: (p) => porcentaje(p.porcentaje) },
];

export function GraficoConsumo({ consumo }: { consumo: Datos['consumoPorTipo'] }) {
  const { telefono, colores, props } = useComunes();
  const suma = consumo.reduce((t, c) => t + c.suministros, 0) || 1;
  const porciones: Porcion[] = consumo.map((c) => ({
    ...c,
    porcentaje: Math.round((c.suministros / suma) * 1000) / 10,
  }));
  return (
    <GraficoConTabla
      titulo="Consumo por tipo"
      descripcion="Suministros con medicamentos y con insumos. Uno con los dos cuenta en ambos."
      columnas={COLUMNAS_CONSUMO}
      filas={porciones}
      claveFila={(p) => p.tipo}
    >
      <PieChart
        {...props}
        height={240}
        series={[
          {
            data: porciones.map((p) => ({
              id: p.tipo,
              value: p.suministros,
              // La leyenda dice el número: el color solo acompaña.
              label: `${PLURAL[p.tipo]}: ${numero(p.suministros)} (${porcentaje(p.porcentaje)})`,
              color: p.tipo === 'MEDICAMENTO' ? colores.primario : colores.secundario,
            })),
            innerRadius: '45%',
            paddingAngle: 2,
            cornerRadius: 4,
            valueFormatter: (v) => suministros(v.value),
          },
        ]}
        sx={LEYENDA}
        slotProps={{
          legend: {
            direction: telefono ? 'horizontal' : 'vertical',
            position: telefono
              ? { vertical: 'bottom', horizontal: 'center' }
              : { vertical: 'middle', horizontal: 'end' },
          },
        }}
      />
    </GraficoConTabla>
  );
}

// ─── Evolución diaria (líneas) ────────────────────────────────────────────────────────────

type Dia = Datos['evolucionDiaria'][number];

const COLUMNAS_EVOLUCION: Columna<Dia>[] = [
  {
    titulo: 'Día',
    valor: (d) => <ColumnaPrincipal>{formatearFechaSinZona(d.fecha)}</ColumnaPrincipal>,
  },
  { titulo: 'Suministros', alinear: 'right', valor: (d) => numero(d.suministros) },
  { titulo: 'Con medicamentos', alinear: 'right', valor: (d) => numero(d.medicamentos) },
  { titulo: 'Con insumos', alinear: 'right', valor: (d) => numero(d.insumos) },
];

export function GraficoEvolucion({ dias }: { dias: Dia[] }) {
  const { telefono, colores, props } = useComunes();
  // Con muchos días, los puntos taparían la línea (en el teléfono, antes).
  const conMarcas = dias.length <= (telefono ? 14 : 31);
  return (
    <GraficoConTabla
      titulo="Evolución diaria"
      descripcion="Suministros de cada día del período, también los días sin ninguno."
      columnas={COLUMNAS_EVOLUCION}
      filas={dias}
      claveFila={(d) => d.fecha}
    >
      <LineChart
        {...props}
        height={280}
        xAxis={[
          {
            scaleType: 'point',
            data: dias.map((d) => d.fecha),
            valueFormatter: (f: string) => diaYMes(f),
            label: 'Día',
            ...EJE_X,
          },
        ]}
        yAxis={[{ ...EJE, label: 'Suministros por día', tickMinStep: 1, min: 0 }]}
        series={[
          {
            id: 'suministros',
            data: dias.map((d) => d.suministros),
            label: 'Suministros',
            color: colores.info,
            shape: 'circle',
            curve: 'linear',
            showMark: conMarcas,
            valueFormatter: suministros,
          },
          {
            id: 'medicamentos',
            data: dias.map((d) => d.medicamentos),
            label: 'Con medicamentos',
            color: colores.primario,
            shape: 'square',
            curve: 'linear',
            showMark: conMarcas,
            valueFormatter: suministros,
          },
          {
            id: 'insumos',
            data: dias.map((d) => d.insumos),
            label: 'Con insumos',
            color: colores.secundario,
            shape: 'triangle',
            curve: 'linear',
            showMark: conMarcas,
            valueFormatter: suministros,
          },
        ]}
        // Además del color y la forma de los puntos, cada línea tiene su trazo.
        sx={{
          ...LEYENDA,
          '& .MuiLineChart-line[data-series="medicamentos"]': { strokeDasharray: '8 4' },
          '& .MuiLineChart-line[data-series="insumos"]': { strokeDasharray: '2 4' },
        }}
      />
    </GraficoConTabla>
  );
}

// ─── Recordatorios (barra apilada) ────────────────────────────────────────────────────────

interface Categoria {
  id: string;
  etiqueta: string;
  valor: number;
}

const COLUMNAS_RECORDATORIOS: Columna<Categoria>[] = [
  { titulo: 'Estado', valor: (c) => <ColumnaPrincipal>{c.etiqueta}</ColumnaPrincipal> },
  { titulo: 'Recordatorios', alinear: 'right', valor: (c) => numero(c.valor) },
];

export function GraficoRecordatorios({
  recordatorios: r,
  periodo,
}: {
  recordatorios: RecordatoriosDelPeriodo;
  periodo: string;
}) {
  const { colores, props } = useComunes();
  const categorias = [
    { id: 'aTiempo', etiqueta: 'A tiempo', valor: r.aTiempo, color: colores.primario },
    { id: 'tarde', etiqueta: 'Tarde', valor: r.tarde, color: colores.info },
    {
      id: 'noAdministrados',
      etiqueta: 'No administrados',
      valor: r.noAdministrados,
      color: colores.secundario,
    },
    {
      id: 'vencidosSinAtender',
      etiqueta: 'Vencidos sin atender',
      valor: r.vencidosSinAtender,
      color: colores.aviso,
    },
  ];
  const pendientes =
    r.pendientes === 1
      ? ' 1 sigue pendiente y no cuenta.'
      : r.pendientes > 1
        ? ` ${r.pendientes} siguen pendientes y no cuentan.`
        : '';
  return (
    <GraficoConTabla
      titulo="Recordatorios del período"
      descripcion={`${numero(r.total)} recordatorios con hora ${periodo}.${pendientes} "Tarde" es atendido después de vencer.`}
      columnas={COLUMNAS_RECORDATORIOS}
      filas={categorias}
      claveFila={(c) => c.id}
    >
      <BarChart
        {...props}
        height={150}
        layout="horizontal"
        yAxis={[
          {
            scaleType: 'band',
            data: ['Recordatorios'],
            width: 0,
            disableTicks: true,
            disableLine: true,
          },
        ]}
        xAxis={[{ ...EJE_X, label: 'Recordatorios (cantidad)', tickMinStep: 1 }]}
        sx={LEYENDA}
        // Sin números dentro de las barras (no tendrían contraste): la leyenda los dice.
        series={categorias.map((c) => ({
          id: c.id,
          data: [c.valor],
          label: `${c.etiqueta}: ${numero(c.valor)}`,
          stack: 'recordatorios',
          color: c.color,
          valueFormatter: (v: number | null) => (v === null ? '' : `${numero(v)} recordatorios`),
        }))}
      />
    </GraficoConTabla>
  );
}
