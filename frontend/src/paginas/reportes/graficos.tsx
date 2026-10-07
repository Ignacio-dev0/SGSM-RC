import { createContext, useContext } from 'react';
import { Box } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { ChartsText, type ChartsTextProps } from '@mui/x-charts/ChartsText';
import type { Estadisticas, RecordatoriosDelPeriodo, TipoInsumo } from '../../api/reportes';
import type { Columna } from '../../componentes/Tabla';
import { sinCortes } from '../../utilidades/formato';
import { ColumnaPrincipal } from '../../utilidades/listado';
import { TIPO_EN_SINGULAR } from './etiquetas';
import { numero, porcentaje } from './formato';
import { GraficoConTabla } from './GraficoConTabla';
import {
  anchoDelEje,
  etiquetasQueEntran,
  maximoConLugar,
  recortar,
  RESGUARDO_EJE,
} from './medidas';
import { EJE, EJE_X, LETRAS, useAncho, useComunes } from './usarGraficos';

// Gráficos de barras de las estadísticas (E6-01): cada barra con su nombre en el eje y su número
// al final, un solo color por gráfico salvo lo que pide atención, y el mismo color para lo mismo
// en toda la pantalla (usarGraficos.ts). La evolución diaria (líneas) está en evolucion.tsx.

type Datos = Estadisticas['data'];

const suministros = (v: number | null) => (v === null ? '' : `${numero(v)} suministros`);

/** Alto de una barra con su nombre al lado (dos renglones en los más usados). */
const ALTO_BARRA = { simple: 44, doble: 56 };
/** El eje de abajo y el aire de arriba. */
const ALTO_FIJO = 70;
/** Separa los renglones de un rótulo del eje (ChartsText los parte ahí). */
const SALTO = String.fromCharCode(10);
/** Márgenes a los costados del área de las barras. */
const MARGEN = { left: 8, right: 16 };

/**
 * Lo común de las barras horizontales con nombre: el eje de los nombres medido contra el ancho
 * del gráfico (E6-03) y el máximo del eje de los valores estirado para que el número de la barra
 * más larga entre a su derecha, porque la biblioteca recorta lo que sale del área (E6-17).
 */
function useBarrasConNombre(
  renglones: string[],
  valores: number[],
  etiquetas: string[],
  cortas: string[] = etiquetas,
) {
  const [medir, ancho] = useAncho();
  const anchoEje = anchoDelEje(renglones, ancho);
  const area = ancho > 0 ? ancho - anchoEje - MARGEN.left - MARGEN.right : 0;
  const queEntran = etiquetasQueEntran(etiquetas, cortas, area);
  const max = maximoConLugar(Math.max(0, ...valores), queEntran, area);
  return { medir, anchoEje, etiquetas: queEntran, max: max === undefined ? {} : { max } };
}

/**
 * Los nombres del eje en dos renglones. La biblioteca mide el texto del eje como si fuera un
 * solo renglón y lo corta con "…": por eso el eje recibe una clave corta y este rótulo la cambia
 * por los dos renglones, ya recortados al ancho del eje.
 */
const RenglonesDelEje = createContext<ReadonlyMap<string, string>>(new Map());

function RotuloEnRenglones(props: ChartsTextProps) {
  const renglones = useContext(RenglonesDelEje);
  return <ChartsText {...props} text={renglones.get(props.text) ?? props.text} />;
}

// ─── Medicamentos e insumos más usados ────────────────────────────────────────────────────

type Insumo = Datos['insumosMasUsados'][number];

const presentacionDe = (i: Insumo) => sinCortes(i.presentacion);
const nombreInsumo = (i: Insumo) =>
  i.presentacion ? sinCortes(`${i.nombre} · ${i.presentacion}`) : i.nombre;

const COLUMNAS_INSUMOS: Columna<Insumo>[] = [
  {
    // E6-04: el ranking junta medicamentos e insumos ("Insumo" solo es lo no medicinal).
    titulo: 'Medicamento o insumo',
    valor: (i) => <ColumnaPrincipal>{nombreInsumo(i)}</ColumnaPrincipal>,
  },
  { titulo: 'Tipo', valor: (i) => TIPO_EN_SINGULAR[i.tipo] },
  { titulo: 'Suministros', alinear: 'right', valor: (i) => numero(i.suministros) },
];

