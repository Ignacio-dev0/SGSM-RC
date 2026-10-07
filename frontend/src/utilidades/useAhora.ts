import { useEffect, useState } from 'react';

/** Hora actual que se renueva sola, para que "toca ahora" o "atrasada" no queden viejos. */
export function useAhora(cadaMs = 30_000) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), cadaMs);
    return () => clearInterval(id);
  }, [cadaMs]);
  return ahora;
}
