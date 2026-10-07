import type { Agrupacion, PedidoPeriodo } from '../../api/reportes';
import { useFiltrosEnUrl } from '../../utilidades/useFiltrosEnUrl';
import { AGRUPACIONES } from './etiquetas';
import {
  ATAJO_POR_DEFECTO,
  hoyEnArgentina,
  periodoEfectivo,
  validarPeriodo,
  type Atajo,
} from './periodo';

/**
 * Parámetros de los reportes en la URL, compartidos por las dos pestañas: `periodo` (atajo),
 * `desde`/`hasta` (si se eligieron fechas), `salaId`, `tipo` y `agruparPor`. Lo que vale lo mismo
 * que por defecto no se escribe: `/reportes` son los últimos 7 días por paciente.
 */
const POR_DEFECTO = {
  periodo: ATAJO_POR_DEFECTO as string,
  desde: '',
  hasta: '',
  salaId: '',
  tipo: '',
  agruparPor: 'paciente',
};

/** Lo que "Quitar filtros" vuelve a su valor; la agrupación es una forma de ver, no un filtro. */
const FILTROS = { periodo: ATAJO_POR_DEFECTO, desde: '', hasta: '', salaId: '', tipo: '' };

export function useParametrosReporte() {
  const filtros = useFiltrosEnUrl(POR_DEFECTO);
  const valores = filtros.valores;
  const hoy = hoyEnArgentina();
  const efectivo = periodoEfectivo(valores, hoy);
  const errores = validarPeriodo(efectivo.desde, efectivo.hasta);
  const agruparPor: Agrupacion =
    AGRUPACIONES.find((a) => a.valor === valores.agruparPor)?.valor ?? 'paciente';
  const pedido: PedidoPeriodo = {
    desde: efectivo.desde,
    hasta: efectivo.hasta,
    salaId: valores.salaId,
    tipo: valores.tipo,
  };

  return {
    valores,
    hoy,
    /** Las fechas que se piden y el atajo marcado (null con fechas elegidas). */
    efectivo,
    /** Errores del período por campo, con los mensajes del servidor. */
    errores,
    valido: !errores.desde && !errores.hasta,
    pedido,
    agruparPor,
    hayFiltros: (Object.keys(FILTROS) as (keyof typeof FILTROS)[]).some(
      (clave) => valores[clave] !== FILTROS[clave],
    ),
    fijar: filtros.fijar,
    elegirAtajo: (atajo: Atajo) => filtros.fijar({ periodo: atajo, desde: '', hasta: '' }),
    /** Al elegir una fecha, las dos quedan fijas: el atajo deja de contar. */
    cambiarFecha: (campo: 'desde' | 'hasta', valor: string) =>
      filtros.fijar({
        desde: efectivo.desde,
        hasta: efectivo.hasta,
        [campo]: valor,
        periodo: ATAJO_POR_DEFECTO,
      }),
    quitarFiltros: () => filtros.fijar(FILTROS),
  };
}

export type ParametrosReporte = ReturnType<typeof useParametrosReporte>;
