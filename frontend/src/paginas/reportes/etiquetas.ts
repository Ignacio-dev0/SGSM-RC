import type { Agrupacion, Formato, TipoInsumo } from '../../api/reportes';
import type { Sala } from '../../api/tipos';

/** Agrupaciones del reporte con las palabras de la pantalla ("usuario" es quien registró). */
export const AGRUPACIONES: { valor: Agrupacion; etiqueta: string }[] = [
  { valor: 'paciente', etiqueta: 'Paciente' },
  { valor: 'insumo', etiqueta: 'Insumo' },
  { valor: 'usuario', etiqueta: 'Personal' },
  { valor: 'dia', etiqueta: 'Día' },
];

export const etiquetaAgrupacion = (a: Agrupacion) =>
  AGRUPACIONES.find((x) => x.valor === a)?.etiqueta ?? 'Paciente';

export const OPCIONES_TIPO = [
  { valor: '', etiqueta: 'Todos' },
  { valor: 'MEDICAMENTO', etiqueta: 'Medicamentos' },
  { valor: 'INSUMO', etiqueta: 'Insumos' },
];

/** Un insumo del catálogo por su tipo, en singular ("Medicamento", "Insumo"). */
export const TIPO_EN_SINGULAR: Record<TipoInsumo, string> = {
  MEDICAMENTO: 'Medicamento',
  INSUMO: 'Insumo',
};

/** Lo que cubre el filtro de tipo, para el resumen de los parámetros. */
export const tipoDelResumen = (tipo: string | null) =>
  tipo === 'MEDICAMENTO'
    ? 'Medicamentos'
    : tipo === 'INSUMO'
      ? 'Insumos'
      : 'Medicamentos e insumos';

/** El nombre de la sala elegida; sin sala, todo el hospital. */
export const salaDelResumen = (salaId: string | number | null, salas: Sala[] | undefined) => {
  if (!salaId) return 'Todas las salas';
  return salas?.find((s) => s.id === Number(salaId))?.nombre ?? 'La sala elegida';
};

export const NOMBRE_FORMATO: Record<Formato, string> = { pdf: 'PDF', xlsx: 'Excel' };
