import { PassThrough, Writable } from 'node:stream';
import { preguntadorDeTerminal } from './terminal';

/** Preguntas del instalador en una terminal interactiva (T803): la contraseña, sin eco. */
describe('preguntas en la terminal', () => {
  let entrada: PassThrough;
  let mostrado: string;
  let salida: Writable;
  beforeEach(() => {
    entrada = new PassThrough();
    mostrado = '';
    salida = new Writable({
      write(trozo: Buffer, _codificacion, listo) {
        mostrado += trozo.toString();
        listo();
      },
    });
  });

  it('una pregunta común muestra lo que se escribe y devuelve la respuesta', async () => {
    const terminal = preguntadorDeTerminal(entrada, salida);
    const respuesta = terminal.preguntar('Usuario: ');
    entrada.write('jperez\n');
    expect(await respuesta).toBe('jperez');
    expect(mostrado).toContain('Usuario: ');
    expect(mostrado).toContain('jperez');
    terminal.cerrar();
  });

  it('la contraseña no se muestra mientras se escribe (sin eco)', async () => {
    const terminal = preguntadorDeTerminal(entrada, salida);
    const respuesta = terminal.preguntarOculto('Contraseña: ');
    entrada.write('Secreta2026\n');
    expect(await respuesta).toBe('Secreta2026');
    expect(mostrado).toContain('Contraseña: ');
    expect(mostrado).not.toContain('Secreta');

    // Después de la contraseña, lo demás se vuelve a ver.
    const otra = terminal.preguntar('Nombre: ');
    entrada.write('Juana\n');
    expect(await otra).toBe('Juana');
    expect(mostrado).toContain('Juana');
    terminal.cerrar();
  });

  it('si se cierra la entrada (Ctrl+D) la pregunta falla: "Instalación cancelada"', async () => {
    const terminal = preguntadorDeTerminal(entrada, salida);
    const respuesta = terminal.preguntar('Usuario: ');
    entrada.end();
    await expect(respuesta).rejects.toThrow('Instalación cancelada');
    terminal.cerrar();
  });
});
