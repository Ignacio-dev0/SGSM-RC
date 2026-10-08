import readline from 'node:readline/promises';
import { Writable } from 'node:stream';

/** Lo que el instalador necesita para preguntar (en las pruebas, respuestas armadas). */
export interface Preguntador {
  preguntar(texto: string): Promise<string>;
  /** Sin eco: lo que se escribe no aparece en la pantalla (contraseñas). */
  preguntarOculto(texto: string): Promise<string>;
  cerrar(): void;
}

/**
 * Preguntas por la terminal (T803). Para la contraseña, el eco de readline va a una salida
 * silenciada: no se ve ni un asterisco. Ctrl+C o Ctrl+D cancelan la instalación antes de que
 * se toque la base.
 */
export function preguntadorDeTerminal(
  entrada: NodeJS.ReadableStream = process.stdin,
  salida: NodeJS.WritableStream = process.stdout,
): Preguntador {
  let silencio = false;
  const eco = new Writable({
    write(trozo: Buffer, _codificacion, listo) {
      if (!silencio) salida.write(trozo);
      listo();
    },
  });
  const rl = readline.createInterface({ input: entrada, output: eco, terminal: true });
  const cancelar = new AbortController();
  rl.on('SIGINT', () => cancelar.abort());
  rl.on('close', () => cancelar.abort());

  async function preguntar(texto: string, oculto: boolean) {
    if (cancelar.signal.aborted) throw new Error('Instalación cancelada');
    salida.write(texto);
    silencio = oculto;
    try {
      return await rl.question('', { signal: cancelar.signal });
    } catch {
      throw new Error('Instalación cancelada');
    } finally {
      silencio = false;
      if (oculto) salida.write('\n');
    }
  }

  return {
    preguntar: (texto) => preguntar(texto, false),
    preguntarOculto: (texto) => preguntar(texto, true),
    cerrar: () => rl.close(),
  };
}
