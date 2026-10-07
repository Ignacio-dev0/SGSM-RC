import { prisma } from './db';

describe('conexión a la base', () => {
  afterAll(() => prisma.$disconnect());

  it('se conecta a la base de pruebas', async () => {
    const [fila] = await prisma.$queryRaw<{ base: string }[]>`SELECT current_database() AS base`;
    expect(fila?.base).toBe('sgsm_test');
  });
});
