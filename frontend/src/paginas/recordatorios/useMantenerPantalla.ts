import { useCallback, useEffect, useState } from 'react';

/** Dónde se recuerda en la tablet que el panel mantenga la pantalla encendida ('si'). */
export const CLAVE_PANTALLA = 'sgsm.pantallaEncendida';

/** Lo que se usa de la Screen Wake Lock API (las pruebas pasan uno falso). */
interface Centinela {
  released: boolean;
  release(): Promise<void>;
}
interface WakeLock {
  request(tipo: 'screen'): Promise<Centinela>;
}

const wakeLock = (): WakeLock | undefined =>
  (globalThis.navigator as (Navigator & { wakeLock?: WakeLock }) | undefined)?.wakeLock;

function leerPreferencia() {
  try {
    return localStorage.getItem(CLAVE_PANTALLA) === 'si';
  } catch {
    return false;
  }
}

function guardarPreferencia(activo: boolean) {
  try {
    if (activo) localStorage.setItem(CLAVE_PANTALLA, 'si');
    else localStorage.removeItem(CLAVE_PANTALLA);
  } catch {
    // Sin almacenamiento (modo privado): vale mientras el panel siga abierto.
  }
}

/**
 * "Mantener la pantalla encendida" (ESC2): mientras el panel está abierto y el interruptor
 * prendido, pide al navegador que la tablet no apague la pantalla (Screen Wake Lock), para dejar
 * el panel a la vista en el office de enfermería. Apagado por defecto y recordado en cada tablet.
 * El navegador lo suelta solo cuando la pantalla deja de verse (se bloqueó, se cambió de app): al
 * volver se pide de nuevo. Al salir del panel se suelta. Sin la API (`soportado` falso), nada.
 */
export function useMantenerPantalla() {
  const soportado = wakeLock() !== undefined;
  const [activo, setActivo] = useState(() => soportado && leerPreferencia());

  useEffect(() => {
    const api = wakeLock();
    if (!activo || !api) return;
    let centinela: Centinela | null = null;
    let pidiendo = false;
    let vigente = true;

    const pedir = async () => {
      if (pidiendo || document.visibilityState === 'hidden') return;
      if (centinela && !centinela.released) return;
      pidiendo = true;
      try {
        const nuevo = await api.request('screen');
        if (vigente) centinela = nuevo;
        else void nuevo.release().catch(() => undefined);
      } catch {
        // Sin permiso o con la batería baja el navegador lo niega: la pantalla se apaga como siempre.
      } finally {
        pidiendo = false;
      }
    };

    void pedir();
    const alVolver = () => void pedir();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vigente = false;
      document.removeEventListener('visibilitychange', alVolver);
      void centinela?.release().catch(() => undefined);
    };
  }, [activo]);

  const fijar = useCallback((valor: boolean) => {
    guardarPreferencia(valor);
    setActivo(valor);
  }, []);

  return { soportado, activo, fijar };
}
