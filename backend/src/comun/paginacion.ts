import { z } from 'zod';
import { validar } from './validacion';

/** Parámetros de paginación de la convención de la API (docs/api.md). */
export const esquemaPaginacion = z.object({
  pagina: z.coerce.number().int().min(1, 'La página empieza en 1').default(1),
  porPagina: z.coerce
    .number()
    .int()
    .min(1)
    .max(100, 'Se pueden pedir hasta 100 elementos por página')
    .default(20),
});

export interface Paginacion {
  pagina: number;
  porPagina: number;
  skip: number;
  take: number;
}

/** Lee `pagina` y `porPagina` de la query y devuelve también `skip`/`take` para Prisma. */
export function leerPaginacion(query: unknown): Paginacion {
  const { pagina, porPagina } = validar(esquemaPaginacion, query);
  return { pagina, porPagina, skip: (pagina - 1) * porPagina, take: porPagina };
}

export function respuestaPaginada<T>(
  data: T[],
  total: number,
  { pagina, porPagina }: Pick<Paginacion, 'pagina' | 'porPagina'>,
) {
  return { data, meta: { pagina, porPagina, total, totalPaginas: Math.ceil(total / porPagina) } };
}
