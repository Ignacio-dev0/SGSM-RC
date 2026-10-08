import { createElement, lazy, Suspense, type ComponentType } from 'react';
import { Cargando } from './EstadoDeCarga';

/**
 * No llegó el código de una pantalla: red cortada o una versión nueva publicada (el archivo
 * viejo ya no está en el servidor). LimiteDeCarga lo explica; otros errores siguen de largo.
 */
export class ErrorDeCargaDePantalla extends Error {
  constructor(causa: unknown) {
    super('No se pudo descargar el código de la pantalla', { cause: causa });
    this.name = 'ErrorDeCargaDePantalla';
  }
}

export type PantallaDiferida = ComponentType & {
  /** Descarga el código de antemano (al apuntar a un enlace). Si falla, calla: se verá al abrirla. */
  precargar: () => void;
};

/**
 * Pantalla cuyo código se descarga recién al abrirla o al precargarla (T702 · RNF03), a partir
 * de su export con nombre: `pantallaDiferida(() => import('./paginas/x/X'), 'X')`.
 *
 * Trae su propio Suspense con el Cargando común: al llegar desde otra pantalla es un límite nuevo
 * y se muestra enseguida, aunque el router navegue con transiciones (si no, la pantalla anterior
 * quedaría quieta hasta que llegue el código, sin respuesta visible al toque).
 */
export function pantallaDiferida<M extends Record<N, ComponentType>, N extends string>(
  cargar: () => Promise<M>,
  nombre: N,
): PantallaDiferida {
  const Perezosa = lazy(() =>
    cargar().then(
      (modulo) => ({ default: modulo[nombre] }),
      (error: unknown) => {
        throw new ErrorDeCargaDePantalla(error);
      },
    ),
  );
  const Pantalla = () =>
    createElement(Suspense, { fallback: createElement(Cargando) }, createElement(Perezosa));
  Pantalla.displayName = `Diferida(${nombre})`;
  return Object.assign(Pantalla, { precargar: () => void cargar().catch(() => undefined) });
}
