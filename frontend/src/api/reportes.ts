import { api, descargar } from './cliente';

/**
 * Reporte de suministros, estadísticas y su exportación (E6 · T601–T603). Contrato en
 * docs/reportes.md: los nombres y las formas de esta página son los del backend.
 */

export type TipoInsumo = 'MEDICAMENTO' | 'INSUMO';
export type Agrupacion = 'paciente' | 'insumo' | 'usuario' | 'dia';
export type Formato = 'pdf' | 'xlsx';

/** Período, sala y tipo ya normalizados por el servidor (fechas completadas, null = sin filtro). */
export interface ParametrosPeriodo {
  desde: string; // 'AAAA-MM-DD'
  hasta: string; // 'AAAA-MM-DD'
  salaId: number | null;
  tipo: TipoInsumo | null;
}

/** Lo que se pide: los días en hora de Argentina y los filtros elegidos (vacío = sin filtro). */
export interface PedidoPeriodo {
  desde: string;
  hasta: string;
  salaId: string;
  tipo: string;
}

export interface FilaReporte {
  /** Única en el reporte (para las claves de React). */
  clave: string;
  /** Id del paciente, el usuario o el insumo; null al agrupar por día. */
  id: number | null;
  etiqueta: string;
  suministros: number;
  unidades: number;
  /** Solo al agrupar por insumo; null en las otras agrupaciones. */
  tipo: TipoInsumo | null;
  unidad: string | null;
}

export interface ReporteSuministros {
  data: FilaReporte[];
  meta: {
    parametros: ParametrosPeriodo & { agruparPor: Agrupacion };
    /** Suministros distintos: uno con dos insumos cuenta una sola vez (D43). */
    totales: { suministros: number; unidades: number };
  };
}

export interface RecordatoriosDelPeriodo {
  total: number;
  aTiempo: number;
  tarde: number;
  noAdministrados: number;
  vencidosSinAtender: number;
  pendientes: number;
  /** aTiempo + tarde + noAdministrados. */
  atendidos: number;
  /** atendidos / (atendidos + vencidosSinAtender) × 100, con un decimal; null si no hay. */
  porcentajeAtendido: number | null;
}

export interface Estadisticas {
  data: {
    totales: { suministros: number; medicamentos: number; insumos: number; pacientes: number };
    /** Los 10 en más suministros (D44), de más a menos. */
    insumosMasUsados: {
      insumoId: number;
      nombre: string;
      presentacion: string;
      tipo: TipoInsumo;
      suministros: number;
    }[];
    /** Siempre los dos tipos, en este orden: MEDICAMENTO, INSUMO. */
    consumoPorTipo: { tipo: TipoInsumo; suministros: number }[];
    /** Un punto por cada día del rango, también los días en cero. */
    evolucionDiaria: {
      fecha: string;
      suministros: number;
      medicamentos: number;
      insumos: number;
    }[];
    recordatorios: RecordatoriosDelPeriodo;
  };
  meta: { parametros: ParametrosPeriodo; dias: number };
}

type Query = Parameters<typeof api.lista>[1];

/** Respuesta completa: estos reportes traen en `meta` los parámetros y totales, no la paginación. */
async function conMeta<T>(ruta: string, query: Query) {
  const r = await api.lista<unknown>(ruta, query);
  return r as unknown as T;
}

const EXTENSION: Record<Formato, string> = { pdf: 'pdf', xlsx: 'xlsx' };

export const reportesApi = {
  suministros: (p: PedidoPeriodo & { agruparPor: Agrupacion }) =>
    conMeta<ReporteSuministros>('/api/reportes/suministros', { ...p }),
  estadisticas: (p: PedidoPeriodo) => conMeta<Estadisticas>('/api/reportes/estadisticas', { ...p }),
  /**
   * El archivo con el nombre que le da el servidor (con el período: ESC4). Con `senal` se puede
   * cancelar mientras se arma.
   */
  exportarSuministros: (
    formato: Formato,
    p: PedidoPeriodo & { agruparPor: Agrupacion },
    senal?: AbortSignal,
  ) =>
    descargar(
      '/api/reportes/suministros/exportar',
      { formato, ...p },
      `reporte-suministros.${EXTENSION[formato]}`,
      senal,
    ),
  exportarEstadisticas: (formato: Formato, p: PedidoPeriodo, senal?: AbortSignal) =>
    descargar(
      '/api/reportes/estadisticas/exportar',
      { formato, ...p },
      `estadisticas.${EXTENSION[formato]}`,
      senal,
    ),
};
