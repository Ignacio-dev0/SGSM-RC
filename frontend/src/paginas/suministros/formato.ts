import type { Suministro } from '../../api/tipos';
import { formatearDosis } from '../prescripciones/etiquetas';

/** "Paracetamol × 500 mg, Gasa × 2 unidad" */
export const detalleDe = (s: Suministro) =>
  s.detalles.map((d) => `${d.insumo} × ${formatearDosis(d.cantidad, d.unidad)}`).join(', ');