export function GraficoMasUsados({ insumos }: { insumos: Insumo[] }) {
  const { telefono, colores, props } = useComunes();
  // E6-03: el nombre y la presentación en dos renglones; el eje, del ancho del más largo.
  const etiquetas = insumos.map((i) => numero(i.suministros));
  const { medir, anchoEje, max } = useBarrasConNombre(
    insumos.flatMap((i) => [i.nombre, presentacionDe(i)]),
    insumos.map((i) => i.suministros),
    etiquetas,
  );
  const clave = (i: Insumo) => `insumo-${i.insumoId}`;
  const lugar = anchoEje - RESGUARDO_EJE;
  const renglones = new Map(
    insumos.map((i) => [
      clave(i),
      [recortar(i.nombre, lugar), recortar(presentacionDe(i), lugar)].filter(Boolean).join(SALTO),
    ]),
  );
  const porId = new Map(insumos.map((i) => [i.insumoId, i]));
  return (
    <GraficoConTabla
      titulo="Medicamentos e insumos más usados"
      descripcion="Los 10 medicamentos o insumos que se usaron en más suministros del período, de más a menos."
      columnas={COLUMNAS_INSUMOS}
      filas={insumos}
      claveFila={(i) => i.insumoId}
      // En el teléfono el eje no alcanza para los nombres largos: los números, en la tabla.
      tablaAbierta={telefono}
    >
      <Box ref={medir}>
        <RenglonesDelEje.Provider value={renglones}>
          <BarChart
            {...props}
            height={Math.max(160, insumos.length * ALTO_BARRA.doble + ALTO_FIJO)}
            layout="horizontal"
            yAxis={[
              {
                ...EJE,
                scaleType: 'band',
                data: insumos.map((i) => i.insumoId),
                width: anchoEje,
                valueFormatter: (id: number, contexto) => {
                  const i = porId.get(id);
                  if (!i) return '';
                  return contexto.location === 'tick' ? clave(i) : nombreInsumo(i);
                },
              },
            ]}
            xAxis={[{ ...EJE_X, label: 'Suministros (cantidad)', tickMinStep: 1, ...max }]}
            series={[
              {
                data: insumos.map((i) => i.suministros),
                label: 'Suministros',
                color: colores.suministros,
                // El número junto a cada barra, sobre el fondo (buen contraste en los dos temas).
                barLabel: (item) => etiquetas[item.dataIndex] ?? null,
                barLabelPlacement: 'outside',
                valueFormatter: suministros,
              },
            ]}
            hideLegend
            // Los números del otro eje no están en el mapa y quedan como vienen.
            slots={{ axisTickLabel: RotuloEnRenglones }}
            sx={LETRAS}
            margin={MARGEN}
          />
        </RenglonesDelEje.Provider>
      </Box>
    </GraficoConTabla>
  );
}

// ─── Consumo por tipo ─────────────────────────────────────────────────────────────────────

/** Los mismos nombres que los indicadores y las líneas de la evolución. */
const CON_TIPO: Record<TipoInsumo, string> = {
  MEDICAMENTO: 'Con medicamentos',
  INSUMO: 'Con insumos',
};

interface Porcion {
  tipo: TipoInsumo;
  suministros: number;
  /** Sobre el total de suministros del período (null si no hubo ninguno). */
  porcentaje: number | null;
}

const conPorcentaje = (p: Porcion) =>
  p.porcentaje === null
    ? numero(p.suministros)
    : `${numero(p.suministros)} (${porcentaje(p.porcentaje)})`;

