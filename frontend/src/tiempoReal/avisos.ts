/**
 * Aviso de recordatorios nuevos a quien atiende (S16): texto, tono corto y vibración, como mucho
 * uno cada 10 s y con el sonido desactivable en cada tablet. El sonido nunca es la única señal:
 * el texto va siempre (región aria-live y a la vista). En iOS no hay vibración y el audio puede
 * quedar bloqueado hasta que se toque la pantalla (riesgo R7): todo falla en silencio.
 */
import type { Programar } from './conexion';

export const textoNuevos = (n: number) =>
  n === 1 ? '1 recordatorio nuevo' : `${n} recordatorios nuevos`;

/** Intervalo mínimo entre dos avisos. */
export const INTERVALO_AVISOS_MS = 10_000;

const programarConTimeout: Programar = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/**
 * Junta los recordatorios nuevos y llama a `avisar` como mucho una vez cada `intervalo`: lo que
 * llega antes se suma y se avisa junto al cumplirse el intervalo, así no se pierde nada.
 */
export function crearAvisosAgrupados(
  avisar: (nuevos: number) => void,
  {
    intervalo = INTERVALO_AVISOS_MS,
    ahora = () => Date.now(),
    programar = programarConTimeout,
  }: { intervalo?: number; ahora?: () => number; programar?: Programar } = {},
) {
  let ultimo = -Infinity;
  let pendientes = 0;
  let cancelar: (() => void) | null = null;

  const emitir = () => {
    cancelar = null;
    ultimo = ahora();
    const n = pendientes;
    pendientes = 0;
    avisar(n);
  };

  return {
    sumar(n: number) {
      if (n <= 0) return;
      pendientes += n;
      if (cancelar) return;
      const espera = ultimo + intervalo - ahora();
      if (espera <= 0) emitir();
      else cancelar = programar(emitir, espera);
    },
    detener() {
      cancelar?.();
      cancelar = null;
      pendientes = 0;
    },
  };
}

/**
 * Dónde se recuerda en la tablet si los avisos suenan: 'no' (sin sonido ni vibración) o 'si'. Sin
 * nada guardado vale el valor por defecto de quien la usa (F8): encendido para el personal de sala,
 * apagado para el administrador.
 */
export const CLAVE_SONIDO = 'sgsm.sonidoAvisos';

export function leerPreferenciaSonido(porDefecto = true): boolean {
  try {
    const guardada = localStorage.getItem(CLAVE_SONIDO);
    return guardada === 'no' ? false : guardada === 'si' ? true : porDefecto;
  } catch {
    return porDefecto;
  }
}

/** Guarda solo lo que se aparta del valor por defecto; volver a él borra la elección. */
export function guardarPreferenciaSonido(activo: boolean, porDefecto = true) {
  try {
    if (activo === porDefecto) localStorage.removeItem(CLAVE_SONIDO);
    else localStorage.setItem(CLAVE_SONIDO, activo ? 'si' : 'no');
  } catch {
    // Sin almacenamiento (modo privado): la elección vale mientras la pantalla siga abierta.
  }
}

interface OpcionesAvisador {
  crearContexto?: () => AudioContext | null;
  vibrar?: (patron: number[]) => boolean;
}

const contextoDelNavegador = (): AudioContext | null => {
  const Contexto =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Contexto ? new Contexto() : null;
};

const vibrarDelNavegador = (patron: number[]) => navigator.vibrate?.(patron) ?? false;

/** Dos notas cortas (la, mi) de 150 ms: se distinguen de otros sonidos del hospital sin asustar. */
const NOTAS = [
  { frecuencia: 880, desde: 0 },
  { frecuencia: 659, desde: 0.2 },
];
const DURACION_NOTA = 0.15;
const PATRON_VIBRACION = [150, 100, 150];

/** Tono y vibración. Un solo contexto de audio, creado la primera vez que hace falta. */
export function crearAvisador({
  crearContexto = contextoDelNavegador,
  vibrar = vibrarDelNavegador,
}: OpcionesAvisador = {}) {
  let contexto: AudioContext | null | undefined;

  const obtenerContexto = () => {
    if (contexto === undefined) contexto = crearContexto();
    if (contexto?.state === 'suspended') void contexto.resume().catch(() => undefined);
    return contexto;
  };

  return {
    /** Se llama con un toque de la persona: el navegador recién ahí deja sonar el audio. */
    desbloquear() {
      try {
        obtenerContexto();
      } catch {
        // Sin Web Audio: se avisa solo con el texto (y la vibración, si hay).
      }
    },
    tono() {
      try {
        const ctx = obtenerContexto();
        if (!ctx) return;
        for (const nota of NOTAS) {
          const inicio = ctx.currentTime + nota.desde;
          const oscilador = ctx.createOscillator();
          const volumen = ctx.createGain();
          oscilador.type = 'sine';
          oscilador.frequency.value = nota.frecuencia;
          volumen.gain.setValueAtTime(0.0001, inicio);
          volumen.gain.exponentialRampToValueAtTime(0.25, inicio + 0.02);
          volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + DURACION_NOTA);
          oscilador.connect(volumen).connect(ctx.destination);
          oscilador.start(inicio);
          oscilador.stop(inicio + DURACION_NOTA);
        }
      } catch {
        // Audio bloqueado o no disponible: el texto ya avisó.
      }
    },
    vibrar() {
      try {
        vibrar(PATRON_VIBRACION);
      } catch {
        // Sin vibración (iOS, PC): el texto ya avisó.
      }
    },
  };
}

export type Avisador = ReturnType<typeof crearAvisador>;
