// Ayudantes para probar qué pasa cuando dos transacciones se cruzan: una queda abierta, con sus
// bloqueos, mientras llega un pedido a la API.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/db';

export interface TransaccionAbierta {
  /** Confirma la transacción (suelta sus bloqueos) y espera a que termine. */
  confirmar(): Promise<void>;
}

/** Abre una transacción, hace `paso` y la deja abierta hasta llamar a `confirmar`. */
export async function transaccionAbierta(
  paso: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<TransaccionAbierta> {
  let soltar!: () => void;
  const suelta = new Promise<void>((r) => (soltar = r));
  let lista!: () => void;
  let fallo!: (e: unknown) => void;
  const hecho = new Promise<void>((r, f) => {
    lista = r;
    fallo = f;
  });
  const fin = prisma.$transaction(
    async (tx) => {
      await paso(tx);
      lista();
      await suelta;
    },
    { timeout: 15_000 },
  );
  fin.catch(fallo);
  await hecho;
  return {
    confirmar: async () => {
      soltar();
      await fin;
    },
  };
}

/**
 * Manda el pedido con la otra transacción abierta y la confirma un rato después. Devuelve la
 * respuesta y si llegó antes de confirmarla: si llegó, el pedido no esperó su bloqueo.
 */
export async function mientrasEspera<T>(
  pedido: PromiseLike<T>,
  otra: TransaccionAbierta,
  ms = 300,
) {
  let respondio = false;
  const respuesta = Promise.resolve(pedido).then((r) => {
    respondio = true;
    return r;
  });
  respuesta.catch(() => {});
  await new Promise((r) => setTimeout(r, ms));
  const respondioAntes = respondio;
  await otra.confirmar();
  return { res: await respuesta, respondioAntes };
}