export function GraficoConsumo({
  consumo,
  total,
}: {
  consumo: Datos['consumoPorTipo'];
  /** Suministros distintos del período (totales.suministros). */
  total: number;
}) {
  const { colores, props } = useComunes();
  // E6-02: sobre el total del período, no sobre la suma de los dos (que duplica a los que tienen
  // medicamentos e insumos): por eso pueden sumar más de 100 %.
  const porciones: Porcion[] = consumo.map((c) => ({
    ...c,
    porcentaje: total > 0 ? Math.round((c.suministros / total) * 1000) / 10 : null,
  }));
  const nombres = porciones.map((p) => CON_TIPO[p.tipo]);
  // En el teléfono, si "31 (64,6 %)" no entra al lado de la barra, queda "31" (el resto, en la tabla).
  const { medir, anchoEje, max, etiquetas } = useBarrasConNombre(
    nombres,
    porciones.map((p) => p.suministros),
    porciones.map(conPorcentaje),
    porciones.map((p) => numero(p.suministros)),
  );
  const columnas: Columna<Porcion>[] = [
    { titulo: 'Tipo', valor: (p) => <ColumnaPrincipal>{CON_TIPO[p.tipo]}</ColumnaPrincipal> },
    { titulo: 'Suministros', alinear: 'right', valor: (p) => numero(p.suministros) },
    {
      titulo: `De los ${numero(total)} suministros del período`,
      alinear: 'right',
      valor: (p) => (p.porcentaje === null ? '—' : porcentaje(p.porcentaje)),
    },
  ];
  return (
    <GraficoConTabla
      titulo="Consumo por tipo"
      descripcion={`Suministros con algún medicamento y con algún insumo. El porcentaje es sobre los ${numero(total)} suministros del período: uno con los dos cuenta en ambos, por eso pueden sumar más de ${porcentaje(100)}.`}
      columnas={columnas}
      filas={porciones}
      claveFila={(p) => p.tipo}
    >
      <Box ref={medir}>
        <BarChart
          {...props}
          height={porciones.length * ALTO_BARRA.simple + ALTO_FIJO}
          layout="horizontal"
          yAxis={[
            {
              ...EJE,
              scaleType: 'band',
              data: nombres,
              width: anchoEje,
              // Cada barra con el color de su tipo, el mismo que su línea en la evolución.
              colorMap: {
                type: 'ordinal',
                values: nombres,
                colors: porciones.map((p) =>
                  p.tipo === 'MEDICAMENTO' ? colores.medicamentos : colores.insumos,
                ),
              },
            },
          ]}
          xAxis={[{ ...EJE_X, label: 'Suministros (cantidad)', tickMinStep: 1, ...max }]}
          series={[
            {
              data: porciones.map((p) => p.suministros),
              label: 'Suministros',
              barLabel: (item) => etiquetas[item.dataIndex] ?? null,
              barLabelPlacement: 'outside',
              valueFormatter: suministros,
            },
          ]}
          hideLegend
          sx={LETRAS}
          margin={MARGEN}
        />
      </Box>
    </GraficoConTabla>
  );
}

// ─── Recordatorios del período ────────────────────────────────────────────────────────────

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
  const categorias: Categoria[] = [
    { id: 'aTiempo', etiqueta: 'A tiempo', valor: r.aTiempo },
    { id: 'tarde', etiqueta: 'Tarde', valor: r.tarde },
    { id: 'noAdministrados', etiqueta: 'No administrados', valor: r.noAdministrados },
    { id: 'vencidosSinAtender', etiqueta: 'Vencidos sin atender', valor: r.vencidosSinAtender },
  ];
  const nombres = categorias.map((c) => c.etiqueta);
  const etiquetas = categorias.map((c) => numero(c.valor));
  const { medir, anchoEje, max } = useBarrasConNombre(
    nombres,
    categorias.map((c) => c.valor),
    etiquetas,
  );
  const pendientes =
    r.pendientes === 1
      ? ' 1 sigue pendiente y no cuenta.'
      : r.pendientes > 1
        ? ` ${numero(r.pendientes)} siguen pendientes y no cuentan.`
        : '';
  return (
    <GraficoConTabla
      titulo="Recordatorios del período"
      descripcion={`${numero(r.total)} recordatorios con hora ${periodo}.${pendientes} "Tarde" es atendido después de vencer.`}
      columnas={COLUMNAS_RECORDATORIOS}
      filas={categorias}
      claveFila={(c) => c.id}
    >
      <Box ref={medir}>
        <BarChart
          {...props}
          height={categorias.length * ALTO_BARRA.simple + ALTO_FIJO}
          layout="horizontal"
          yAxis={[
            {
              ...EJE,
              scaleType: 'band',
              data: nombres,
              width: anchoEje,
              // Un solo color neutro; el de aviso, solo para lo que pide atención.
              colorMap: {
                type: 'ordinal',
                values: nombres,
                colors: categorias.map((c) =>
                  c.id === 'vencidosSinAtender' ? colores.vencidos : colores.recordatorios,
                ),
              },
            },
          ]}
          xAxis={[{ ...EJE_X, label: 'Recordatorios (cantidad)', tickMinStep: 1, ...max }]}
          series={[
            {
              data: categorias.map((c) => c.valor),
              label: 'Recordatorios',
              barLabel: (item) => etiquetas[item.dataIndex] ?? null,
              barLabelPlacement: 'outside',
              valueFormatter: (v: number | null) =>
                v === null ? '' : `${numero(v)} recordatorios`,
            },
          ]}
          hideLegend
          sx={LETRAS}
          margin={MARGEN}
        />
      </Box>
    </GraficoConTabla>
  );
}
