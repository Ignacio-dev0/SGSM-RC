import { sinCortes } from '../../utilidades/formato';
import { formatearDosis } from '../prescripciones/etiquetas';

/** Lo mínimo que hace falta de un suministro para describir qué se dio. */
interface ConDetalles {
  detalles: { insumo: string; cantidad: number; unidad: string }[];
}

/**
 * "Paracetamol × 500 mg, Gasa × 2 unidad". Ni la cantidad ni la medida del insumo ("10 x 10 cm")
 * se parten en dos renglones.
 */
export const detalleDe = (s: ConDetalles) =>
  s.detalles
    .map((d) => `${sinCortes(d.insumo)} × ${formatearDosis(d.cantidad, d.unidad)}`)
    .join(', ');
