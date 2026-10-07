import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '../../db';
import { limpiarBase } from '../../../tests/soporte/base';
import { crearUsuario } from '../../../tests/soporte/sesion';
import { verificarContrasena } from '../../modulos/auth/contrasenas';
import { CODIGOS_PERMISO } from '../../modulos/seguridad/catalogo-permisos';
import { esquemaContrasena } from '../../modulos/usuarios/usuarios.esquemas';
import { sembrarSeguridad, TIPOS_ESTUDIO } from '../../semillas/catalogo-base';
import { ejecutarInstalador } from './instalador';
import type { Preguntador } from './terminal';

const CLAVE = 'Directora2026';
const ENTORNO = {
  INSTALAR_ADMIN_USUARIO: 'lmendez',
  INSTALAR_ADMIN_NOMBRE: 'Laura',
  INSTALAR_ADMIN_APELLIDO: 'Méndez',
  INSTALAR_ADMIN_DNI: '20111111',
  INSTALAR_ADMIN_CLAVE: CLAVE,
};

const SALAS =
  'sala,cama\nSala Ejemplo A,EA-01\nSala Ejemplo A,EA-02\nSala Ejemplo A,EA-03\nSala Ejemplo B,EB-01\nSala Ejemplo B,EB-02\n';
const CATALOGO =
  'tipo;nombre;presentacion;unidad\nMedicamento;Ficticina;Comprimidos 10 mg;mg\nInsumo;Gasa de ejemplo;Sobre x 1;unidad\nINSUMO;Guante de ejemplo;;par\n';
const PERSONAL =
  'usuario,nombre,apellido,dni,rol,email\naejemplo,Ana,Ejemplo,10000001,Médica,ana@ejemplo.test\nbficticio,Beto,Ficticio,10000002,Enfermero,\ncprueba,Carla,Prueba,10000003,enfermera,\n';

