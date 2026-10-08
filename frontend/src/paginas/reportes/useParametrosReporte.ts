import { useState } from 'react';
import type { Agrupacion, PedidoPeriodo } from '../../api/reportes';
import { useFiltrosEnUrl } from '../../utilidades/useFiltrosEnUrl';
import { AGRUPACIONES } from './etiquetas';
import {
  ATAJO_POR_DEFECTO,
  erroresDelCampoCambiado,
  fechaVacia,
  hoyEnArgentina,
  periodoEfectivo,
  validarPeriodo,
  type Atajo,
  type CampoFecha,
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

/**
 * Las fechas que se están escribiendo y todavía no se confirmaron (E6-13): el campo nativo cambia
 * de valor con cada dígito del año, así que se pide recién al salir del campo o con Enter.
 */
interface EstadoFechas {
  borrador: Partial<Record<CampoFecha, string>>;
  /** Campos que se confirmaron vacíos: no se reponen solos, se piden. */
  vacios: CampoFecha[];
  /** La última que se confirmó: el error del rango va bajo ella. */
  cambiada: CampoFecha | null;
}

const SIN_FECHAS_EN_CURSO: EstadoFechas = { borrador: {}, vacios: [], cambiada: null };

export function useParametrosReporte() {
  const filtros = useFiltrosEnUrl(POR_DEFECTO);
  const [fechas, setFechas] = useState<EstadoFechas>(SIN_FECHAS_EN_CURSO);
  const valores = filtros.valores;
  const hoy = hoyEnArgentina();
  const efectivo = periodoEfectivo(valores, hoy);
  const errores = {
    ...erroresDelCampoCambiado(validarPeriodo(efectivo.desde, efectivo.hasta), fechas.cambiada),
    ...Object.fromEntries(fechas.vacios.map((c) => [c, fechaVacia(c)])),
  } as Partial<Record<CampoFecha, string>>;
  const agruparPor: Agrupacion =
    AGRUPACIONES.find((a) => a.valor === valores.agruparPor)?.valor ?? 'paciente';
  const pedido: PedidoPeriodo = {
    desde: efectivo.desde,
    hasta: efectivo.hasta,
    salaId: valores.salaId,
    tipo: valores.tipo,
  };

  /** Fija filtros en la URL y descarta lo que se estaba escribiendo en las fechas. */
  const fijarYOlvidarFechas = (cambios: Partial<typeof POR_DEFECTO>) => {
    setFechas(SIN_FECHAS_EN_CURSO);
    filtros.fijar(cambios);
  };

  return {
    valores,
    hoy,
    /** Las fechas que se piden y el atajo marcado (null con fechas elegidas). */
    efectivo,
    /** Lo que muestra cada campo de fecha: lo que se está escribiendo o lo que se pide. */
    valorDeFecha: (campo: CampoFecha) => fechas.borrador[campo] ?? efectivo[campo],
    /** Errores del período por campo, con los mensajes del servidor. */
    errores,
    valido: !errores.desde && !errores.hasta,
    pedido,
    agruparPor,
    hayFiltros: (Object.keys(FILTROS) as (keyof typeof FILTROS)[]).some(
      (clave) => valores[clave] !== FILTROS[clave],
    ),
    fijar: filtros.fijar,
    elegirAtajo: (atajo: Atajo) => fijarYOlvidarFechas({ periodo: atajo, desde: '', hasta: '' }),
    /** Lo que se escribe en una fecha queda en el campo, sin pedir nada todavía. */
    escribirFecha: (campo: CampoFecha, valor: string) =>
      setFechas((f) => ({
        ...f,
        borrador: { ...f.borrador, [campo]: valor },
        vacios: f.vacios.filter((c) => c !== campo),
      })),
    /**
     * Al salir del campo o con Enter: una fecha elegida fija las dos (el atajo deja de contar);
     * un campo vacío queda vacío y con su error, sin reponer lo que había.
     */
    confirmarFecha: (campo: CampoFecha) => {
      const valor = fechas.borrador[campo];
      if (valor === undefined) return;
      const { [campo]: _confirmada, ...resto } = fechas.borrador;
      if (valor === '') {
        setFechas((f) => ({ ...f, vacios: [...new Set([...f.vacios, campo])] }));
        return;
      }
      setFechas({ borrador: resto, vacios: fechas.vacios, cambiada: campo });
      if (valor === efectivo[campo]) return;
      filtros.fijar({
        desde: efectivo.desde,
        hasta: efectivo.hasta,
        [campo]: valor,
        periodo: ATAJO_POR_DEFECTO,
      });
    },
    quitarFiltros: () => fijarYOlvidarFechas(FILTROS),
  };
}

export type ParametrosReporte = ReturnType<typeof useParametrosReporte>;
