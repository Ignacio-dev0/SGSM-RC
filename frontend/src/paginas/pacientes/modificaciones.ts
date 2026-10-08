import type { HistorialPaciente } from '../../api/tipos';
import { compararValores, textoDeValor } from '../auditoria/comparacion';
import { nombreDeCampo } from '../auditoria/palabras';

/**
 * La pestaña Modificaciones del historial con las mismas palabras que la auditoría (F2): campos
 * con su nombre y valores con las palabras de las pantallas ("Vigente → Suspendida").
 */

export type Modificacion = HistorialPaciente['modificaciones'][number];

/** Lo que hace solo el sistema con los recordatorios: generarlos y vencerlos. */
const ACCIONES_AUTOMATICAS = new Set(['GENERAR', 'VENCER']);

/** Un aviso automático: el sistema (sin usuario) generó o venció un recordatorio. */
export const esAvisoAutomatico = (m: Modificacion) =>
  m.usuario === null && m.entidad === 'Recordatorio' && ACCIONES_AUTOMATICAS.has(m.accion);

/** Un valor en un renglón: lo compuesto (los insumos de un suministro) como pares "Campo: valor". */
function enLinea(valor: unknown, clave?: string): string {
  const texto = textoDeValor(valor, clave);
  if (texto !== null) return texto;
  if (Array.isArray(valor)) return valor.map((v) => enLinea(v)).join('; ');
  return Object.entries(valor as Record<string, unknown>)
    .map(([k, v]) => `${nombreDeCampo(k)}: ${enLinea(v, k)}`)
    .join(', ');
}

/**
 * "Estado: Vigente → Suspendida · Motivo del cambio de estado: Náuseas": con valores de los dos
 * lados, solo lo que cambió; con uno solo (lo que se creó), todo lo que se guardó. Sin campos, el
 * detalle que guardó la acción.
 */
export function cambiosEnPalabras(m: Modificacion) {
  const filas = compararValores(m.valorAnterior, m.valorNuevo);
  if (filas.length === 0) return m.detalle ?? '';
  const cambiaron = filas.filter((f) => f.cambio);
  return (cambiaron.length > 0 ? cambiaron : filas)
    .map((f) => {
      if (f.antes !== undefined && f.despues !== undefined) {
        return `${f.campo}: ${enLinea(f.antes, f.clave)} → ${enLinea(f.despues, f.clave)}`;
      }
      return `${f.campo}: ${enLinea(f.despues ?? f.antes, f.clave)}`;
    })
    .join(' · ');
}

/** El vacío de la pestaña cuando lo único que hay son avisos automáticos ocultos. */
export const soloAvisosAutomaticos = (ocultos: number) =>
  `No hay modificaciones hechas por personas. ${
    ocultos === 1
      ? 'El aviso automático de recordatorios está oculto'
      : `Los ${ocultos} avisos automáticos de recordatorios están ocultos`
  }: active «Mostrar los avisos automáticos» para verlos.`;
