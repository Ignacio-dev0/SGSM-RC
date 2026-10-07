import { prisma } from '../db';
import { limpiarBase } from '../../tests/soporte/base';
import { sembrarCatalogoBase } from './catalogo-base';
import { USUARIOS_DE_PRUEBA, sembrarUsuariosDePrueba } from './usuarios-prueba';
import { descriptorSimulado, sembrarRostrosSimulados } from './biometria-simulada';
import { descifrarPatron } from '../modulos/biometria/cifrado-biometrico';

describe('rostros simulados de los usuarios de prueba', () => {
  afterAll(() => prisma.$disconnect());

  it('usa el mismo algoritmo que el frontend (mismos primeros valores)', () => {
    // Los mismos valores se verifican en frontend/src/biometria/simulado.test.ts.
    expect(
      descriptorSimulado('enfermero')
        .slice(0, 3)
        .map((v) => v.toFixed(6)),
    ).toEqual(['0.160157', '0.167035', '-0.007119']);
  });

  it('registra un rostro simulado para cada usuario de prueba, sin duplicar', async () => {
    await limpiarBase();
    await sembrarCatalogoBase(prisma);
    await sembrarUsuariosDePrueba(prisma);

    await sembrarRostrosSimulados(prisma);
    await sembrarRostrosSimulados(prisma);

    const datos = await prisma.datoBiometrico.findMany({ include: { usuario: true } });
    expect(datos).toHaveLength(USUARIOS_DE_PRUEBA.length);
    const enfermero = datos.find((d) => d.usuario.nombreUsuario === 'enfermero');
    // Se guarda cifrado (T705): el patrón vuelve exacto al descifrarlo.
    expect(descifrarPatron(enfermero!.usuarioId, enfermero!.patronCifrado)).toEqual(
      descriptorSimulado('enfermero'),
    );
  });
});
