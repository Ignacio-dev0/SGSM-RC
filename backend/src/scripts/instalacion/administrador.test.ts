import { datosDelAdministrador, VARIABLES_ADMIN } from './administrador';
import { ErrorInstalacion } from './errores';
import type { Preguntador } from './terminal';

const CLAVE = 'Directora2026';
const ENTORNO = {
  INSTALAR_ADMIN_USUARIO: ' LMendez ',
  INSTALAR_ADMIN_NOMBRE: 'Laura',
  INSTALAR_ADMIN_APELLIDO: 'Méndez',
  INSTALAR_ADMIN_DNI: '20111111',
  INSTALAR_ADMIN_CLAVE: CLAVE,
};

/** Respuestas armadas; anota cada pregunta y si fue sin eco. */
function terminalFalsa(respuestas: string[]) {
  const preguntas: string[] = [];
  const responder = async (texto: string) => {
    preguntas.push(texto);
    const r = respuestas.shift();
    if (r === undefined) throw new Error('Instalación cancelada');
    return r;
  };
  const terminal: Preguntador & { preguntas: string[] } = {
    preguntas,
    preguntar: responder,
    preguntarOculto: (texto) => responder(`[oculta] ${texto}`),
    cerrar: () => {},
  };
  return terminal;
}

function consolaFalsa() {
  const lineas: string[] = [];
  return { lineas, info: (l: string) => lineas.push(l), error: (l: string) => lineas.push(l) };
}

/** Datos del primer administrador (T803 · D105): variables de entorno o terminal. */
describe('datos del primer administrador', () => {
  it('con todas las variables no pregunta nada y normaliza como el alta (usuario en minúsculas)', async () => {
    const terminal = terminalFalsa([]);
    expect(await datosDelAdministrador(ENTORNO, terminal, consolaFalsa())).toEqual({
      nombreUsuario: 'lmendez',
      nombre: 'Laura',
      apellido: 'Méndez',
      dni: '20111111',
      contrasena: CLAVE,
    });
    expect(terminal.preguntas).toEqual([]);
  });

  it('sin variables ni terminal: error que nombra las variables que faltan', async () => {
    const r = datosDelAdministrador({ INSTALAR_ADMIN_USUARIO: 'lmendez' }, null, consolaFalsa());
    await expect(r).rejects.toThrow(ErrorInstalacion);
    await expect(r).rejects.toThrow(
      'No hay ningún administrador activo y faltan INSTALAR_ADMIN_NOMBRE, INSTALAR_ADMIN_APELLIDO, ' +
        'INSTALAR_ADMIN_DNI, INSTALAR_ADMIN_CLAVE: indíquelas o corra el instalador en una terminal interactiva',
    );
  });

  it('una variable que no cumple las reglas del alta es un error que no muestra la contraseña', async () => {
    const r = datosDelAdministrador(
      { ...ENTORNO, INSTALAR_ADMIN_CLAVE: 'corta1', INSTALAR_ADMIN_DNI: '20.111' },
      terminalFalsa([]),
      consolaFalsa(),
    );
    await expect(r).rejects.toThrow(
      'INSTALAR_ADMIN_DNI: El DNI debe tener 7 u 8 dígitos, sin puntos\n' +
        'INSTALAR_ADMIN_CLAVE: La contraseña debe tener al menos 8 caracteres',
    );
    await expect(r).rejects.not.toThrow(/corta1/);
  });

  it('con terminal pregunta solo lo que falta; la contraseña sin eco y dos veces', async () => {
    const terminal = terminalFalsa(['Méndez', '20111111', CLAVE, CLAVE]);
    const datos = await datosDelAdministrador(
      { INSTALAR_ADMIN_USUARIO: 'lmendez', INSTALAR_ADMIN_NOMBRE: 'Laura' },
      terminal,
      consolaFalsa(),
    );
    expect(datos).toMatchObject({
      nombreUsuario: 'lmendez',
      apellido: 'Méndez',
      contrasena: CLAVE,
    });
    expect(terminal.preguntas).toEqual([
      'Apellido: ',
      'DNI (sin puntos): ',
      '[oculta] Contraseña (no se muestra al escribirla): ',
      '[oculta] Repita la contraseña: ',
    ]);
  });

  it('una respuesta inválida dice por qué y vuelve a preguntar; también si no coinciden', async () => {
    const consola = consolaFalsa();
    const terminal = terminalFalsa([
      'laura mendez',
      'lmendez',
      'Laura',
      'Méndez',
      '20111111',
      'sinnumeros',
      CLAVE,
      'OtraClave2026',
      CLAVE,
      CLAVE,
    ]);
    const datos = await datosDelAdministrador({}, terminal, consola);

    expect(datos.nombreUsuario).toBe('lmendez');
    expect(datos.contrasena).toBe(CLAVE);
    expect(consola.lineas).toEqual([
      'No hay ningún administrador activo: se va a crear el primero.',
      '  El usuario debe tener de 3 a 30 caracteres: letras sin tildes ni ñ, números, punto (.), guion (-) o guion bajo (_), sin espacios',
      '  La contraseña debe tener al menos un número',
      '  Las contraseñas no coinciden',
    ]);
    expect(consola.lineas.join('\n')).not.toContain(CLAVE);
  });

  it('después de cinco respuestas inválidas para un mismo dato, se cancela', async () => {
    const r = datosDelAdministrador({}, terminalFalsa(Array(5).fill('x y')), consolaFalsa());
    await expect(r).rejects.toThrow('Demasiados intentos para "Usuario": instalación cancelada');
  });

  it('las variables son las documentadas en docs/entorno.md', () => {
    expect(Object.values(VARIABLES_ADMIN)).toEqual([
      'INSTALAR_ADMIN_USUARIO',
      'INSTALAR_ADMIN_NOMBRE',
      'INSTALAR_ADMIN_APELLIDO',
      'INSTALAR_ADMIN_DNI',
      'INSTALAR_ADMIN_CLAVE',
    ]);
  });
});
