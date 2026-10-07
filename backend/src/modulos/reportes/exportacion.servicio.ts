import { fechaLegible } from '../../comun/fechas';
import { reloj } from '../../comun/reloj';
import { prisma } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import type { UsuarioSesion } from '../auth/sesion';
import { salaDelFiltro, nombreCompleto } from './consultas';
import { estadisticasDelPeriodo, type Estadisticas } from './estadisticas.servicio';
import type { Celda, Columna, Documento, Tabla } from './exportacion/documento';
import { documentoXlsx } from './exportacion/excel';
import { documentoPdf } from './exportacion/pdf';
import { reporteSuministros, type ReporteSuministros } from './reporte.servicio';
import type {
  Agrupacion,
  ExportarEstadisticas,
  ExportarSuministros,
  Formato,
  Periodo,
  TipoInsumoReporte,
} from './reportes.esquemas';

/**
 * Exportación del reporte y las estadísticas a PDF y Excel (T603 · CU34 · RF13): arma el
 * documento con el encabezado, los parámetros con sus nombres, la emisión y el autor; lo
 * dibuja en el formato pedido y audita la exportación (EXPORTAR · Reporte) antes de entregarlo.
 */

export interface ArchivoExportado {
  contenido: Buffer;
  tipoContenido: string;
  /** reporte-suministros-AAAAMMDD-AAAAMMDD.pdf, estadisticas-…xlsx: el período (D46 · ESC4). */
  nombre: string;
}

export const TIPO_CONTENIDO: Record<Formato, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const NOMBRE_FORMATO: Record<Formato, string> = { pdf: 'PDF', xlsx: 'Excel' };
const TIPOS: Record<TipoInsumoReporte, string> = { MEDICAMENTO: 'Medicamentos', INSUMO: 'Insumos' };
const TIPO_SINGULAR: Record<TipoInsumoReporte, string> = {
  MEDICAMENTO: 'Medicamento',
  INSUMO: 'Insumo',
};
const AGRUPACION: Record<Agrupacion, string> = {
  paciente: 'Paciente',
  insumo: 'Insumo',
  usuario: 'Usuario',
  dia: 'Día',
};

/** Sala y tipo con sus nombres: "Sala A – Neurorrehabilitación", "Todos"… */
async function filtrosLegibles(p: Periodo): Promise<[string, string][]> {
  const sala = await salaDelFiltro(p.salaId);
  return [
    ['Sala', sala?.nombre ?? 'Todas'],
    ['Tipo', p.tipo ? TIPOS[p.tipo] : 'Todos'],
  ];
}

const num = (titulo: string, ancho = 1): Columna => ({ titulo, ancho, numerica: true });
const txt = (titulo: string, ancho = 3): Columna => ({ titulo, ancho });

function tablaDeSuministros({ data, meta }: ReporteSuministros, agruparPor: Agrupacion): Tabla {
  const { suministros, unidades } = meta.totales;
  const comun = {
    titulo: `Suministros por ${AGRUPACION[agruparPor].toLowerCase()}`,
    hoja: 'Reporte',
  };
  if (agruparPor === 'insumo') {
    return {
      ...comun,
      columnas: [
        txt('Insumo'),
        txt('Tipo', 1.2),
        txt('Unidad', 1),
        num('Suministros'),
        num('Unidades'),
      ],
      filas: data.map((f) => [
        f.etiqueta,
        f.tipo ? TIPO_SINGULAR[f.tipo] : null,
        f.unidad,
        f.suministros,
        f.unidades,
      ]),
      total: ['Total', null, null, suministros, unidades],
    };
  }
  return {
    ...comun,
    columnas: [txt(AGRUPACION[agruparPor]), num('Suministros'), num('Unidades')],
    filas: data.map((f) => [
      agruparPor === 'dia' ? { fecha: f.clave } : f.etiqueta,
      f.suministros,
      f.unidades,
    ]),
    total: ['Total', suministros, unidades],
  };
}

