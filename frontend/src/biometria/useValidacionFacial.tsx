import { useCallback, useState } from 'react';
import { ModalValidacionFacial } from './ModalValidacionFacial';

interface Pedido {
  operacion: string;
  resolver: (token: string | null) => void;
}

/**
 * Pide la validación facial desde cualquier pantalla:
 *
 *   const { pedirValidacion, modalValidacion } = useValidacionFacial();
 *   const token = await pedirValidacion('Administración de medicamento');
 *   if (!token) return; // cancelada
 *
 * y renderizar `{modalValidacion}` en la pantalla.
 */
export function useValidacionFacial() {
  const [pedido, setPedido] = useState<Pedido | null>(null);

  const pedirValidacion = useCallback(
    (operacion: string) =>
      new Promise<string | null>((resolver) => setPedido({ operacion, resolver })),
    [],
  );

  const terminar = (token: string | null) => {
    pedido?.resolver(token);
    setPedido(null);
  };

  const modalValidacion = pedido ? (
    <ModalValidacionFacial
      operacion={pedido.operacion}
      alValidar={(token) => terminar(token)}
      alCancelar={() => terminar(null)}
    />
  ) : null;

  return { pedirValidacion, modalValidacion };
}