/** Instalador para la primera puesta en marcha (T803 · docs/despliegue.md, paso 7). */
describe('instalador (T803)', () => {
  let carpeta: string;
  beforeEach(async () => {
    await limpiarBase();
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'sgsm-instalador-'));
  });
  afterEach(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  afterAll(() => prisma.$disconnect());

  const archivo = (nombre: string, contenido: string) => {
    const ruta = path.join(carpeta, nombre);
    fs.writeFileSync(ruta, contenido);
    return ruta;
  };

  async function instalar(
    args: string[],
    {
      env = ENTORNO,
      terminal = null,
    }: { env?: NodeJS.ProcessEnv; terminal?: Preguntador | null } = {},
  ) {
    const salida: string[] = [];
    const errores: string[] = [];
    const codigo = await ejecutarInstalador(args, {
      env,
      preguntador: terminal,
      consola: { info: (l) => salida.push(l), error: (l) => errores.push(l) },
    });
    return { codigo, salida, errores, todo: [...salida, ...errores].join('\n') };
  }

  const auditoriaDe = (entidad: string) =>
    prisma.auditoria.findMany({ where: { entidad }, orderBy: { id: 'asc' } });

  describe('datos base y primer administrador', () => {
    it('base vacía: roles, permisos y tipos de estudio, y el primer administrador auditado sin actor', async () => {
      const r = await instalar([]);

      expect(r.codigo).toBe(0);
      expect(await prisma.rol.count()).toBe(3);
      expect(await prisma.permiso.count()).toBe(CODIGOS_PERMISO.length);
      expect(await prisma.tipoEstudio.count()).toBe(TIPOS_ESTUDIO.length);
      // Las salas y el catálogo de demostración no van a producción (D102).
      expect(await prisma.sala.count()).toBe(0);
      expect(await prisma.insumo.count()).toBe(0);

      const admin = await prisma.usuario.findUniqueOrThrow({
        where: { nombreUsuario: 'lmendez' },
        include: { rol: true },
      });
      expect(admin).toMatchObject({ activo: true, dni: '20111111', apellido: 'Méndez' });
      expect(admin.rol.codigo).toBe('ADMINISTRADOR');
      expect(await verificarContrasena(CLAVE, admin.contrasenaHash)).toBe(true);

      const [alta, ...otras] = await auditoriaDe('Usuario');
      expect(otras).toEqual([]);
      expect(alta).toMatchObject({
        usuarioId: null,
        accion: 'CREAR',
        entidadId: String(admin.id),
        detalle: 'Primer administrador, creado por el instalador',
        valorNuevo: expect.objectContaining({ nombreUsuario: 'lmendez', rol: 'ADMINISTRADOR' }),
      });
      expect(JSON.stringify(alta)).not.toContain(CLAVE);

      expect(r.salida).toEqual([
        `Datos base: 3 roles y ${CODIGOS_PERMISO.length} permisos al día con esta versión; tipos de estudio: ${TIPOS_ESTUDIO.length} nuevos (0 ya estaban).`,
        'Primer administrador: se creó "lmendez" (Méndez, Laura).',
        'Aviso: no hay camas cargadas y sin ellas no se puede internar: cárguelas con --salas.',
        'Aviso: el catálogo de medicamentos e insumos está vacío: cárguelo con --catalogo o desde Catálogo.',
        'Instalación terminada.',
      ]);
      expect(r.todo).not.toContain(CLAVE);
    });

    it('es idempotente: la segunda vez no crea otro administrador y lo dice (sin pedir datos)', async () => {
      await instalar([]);
      const r = await instalar([], { env: {} });

      expect(r.codigo).toBe(0);
      expect(r.salida).toContain(
        'Primer administrador: ya hay uno activo ("lmendez"), no se creó otro.',
      );
      expect(r.salida[0]).toMatch(/tipos de estudio: 0 nuevos \(8 ya estaban\)\.$/);
      expect(await prisma.usuario.count()).toBe(1);
      expect(await auditoriaDe('Usuario')).toHaveLength(1);
      expect(await prisma.tipoEstudio.count()).toBe(TIPOS_ESTUDIO.length);
    });

    it('un administrador dado de baja no cuenta: se crea el primero activo', async () => {
      await sembrarSeguridad(prisma);
      await crearUsuario('ADMINISTRADOR', { nombreUsuario: 'viejo', activo: false });
      await crearUsuario('MEDICO');

      expect((await instalar([])).codigo).toBe(0);
      expect(
        await prisma.usuario.count({ where: { activo: true, rol: { codigo: 'ADMINISTRADOR' } } }),
      ).toBe(1);
    });

    it('sin administrador, sin variables y sin terminal: no toca la base y dice qué falta', async () => {
      const r = await instalar([], { env: {} });

      expect(r.codigo).toBe(1);
      expect(r.errores).toEqual([
        'No se cargó nada. Corrija lo siguiente y vuelva a correr el instalador:',
        '  No hay ningún administrador activo y faltan INSTALAR_ADMIN_USUARIO, INSTALAR_ADMIN_NOMBRE, ' +
          'INSTALAR_ADMIN_APELLIDO, INSTALAR_ADMIN_DNI, INSTALAR_ADMIN_CLAVE: indíquelas o corra el ' +
          'instalador en una terminal interactiva',
      ]);
      expect(await prisma.rol.count()).toBe(0);
    });

    it('con terminal pregunta los datos (la contraseña sin eco) y nunca la muestra', async () => {
      const respuestas = ['lmendez', 'Laura', 'Méndez', '20111111', CLAVE, CLAVE];
      const ocultas: string[] = [];
      const terminal: Preguntador = {
        preguntar: async () => respuestas.shift()!,
        preguntarOculto: async (texto) => {
          ocultas.push(texto);
          return respuestas.shift()!;
        },
        cerrar: () => {},
      };
      const r = await instalar([], { env: {}, terminal });

      expect(r.codigo).toBe(0);
      expect(ocultas).toHaveLength(2);
      const admin = await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'lmendez' } });
      expect(await verificarContrasena(CLAVE, admin.contrasenaHash)).toBe(true);
      expect(r.todo).not.toContain(CLAVE);
    });

    it('una contraseña que no cumple las reglas del alta: no se crea nada ni se muestra', async () => {
      const r = await instalar([], { env: { ...ENTORNO, INSTALAR_ADMIN_CLAVE: 'corta1' } });

      expect(r.codigo).toBe(1);
      expect(r.errores).toContain(
        '  INSTALAR_ADMIN_CLAVE: La contraseña debe tener al menos 8 caracteres',
      );
      expect(r.todo).not.toContain('corta1');
      expect(await prisma.usuario.count()).toBe(0);
    });

    it('el usuario o DNI de alguien que ya existe: no se carga nada', async () => {
      await sembrarSeguridad(prisma);
      await crearUsuario('ADMINISTRADOR', { nombreUsuario: 'lmendez', activo: false });

      const r = await instalar([]);
      expect(r.codigo).toBe(1);
      expect(r.errores).toContain(
        '  Ya hay un usuario "lmendez" (dado de baja) con ese usuario o DNI: elija otros datos para el primer administrador',
      );
      expect(await prisma.tipoEstudio.count()).toBe(0);
    });
  });

  describe('salas.csv', () => {
    it('carga salas y camas, las audita y la segunda vez dice que ya estaban', async () => {
      const ruta = archivo('salas.csv', SALAS);
      const r = await instalar(['--salas', ruta]);

      expect(r.codigo).toBe(0);
      expect(r.salida).toContain(
        'salas.csv: 2 salas nuevas (0 ya estaban) y 5 camas nuevas (0 ya estaban).',
      );
      expect(r.salida.join('\n')).not.toMatch(/no hay camas/);
      const salas = await prisma.sala.findMany({
        include: { camas: true },
        orderBy: { id: 'asc' },
      });
      expect(salas.map((s) => [s.nombre, s.activa, s.camas.map((c) => c.numero).sort()])).toEqual([
        ['Sala Ejemplo A', true, ['EA-01', 'EA-02', 'EA-03']],
        ['Sala Ejemplo B', true, ['EB-01', 'EB-02']],
      ]);
      const auditoriaSalas = await auditoriaDe('Sala');
      expect(auditoriaSalas).toHaveLength(2);
      expect(auditoriaSalas[0]).toMatchObject({
        usuarioId: null,
        accion: 'CREAR',
        entidadId: String(salas[0]!.id),
        valorNuevo: { nombre: 'Sala Ejemplo A' },
        detalle: 'Instalador: salas.csv, fila 2',
      });
      const auditoriaCamas = await auditoriaDe('Cama');
      expect(auditoriaCamas).toHaveLength(5);
      expect(auditoriaCamas[4]).toMatchObject({
        usuarioId: null,
        accion: 'CREAR',
        valorNuevo: { salaId: salas[1]!.id, cama: 'EB-02' },
        detalle: 'Instalador: salas.csv, fila 6',
      });

      fs.appendFileSync(ruta, 'Sala Ejemplo B,EB-03\n');
      const otra = await instalar(['--salas', ruta]);
      expect(otra.salida).toContain(
        'salas.csv: 0 salas nuevas (2 ya estaban) y 1 cama nueva (5 ya estaban).',
      );
      expect(await prisma.cama.count()).toBe(6);
    });

    it('una sala o cama escrita distinto que una que ya existe es un error y no se carga nada', async () => {
      await instalar(['--salas', archivo('salas.csv', SALAS)]);
      const r = await instalar([
        '--salas',
        archivo(
          'mas-salas.csv',
          'sala,cama\nSala Nueva,N-01\nsala ejemplo a,EA-09\nSala Ejemplo B,eb-01\n',
        ),
      ]);

      expect(r.codigo).toBe(1);
      expect(r.errores).toEqual([
        'No se cargó nada. Corrija lo siguiente y vuelva a correr el instalador:',
        '  mas-salas.csv: Fila 3, sala: "sala ejemplo a" está escrita distinto que la sala "Sala Ejemplo A" que ya existe: escríbala igual',
        '  mas-salas.csv: Fila 4, cama: "eb-01" está escrita distinto que la cama "EB-01" que ya existe en "Sala Ejemplo B": escríbala igual',
      ]);
      expect(await prisma.sala.count()).toBe(2);
      expect(await prisma.cama.count()).toBe(5);
    });
  });

  describe('catalogo.csv', () => {
    it('carga medicamentos e insumos (separado por punto y coma) y la segunda vez ya estaban', async () => {
      const ruta = archivo('catalogo.csv', CATALOGO);
      const r = await instalar(['--catalogo', ruta]);

      expect(r.codigo).toBe(0);
      expect(r.salida).toContain('catalogo.csv: 3 medicamentos e insumos nuevos (0 ya estaban).');
      expect(r.salida.join('\n')).not.toMatch(/catálogo .* vacío/);
      const insumos = await prisma.insumo.findMany({ orderBy: { id: 'asc' } });
      expect(
        insumos.map(({ tipo, nombre, presentacion, unidadMedida, activo }) => ({
          tipo,
          nombre,
          presentacion,
          unidadMedida,
          activo,
        })),
      ).toEqual([
        {
          tipo: 'MEDICAMENTO',
          nombre: 'Ficticina',
          presentacion: 'Comprimidos 10 mg',
          unidadMedida: 'mg',
          activo: true,
        },
        {
          tipo: 'INSUMO',
          nombre: 'Gasa de ejemplo',
          presentacion: 'Sobre x 1',
          unidadMedida: 'unidad',
          activo: true,
        },
        {
          tipo: 'INSUMO',
          nombre: 'Guante de ejemplo',
          presentacion: '',
          unidadMedida: 'par',
          activo: true,
        },
      ]);
      const [primera] = await auditoriaDe('Insumo');
      expect(primera).toMatchObject({
        usuarioId: null,
        accion: 'CREAR',
        entidadId: String(insumos[0]!.id),
        valorNuevo: {
          nombre: 'Ficticina',
          tipo: 'MEDICAMENTO',
          unidadMedida: 'mg',
          presentacion: 'Comprimidos 10 mg',
          activo: true,
        },
        detalle: 'Instalador: catalogo.csv, fila 2',
      });

      const otra = await instalar(['--catalogo', ruta]);
      expect(otra.salida).toContain(
        'catalogo.csv: 0 medicamentos e insumos nuevos (3 ya estaban).',
      );
      expect(await prisma.insumo.count()).toBe(3);
    });
  });

  describe('personal.csv', () => {
    const credencialesEn = (ruta: string) =>
      fs
        .readFileSync(ruta, 'utf8')
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\r\n')
        .slice(1)
        .map((l) => l.split(','));

    it('crea usuarios activos con su rol y una contraseña temporal que solo está en el archivo', async () => {
      const ruta = archivo('personal.csv', PERSONAL);
      const r = await instalar(['--personal', ruta]);

      expect(r.codigo).toBe(0);
      const credenciales = path.join(carpeta, 'credenciales-iniciales.csv');
      expect(r.salida).toContain('personal.csv: 3 usuarios nuevos (0 ya estaban).');
      expect(r.salida).toContain(
        `Contraseñas temporales de los 3 usuarios nuevos en ${credenciales}: entréguelas en mano, ` +
          'el administrador las cambia desde Usuarios y después borre el archivo.',
      );
      const filas = credencialesEn(credenciales);
      expect(filas.map((f) => f.slice(0, 4))).toEqual([
        ['aejemplo', 'Ejemplo', 'Ana', 'Médico'],
        ['bficticio', 'Ficticio', 'Beto', 'Enfermero'],
        ['cprueba', 'Prueba', 'Carla', 'Enfermero'],
      ]);
      for (const [usuario, , , , contrasena] of filas) {
        const u = await prisma.usuario.findUniqueOrThrow({
          where: { nombreUsuario: usuario! },
          include: { rol: true },
        });
        expect(u.activo).toBe(true);
        expect(esquemaContrasena.safeParse(contrasena).success).toBe(true);
        expect(await verificarContrasena(contrasena!, u.contrasenaHash)).toBe(true);
        expect(r.todo).not.toContain(contrasena);
      }
      expect(
        await prisma.usuario.findUniqueOrThrow({
          where: { nombreUsuario: 'aejemplo' },
          include: { rol: true },
        }),
      ).toMatchObject({ dni: '10000001', email: 'ana@ejemplo.test', rol: { codigo: 'MEDICO' } });

      const altas = (await auditoriaDe('Usuario')).filter((a) =>
        a.detalle?.startsWith('Instalador'),
      );
      expect(altas.map((a) => [a.usuarioId, a.accion, a.detalle])).toEqual([
        [null, 'CREAR', 'Instalador: personal.csv, fila 2'],
        [null, 'CREAR', 'Instalador: personal.csv, fila 3'],
        [null, 'CREAR', 'Instalador: personal.csv, fila 4'],
      ]);
      expect(JSON.stringify(altas)).not.toMatch(/contrasena"?:\s*"(?!\[oculto\])/);
    });

    it('la segunda vez no crea a nadie ni toca el archivo de credenciales que ya está', async () => {
      const ruta = archivo('personal.csv', PERSONAL);
      await instalar(['--personal', ruta]);
      const credenciales = path.join(carpeta, 'credenciales-iniciales.csv');
      const antes = fs.readFileSync(credenciales, 'utf8');

      const r = await instalar(['--personal', ruta]);
      expect(r.codigo).toBe(0);
      expect(r.salida).toContain('personal.csv: 0 usuarios nuevos (3 ya estaban).');
      expect(r.salida.join('\n')).not.toMatch(/Contraseñas temporales/);
      expect(fs.readFileSync(credenciales, 'utf8')).toBe(antes);
    });

    it('--credenciales elige dónde se escribe el archivo', async () => {
      const destino = path.join(carpeta, 'entregar.csv');
      const r = await instalar([
        '--personal',
        archivo('personal.csv', PERSONAL),
        '--credenciales',
        destino,
      ]);
      expect(r.codigo).toBe(0);
      expect(credencialesEn(destino)).toHaveLength(3);
    });

    it('si el archivo de credenciales ya existe, no se carga nada y no se pisa', async () => {
      const credenciales = archivo('credenciales-iniciales.csv', 'de la vez anterior');
      const r = await instalar(['--personal', archivo('personal.csv', PERSONAL)]);

      expect(r.codigo).toBe(1);
      expect(r.errores).toContain(
        `  Ya existe ${credenciales}: entregue esas contraseñas y borre el archivo, o indique otro con --credenciales`,
      );
      expect(fs.readFileSync(credenciales, 'utf8')).toBe('de la vez anterior');
      // Todo en una transacción: tampoco quedaron el administrador ni los datos base.
      expect(await prisma.usuario.count()).toBe(0);
      expect(await prisma.rol.count()).toBe(0);
    });

    it('un conflicto con la base se informa con fila y campo, y deshace todo (también las salas)', async () => {
      await instalar([]);
      const r = await instalar([
        '--salas',
        archivo('salas.csv', SALAS),
        '--personal',
        archivo(
          'personal.csv',
          'usuario,nombre,apellido,dni,rol\notra,Otra,Persona,20111111,Médico\nlmendez,Laura,Méndez,10000009,Administrador\naejemplo,Ana,Ejemplo,10000001,Médico\n',
        ),
      ]);

      expect(r.codigo).toBe(1);
      expect(r.errores).toEqual([
        'No se cargó nada. Corrija lo siguiente y vuelva a correr el instalador:',
        '  personal.csv: Fila 2, dni: el DNI 20111111 ya es del usuario "lmendez"',
        '  personal.csv: Fila 3, usuario: "lmendez" ya existe con otro DNI',
      ]);
      expect(await prisma.sala.count()).toBe(0);
      expect(await prisma.usuario.count()).toBe(1);
      expect(fs.existsSync(path.join(carpeta, 'credenciales-iniciales.csv'))).toBe(false);
    });
  });

  it('todos los archivos juntos: el resumen completo', async () => {
    const r = await instalar([
      '--salas',
      archivo('salas.csv', SALAS),
      '--catalogo',
      archivo('catalogo.csv', CATALOGO),
      '--personal',
      archivo('personal.csv', PERSONAL),
    ]);

    expect(r.codigo).toBe(0);
    expect(r.errores).toEqual([]);
    expect(r.salida).toEqual([
      `Datos base: 3 roles y ${CODIGOS_PERMISO.length} permisos al día con esta versión; tipos de estudio: 8 nuevos (0 ya estaban).`,
      'Primer administrador: se creó "lmendez" (Méndez, Laura).',
      'salas.csv: 2 salas nuevas (0 ya estaban) y 5 camas nuevas (0 ya estaban).',
      'catalogo.csv: 3 medicamentos e insumos nuevos (0 ya estaban).',
      'personal.csv: 3 usuarios nuevos (0 ya estaban).',
      `Contraseñas temporales de los 3 usuarios nuevos en ${path.join(carpeta, 'credenciales-iniciales.csv')}: ` +
        'entréguelas en mano, el administrador las cambia desde Usuarios y después borre el archivo.',
      'Instalación terminada.',
    ]);
  });

  it('los ejemplos de docs/ejemplos se cargan sin errores (y son de mentira)', async () => {
    const ejemplos = path.resolve(__dirname, '../../../../docs/ejemplos');
    const copia = (nombre: string) =>
      archivo(nombre, fs.readFileSync(path.join(ejemplos, nombre), 'utf8'));
    const r = await instalar([
      '--salas',
      copia('salas.csv'),
      '--catalogo',
      copia('catalogo.csv'),
      '--personal',
      copia('personal.csv'),
    ]);

    expect(r.errores).toEqual([]);
    expect(r.codigo).toBe(0);
    expect(await prisma.cama.count()).toBeGreaterThanOrEqual(6);
    expect(await prisma.insumo.count({ where: { tipo: 'MEDICAMENTO' } })).toBeGreaterThan(0);
    expect(await prisma.insumo.count({ where: { tipo: 'INSUMO' } })).toBeGreaterThan(0);
    const roles = await prisma.usuario.groupBy({ by: ['rolId'], _count: true });
    expect(roles).toHaveLength(3);
    // Nada que pueda confundirse con una persona o un correo reales.
    const personas = await prisma.usuario.findMany({
      where: { nombreUsuario: { not: 'lmendez' } },
    });
    for (const p of personas) {
      expect(p.email ?? 'x@ejemplo.test').toMatch(/@ejemplo\.test$/);
      expect(Number(p.dni)).toBeLessThan(10_001_000);
    }
  });

  it('errores de varios archivos juntos, antes de tocar la base', async () => {
    const r = await instalar([
      '--salas',
      archivo('salas.csv', 'sala,cama\nSala Ejemplo A,\n'),
      '--personal',
      archivo('personal.csv', 'usuario,nombre,apellido,dni,rol\nana,Ana,Ejemplo,123,Médica\n'),
    ]);

    expect(r.codigo).toBe(1);
    expect(r.errores).toEqual([
      'No se cargó nada. Corrija lo siguiente y vuelva a correr el instalador:',
      '  salas.csv: Fila 2, cama: Escriba el número o nombre de la cama',
      '  personal.csv: Fila 2, dni: El DNI debe tener 7 u 8 dígitos, sin puntos (dice "123")',
    ]);
    expect(await prisma.rol.count()).toBe(0);
  });

  describe('opciones', () => {
    it('--ayuda muestra el uso', async () => {
      const r = await instalar(['--ayuda']);
      expect(r.codigo).toBe(0);
      expect(r.salida.join('\n')).toMatch(/^Uso: .*instalar/);
      expect(await prisma.rol.count()).toBe(0);
    });

    it.each([
      [['--sala', 'x.csv'], /--sala/],
      [['salas.csv'], /salas\.csv/],
      [['--credenciales', 'x.csv'], /--credenciales solo sirve con --personal/],
    ])('%j es un error de uso (código 2)', async (args, mensaje) => {
      const r = await instalar(args);
      expect(r.codigo).toBe(2);
      expect(r.errores.join('\n')).toMatch(mensaje);
      expect(r.errores.join('\n')).toMatch(/Uso: /);
    });

    it('un archivo que no existe es un error claro', async () => {
      const ruta = path.join(carpeta, 'no-existe.csv');
      const r = await instalar(['--salas', ruta]);
      expect(r.codigo).toBe(1);
      expect(r.errores).toContain(`  No se encontró el archivo ${ruta}`);
    });
  });
});