function tablasDeEstadisticas({ data }: Estadisticas): Tabla[] {
  const { totales: t, recordatorios: r } = data;
  return [
    {
      titulo: 'Indicadores del período',
      hoja: 'Indicadores',
      columnas: [txt('Indicador'), num('Valor')],
      filas: [
        ['Suministros', t.suministros],
        ['Suministros de medicamentos', t.medicamentos],
        ['Suministros de insumos', t.insumos],
        ['Pacientes atendidos', t.pacientes],
      ],
    },
    {
      titulo: 'Recordatorios del período',
      hoja: 'Recordatorios',
      columnas: [txt('Recordatorios'), num('Cantidad')],
      filas: [
        ['Atendidos a tiempo', r.aTiempo],
        ['Atendidos tarde (después de vencer)', r.tarde],
        ['No administrados (con motivo)', r.noAdministrados],
        ['Vencidos sin atender', r.vencidosSinAtender],
        ['Pendientes', r.pendientes],
        ['Total del período', r.total],
        ['Atendidos', r.atendidos],
        ['Porcentaje atendido', { porcentaje: r.porcentajeAtendido }],
      ],
    },
    {
      titulo: 'Insumos más usados',
      hoja: 'Insumos más usados',
      columnas: [num('N.º', 0.4), txt('Insumo'), txt('Tipo', 1.2), num('Suministros')],
      filas: data.insumosMasUsados.map((i, n) => [
        n + 1,
        i.presentacion ? `${i.nombre} · ${i.presentacion}` : i.nombre,
        TIPO_SINGULAR[i.tipo],
        i.suministros,
      ]),
    },
    {
      titulo: 'Consumo por tipo',
      hoja: 'Consumo por tipo',
      columnas: [txt('Tipo'), num('Suministros')],
      filas: data.consumoPorTipo.map((c) => [TIPOS[c.tipo], c.suministros]),
    },
    {
      titulo: 'Evolución diaria',
      hoja: 'Evolución diaria',
      columnas: [txt('Día', 1.5), num('Suministros'), num('Medicamentos'), num('Insumos')],
      filas: data.evolucionDiaria.map((d): Celda[] => [
        { fecha: d.fecha },
        d.suministros,
        d.medicamentos,
        d.insumos,
      ]),
      total: ['Total', t.suministros, t.medicamentos, t.insumos],
    },
  ];
}

const DIBUJAR: Record<Formato, (doc: Documento) => Promise<Buffer>> = {
  pdf: documentoPdf,
  xlsx: documentoXlsx,
};

/** Dibuja el documento, audita la exportación y devuelve el archivo. */
async function entregar(
  que: 'suministros' | 'estadisticas',
  documento: Documento,
  parametros: Periodo & { formato: Formato; agruparPor?: Agrupacion },
  usuarioId: number,
): Promise<ArchivoExportado> {
  const contenido = await DIBUJAR[parametros.formato](documento);
  const filtros = documento.filtros.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`);
  await registrarAuditoria(prisma, {
    usuarioId,
    accion: 'EXPORTAR',
    entidad: 'Reporte',
    entidadId: que,
    nuevo: parametros,
    detalle: [
      `${documento.titulo} en ${NOMBRE_FORMATO[parametros.formato]}`,
      `${fechaLegible(parametros.desde)} al ${fechaLegible(parametros.hasta)}`,
      ...filtros,
    ]
      .join(' · ')
      .slice(0, 255),
  });
  // Desde y hasta ya son días de Argentina (normalizados por el esquema).
  const dia = (fecha: string) => fecha.replaceAll('-', '');
  const base = que === 'suministros' ? 'reporte-suministros' : 'estadisticas';
  return {
    contenido,
    tipoContenido: TIPO_CONTENIDO[parametros.formato],
    nombre: `${base}-${dia(parametros.desde)}-${dia(parametros.hasta)}.${parametros.formato}`,
  };
}

export async function exportarSuministros(p: ExportarSuministros, usuario: UsuarioSesion) {
  const filtros = await filtrosLegibles(p);
  const reporte = await reporteSuministros(p);
  const documento: Documento = {
    titulo: 'Reporte de suministros',
    desde: p.desde,
    hasta: p.hasta,
    filtros: [...filtros, ['Agrupado por', AGRUPACION[p.agruparPor]]],
    emitido: reloj.ahora(),
    autor: nombreCompleto(usuario),
    tablas: [tablaDeSuministros(reporte, p.agruparPor)],
  };
  return entregar('suministros', documento, p, usuario.id);
}

export async function exportarEstadisticas(p: ExportarEstadisticas, usuario: UsuarioSesion) {
  const filtros = await filtrosLegibles(p);
  const estadisticas = await estadisticasDelPeriodo(p);
  const documento: Documento = {
    titulo: 'Estadísticas de suministros',
    desde: p.desde,
    hasta: p.hasta,
    filtros,
    emitido: reloj.ahora(),
    autor: nombreCompleto(usuario),
    tablas: tablasDeEstadisticas(estadisticas),
  };
  return entregar('estadisticas', documento, p, usuario.id);
}
