import { erroresPorCampo } from '../../api/cliente';
import type { PedidoPeriodo } from '../../api/reportes';
import { formatearFechaSinZona } from '../../utilidades/formato';
import { oracionDe, pasosParaProbar } from '../../utilidades/sinResultados';
import { numero } from './formato';

// Textos de los reportes que dependen del período y de los filtros usados.

/** Los errores de fecha que devolvió el servidor (un 400 que igual llegó), para mostrarlos en su campo. */
export function erroresDeFecha(error: unknown) {
  const { desde, hasta } = erroresPorCampo(error);
  return { desde, hasta };
}

/** "del 01/10/2026 al 07/10/2026" o "el 07/10/2026", para armar oraciones. */
export const periodoEnFrase = (desde: string, hasta: string) =>
  desde === hasta
    ? `el ${formatearFechaSinZona(desde)}`
    : `del ${formatearFechaSinZona(desde)} al ${formatearFechaSinZona(hasta)}`;

/** Qué no se encontró y qué probar, con el período y los filtros usados. */
export function mensajeSinSuministros(p: PedidoPeriodo, sala: string) {
  const causa = oracionDe([
    'No hay suministros',
    p.tipo === 'MEDICAMENTO' && 'de medicamentos',
    p.tipo === 'INSUMO' && 'de insumos',
    p.salaId && `en ${sala}`,
    periodoEnFrase(p.desde, p.hasta),
  ]);
  const pasos = pasosParaProbar([
    'amplíe el período',
    p.tipo && 'cambie Tipo a Todos',
    p.salaId && 'elija otra sala',
  ]);
  return `${causa} ${pasos}`;
}

/**
 * Los recordatorios que todavía no tenían que atenderse (pendientes), sin nombrar el estado
 * (F13 · D156), con la misma frase en el resumen y en el gráfico; cada uno dice lo suyo: el
 * porcentaje no los cuenta y el gráfico no les dedica una barra. "" si no hay.
 */
export function pendientesEnPalabras(n: number, donde: 'porcentaje' | 'grafico') {
  if (n === 0) return '';
  const uno = n === 1;
  const cuantos = uno
    ? '1 todavía estaba a tiempo de atenderse'
    : `${numero(n)} todavía estaban a tiempo de atenderse`;
  const que =
    donde === 'porcentaje'
      ? `no ${uno ? 'cuenta' : 'cuentan'} para el porcentaje`
      : `no ${uno ? 'aparece' : 'aparecen'} en el gráfico`;
  return `Del total, ${cuantos}: ${que}.`;
}
