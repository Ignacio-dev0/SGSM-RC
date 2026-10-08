import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Lleva el foco al primer campo con error (`aria-invalid="true"`) dentro del contenedor, después
 * de que se pintaron los errores. Así quien usa teclado o lector de pantalla llega directo a lo
 * que tiene que corregir, y en la tablet el campo queda a la vista.
 *
 *   const { ref, enfocarPrimerError } = useFocoEnPrimerError<HTMLFormElement>();
 *   setErrores(faltan); enfocarPrimerError();
 */
export function useFocoEnPrimerError<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [pedido, setPedido] = useState(0);

  useEffect(() => {
    if (pedido === 0) return;
    const campo = ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    campo?.focus();
    campo?.scrollIntoView?.({ block: 'center' });
  }, [pedido]);

  const enfocarPrimerError = useCallback(() => setPedido((n) => n + 1), []);
  return { ref, enfocarPrimerError };
}
