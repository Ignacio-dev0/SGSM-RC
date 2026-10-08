import { useCallback, useState } from 'react';
import { DialogoConfirmarEstudio, type DatosConocidos } from './DialogoConfirmarEstudio';
import type { ResultadoEstudio } from './useRefrescarEstudios';

export type ResultadoConfirmacion = ResultadoEstudio;
export type { PacienteDelEstudio } from './etiquetas';

/**
 * Confirmar con el rostro un estudio por su id desde cualquier pantalla (la ficha del paciente,
 * el panel de recordatorios para los recordatorios de ESTUDIO):
 *
 *   const { abrirConfirmacion, dialogoConfirmacion } = useConfirmacionEstudio({ alTerminar });
 *   abrirConfirmacion(r.estudio.id, { paciente: { apellido, nombre, dni, cama: r.cama?.numero ?? null } });
 *
 * y renderizar `{dialogoConfirmacion}`. El diálogo pide el estado actual del estudio. `alTerminar`
 * recibe el aviso para mostrar: éxito, o que otra persona ya lo había confirmado o cancelado (409).
 * Las consultas de estudios, del historial del paciente y de recordatorios se renuevan solas.
 */
export function useConfirmacionEstudio({
  alTerminar,
}: { alTerminar?: (r: ResultadoConfirmacion) => void } = {}) {
  const [pedido, setPedido] = useState<(DatosConocidos & { estudioId: number }) | null>(null);

  const abrirConfirmacion = useCallback(
    (estudioId: number, datos: DatosConocidos = {}) => setPedido({ estudioId, ...datos }),
    [],
  );

  const dialogoConfirmacion = pedido ? (
    <DialogoConfirmarEstudio
      key={pedido.estudioId}
      {...pedido}
      alCerrar={() => setPedido(null)}
      alTerminar={(r) => {
        setPedido(null);
        alTerminar?.(r);
      }}
    />
  ) : null;

  return { abrirConfirmacion, dialogoConfirmacion };
}
