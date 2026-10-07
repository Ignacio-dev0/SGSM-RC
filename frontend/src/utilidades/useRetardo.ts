import { useEffect, useState } from 'react';

/** Devuelve `valor` recién cuando dejó de cambiar durante `ms` (búsqueda mientras se escribe). */
export function useRetardo<T>(valor: T, ms = 300): T {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}
