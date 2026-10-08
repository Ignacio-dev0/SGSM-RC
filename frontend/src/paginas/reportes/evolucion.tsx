import type { ChartsLabelCustomMarkProps } from '@mui/x-charts/ChartsLabel';
import { LineChart } from '@mui/x-charts/LineChart';
import type { Estadisticas } from '../../api/reportes';
import type { Columna } from '../../componentes/Tabla';
import { formatearFechaSinZona } from '../../utilidades/formato';
import { ColumnaPrincipal } from '../../utilidades/listado';
import { diaYMes, numero } from './formato';
import { GraficoConTabla } from './GraficoConTabla';
import { EJE, EJE_X, LETRAS, useComunes } from './usarGraficos';

type Dia = Estadisticas['data']['evolucionDiaria'][number];

type Forma = 'circle' | 'square' | 'triangle';

/** La forma de cada punto, dibujada con el centro en (0, 0). */
const FORMAS: Record<Forma, string> = {
  circle: 'M -4.5 0 a 4.5 4.5 0 1 0 9 0 a 4.5 4.5 0 1 0 -9 0',
  square: 'M -4 -4 h 8 v 8 h -8 z',
  triangle: 'M 0 -5 L 5 4 L -5 4 z',
};

interface Serie {
  id: 'suministros' | 'medicamentos' | 'insumos';
  etiqueta: string;
  forma: Forma;
  /** Cómo se llama el trazo (para la prueba) y sus guiones (sin guiones, continuo). */
  trazo: 'continuo' | 'rayado' | 'punteado';
  guiones?: string;
}

/** Tres líneas que se distinguen por color, forma del punto y trazo (nunca solo por el color). */
const SERIES: Serie[] = [
  { id: 'suministros', etiqueta: 'Suministros', forma: 'circle', trazo: 'continuo' },
  {
    id: 'medicamentos',
    etiqueta: 'Con medicamentos',
    forma: 'square',
    trazo: 'rayado',
    guiones: '8 4',
  },
  { id: 'insumos', etiqueta: 'Con insumos', forma: 'triangle', trazo: 'punteado', guiones: '2 4' },
];

/**
 * La marca de la leyenda de una línea (E6-11): un tramo con su trazo y el punto con su forma,
 * para que la leyenda se lea igual que el gráfico (la de la biblioteca es un cuadrado de color).
 */
function marcaDe({ trazo, guiones, forma }: Serie) {
  function MarcaDeLinea({ color, className }: ChartsLabelCustomMarkProps) {
    return (
      <svg
        viewBox="0 0 32 14"
        className={className}
        data-trazo={trazo}
        data-forma={forma}
        aria-hidden
      >
        <line
          x1={1}
          y1={7}
          x2={31}
          y2={7}
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray={guiones}
        />
        {/* Hueca, con el fondo adentro: como los puntos de la línea. */}
        <path
          d={FORMAS[forma]}
          transform="translate(16 7)"
          stroke={color}
          strokeWidth={2}
          style={{ fill: 'var(--mui-palette-background-paper)' }}
        />
      </svg>
    );
  }
  return MarcaDeLinea;
}

// Una sola vez: un componente nuevo en cada dibujo volvería a montar la leyenda.
const MARCAS = Object.fromEntries(SERIES.map((s) => [s.id, marcaDe(s)])) as Record<
  Serie['id'],
  ReturnType<typeof marcaDe>
>;

/** Cuántos puntos marcados como mucho: más taparían la línea (en el teléfono, menos). */
const MARCAS_MAXIMAS = { pantalla: 16, telefono: 8 };

const COLUMNAS_EVOLUCION: Columna<Dia>[] = [
  {
    titulo: 'Día',
    valor: (d) => <ColumnaPrincipal>{formatearFechaSinZona(d.fecha)}</ColumnaPrincipal>,
  },
  { titulo: 'Suministros', alinear: 'right', valor: (d) => numero(d.suministros) },
  { titulo: 'Con medicamentos', alinear: 'right', valor: (d) => numero(d.medicamentos) },
  { titulo: 'Con insumos', alinear: 'right', valor: (d) => numero(d.insumos) },
];

const suministros = (v: number | null) => (v === null ? '' : `${numero(v)} suministros`);

export function GraficoEvolucion({ dias }: { dias: Dia[] }) {
  const { telefono, colores, props } = useComunes();
  // Con muchos días, una marca cada tantos puntos (siempre el primero y el último): la forma
  // sigue diciendo qué línea es sin tapar el recorrido (E6-11).
  const paso = Math.max(
    1,
    Math.ceil(dias.length / (telefono ? MARCAS_MAXIMAS.telefono : MARCAS_MAXIMAS.pantalla)),
  );
  const ultimo = dias.length - 1;
  const conMarca = ({ index }: { index: number }) => index % paso === 0 || index === ultimo;
  return (
    <GraficoConTabla
      titulo="Evolución diaria"
      descripcion="Suministros de cada día del período, también los días sin ninguno. Cada línea tiene su forma de punto y su trazo: continuo, rayado y punteado."
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
        series={SERIES.map((s) => ({
          id: s.id,
          data: dias.map((d) => d[s.id]),
          label: s.etiqueta,
          color: colores[s.id],
          shape: s.forma,
          curve: 'linear',
          showMark: conMarca,
          labelMarkType: MARCAS[s.id],
          valueFormatter: suministros,
        }))}
        sx={{
          ...LETRAS,
          // La marca de la leyenda es un tramo de línea: más ancha que el cuadrado de la biblioteca.
          '& .MuiChartsLegend-mark': { width: 32, height: 14 },
          ...Object.fromEntries(
            SERIES.filter((s) => s.guiones).map((s) => [
              `& .MuiLineChart-line[data-series="${s.id}"]`,
              { strokeDasharray: s.guiones },
            ]),
          ),
        }}
      />
    </GraficoConTabla>
  );
}
