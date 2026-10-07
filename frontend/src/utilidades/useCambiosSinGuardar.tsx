import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';
import { ModalConfirmacion } from '../componentes/ModalConfirmacion';

/** Adonde se va al cerrar la sesión o cuando vence: eso nunca se frena. */
const RUTA_DE_INGRESO = '/ingresar';

/**
 * Protege un formulario a medio cargar (UX-11). Mientras `hayCambios` sea verdadero, cualquier
 * salida de la pantalla —Cancelar, la flecha Volver, el menú, el botón Atrás de la tablet— frena
 * y pregunta "¿Descartar lo cargado?"; cerrar o recargar la pestaña pide la confirmación del
 * navegador. Ir al ingreso (cerrar sesión, sesión vencida) no se frena nunca.
 *
 * Devuelve el `dialogo`, que la pantalla debe renderizar, y `permitirSalida()`, que se llama justo
 * antes de navegar después de guardar con éxito: el estado todavía no se actualizó y, sin eso, el
 * guardado mismo preguntaría si se descarta.
 *
 *   const { dialogo, permitirSalida } = useCambiosSinGuardar(hayDiferencias(datos, VACIO));
 *   …onSuccess: () => { permitirSalida(); navegar('/pacientes'); }
 *   …return <>…{dialogo}</>;
 *
 * Necesita un router de datos (`createBrowserRouter`), como el de App.tsx.
 */
export function useCambiosSinGuardar(hayCambios: boolean): {
  dialogo: ReactNode;
  permitirSalida: () => void;
} {
  // Refs, no estado: la decisión de frenar se toma en el momento de navegar, con el valor de ese
  // instante, y no tiene que volver a registrar el bloqueo en cada render.
  const hayCambiosAhora = useRef(hayCambios);
  hayCambiosAhora.current = hayCambios;
  const salidaPermitida = useRef(false);

  // Si después de permitir la salida se vuelve a editar, la pantalla vuelve a estar protegida.
  useEffect(() => {
    if (hayCambios) salidaPermitida.current = false;
  }, [hayCambios]);

  const bloqueador = useBlocker(
    useCallback<BlockerFunction>(
      ({ currentLocation, nextLocation }) =>
        hayCambiosAhora.current &&
        !salidaPermitida.current &&
        nextLocation.pathname !== RUTA_DE_INGRESO &&
        (currentLocation.pathname !== nextLocation.pathname ||
          currentLocation.search !== nextLocation.search),
      [],
    ),
  );

  useEffect(() => {
    if (!hayCambios) return;
    const avisar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      // Los navegadores que no entienden preventDefault() piden el valor en blanco.
      evento.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [hayCambios]);

  const dialogo = (
    <ModalConfirmacion
      abierto={bloqueador.state === 'blocked'}
      titulo="¿Descartar lo cargado?"
      mensaje="Lo que cargó todavía no se guardó. Si continúa, se pierde."
      textoCancelar="Seguir editando"
      textoConfirmar="Descartar"
      peligroso
      alConfirmar={() => bloqueador.state === 'blocked' && bloqueador.proceed()}
      alCancelar={() => bloqueador.state === 'blocked' && bloqueador.reset()}
    />
  );

  const permitirSalida = useCallback(() => {
    salidaPermitida.current = true;
  }, []);

  return { dialogo, permitirSalida };
}

/**
 * Si algún valor del formulario es distinto del original. Para formularios planos de texto y
 * números (todos los de esta aplicación); los dos objetos tienen las mismas claves.
 */
export function hayDiferencias<T extends object>(actual: T, original: T): boolean {
  return (Object.keys(original) as (keyof T)[]).some((clave) => actual[clave] !== original[clave]);
}
