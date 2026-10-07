import { useState } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';

type Valores = Record<string, string>;

interface Estado<T> {
  valores: T;
  /** Empieza en 1, igual que la API. */
  pagina: number;
}

/** Parámetro de la URL donde va la página; ningún filtro puede llamarse así. */
const PARAMETRO_PAGINA = 'pagina';

/** Filtros y página que trae la URL; lo que falta toma el valor por defecto. */
function leer<T extends Valores>(parametros: URLSearchParams, porDefecto: T): Estado<T> {
  const valores = { ...porDefecto };
  for (const clave of Object.keys(porDefecto) as (keyof T & string)[]) {
    const valor = parametros.get(clave);
    // Un valor vacío ("estado=") es un valor: es "Todos" cuando el defecto no lo es.
    if (valor !== null) valores[clave] = valor as T[keyof T & string];
  }
  const pagina = Number(parametros.get(PARAMETRO_PAGINA));
  return { valores, pagina: Number.isInteger(pagina) && pagina >= 1 ? pagina : 1 };
}

/** Los parámetros de `base` con los filtros y la página puestos; lo que vale el defecto no se escribe. */
function escribir<T extends Valores>(
  base: URLSearchParams,
  porDefecto: T,
  { valores, pagina }: Estado<T>,
): URLSearchParams {
  const siguiente = new URLSearchParams(base);
  for (const clave of Object.keys(porDefecto) as (keyof T & string)[]) {
    const valor = valores[clave] ?? '';
    if (valor === porDefecto[clave]) siguiente.delete(clave);
    else siguiente.set(clave, valor);
  }
  if (pagina === 1) siguiente.delete(PARAMETRO_PAGINA);
  else siguiente.set(PARAMETRO_PAGINA, String(pagina));
  return siguiente;
}

/**
 * Filtros y página de un listado guardados en la URL (`?texto=a-01&estado=EGRESADO&pagina=2`):
 * al abrir un registro y volver, la búsqueda sigue ahí. Cada filtro es un texto; lo que vale lo
 * mismo que `porDefecto` no se escribe, así la URL de la vista inicial queda limpia.
 *
 * Los valores viven también en el estado del componente (el campo responde al instante, sin
 * esperar la navegación) y se copian a la URL reemplazando la entrada del historial, para que
 * Atrás vuelva a la pantalla anterior y no deshaga cada tecla. Una navegación que no es la
 * propia (un enlace a la misma pantalla con otros filtros, Atrás o Adelante) se adopta.
 *
 * `porDefecto` va definido fuera del componente: sus claves son los parámetros de la URL.
 */
export function useFiltrosEnUrl<T extends Valores>(porDefecto: T) {
  const [parametros, fijarParametros] = useSearchParams();
  const ubicacion = useLocation();
  const tipoNavegacion = useNavigationType();
  const [estado, setEstado] = useState(() => leer(parametros, porDefecto));
  const [claveVista, setClaveVista] = useState(ubicacion.key);

  if (ubicacion.key !== claveVista) {
    setClaveVista(ubicacion.key);
    if (tipoNavegacion !== 'REPLACE') setEstado(leer(parametros, porDefecto));
  }

  const aplicar = (siguiente: Estado<T>) => {
    setEstado(siguiente);
    // El `state` de la navegación se conserva: un aviso que dejó otra pantalla no se pierde.
    fijarParametros(escribir(parametros, porDefecto, siguiente), {
      replace: true,
      state: ubicacion.state,
    });
  };

  return {
    valores: estado.valores,
    pagina: estado.pagina,
    /** Cambia uno o más filtros y vuelve a la página 1. */
    fijar: (cambios: Partial<T>) =>
      aplicar({ valores: { ...estado.valores, ...cambios }, pagina: 1 }),
    irAPagina: (pagina: number) => aplicar({ valores: estado.valores, pagina }),
    /** Vuelve a la vista inicial: valores por defecto, página 1. */
    quitarFiltros: () => aplicar({ valores: porDefecto, pagina: 1 }),
    /**
     * ¿Algún filtro difiere del valor por defecto? Se puede pasar los valores que de verdad se
     * están aplicando (por ejemplo, con el texto ya demorado); sin argumento usa los del campo.
     */
    hayFiltros: (valores: T = estado.valores) =>
      Object.keys(porDefecto).some((clave) => valores[clave] !== porDefecto[clave]),
  };
}
