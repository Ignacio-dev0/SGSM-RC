import { useCallback, useState, type ReactNode } from 'react';
import { ModalValidacionFacial } from './ModalValidacionFacial';

interface Pedido {
  operacion: string;
  detalle?: ReactNode;
  resolver: (token: string | null) => void;
}

/**
 * Pide la validación facial desde cualquier pantalla:
 *
 *   const { pedirValidacion, modalValidacion } = useValidacionFacial();
 *   const token = await pedirValidacion('Administración de medicamento', <Resumen />);
 *   if (!token) return; // cancelada
 *
 * y renderizar `{modalValidacion}` en la pantalla. El detalle (opcional) se muestra dentro del
 * diálogo para que se vea qué se está confirmando mientras se mira a la cámara.
 */
export function useValidacionFacial() {
  const [pedido, setPedido] = useState<Pedido | null>(null);

  const pedirValidacion = useCallback(
    (operacion: string, detalle?: ReactNode) =>
      new Promise<string | null>((resolver) => setPedido({ operacion, detalle, resolver })),
    [],
  );

  const terminar = (token: string | null) => {
    pedido?.resolver(token);
    setPedido(null);
  };

  const modalValidacion = pedido ? (
    <ModalValidacionFacial
      operacion={pedido.operacion}
      detalle={pedido.detalle}
      alValidar={(token) => terminar(token)}
      alCancelar={() => terminar(null)}
    />
  ) : null;

  return { pedirValidacion, modalValidacion };
}
