import { prisma } from '../../db';
import { limpiarBase } from '../../../tests/soporte/base';
import { crearUsuarioBasico } from '../../../tests/soporte/fabricas';
import { cambios, registrarAuditoria, sanear } from './auditoria.servicio';

describe('auditoría (T104 · RN06 · RNF10)', () => {
  describe('sanear', () => {
    it('oculta contraseñas, patrones faciales y fotos', () => {
      expect(
        sanear({
          nombre: 'Ana',
          contrasenaHash: '$2a$xx',
          patron: [0.1, 0.2],
          fotoReferencia: Buffer.from('x'),
        }),
      ).toEqual({
        nombre: 'Ana',
        contrasenaHash: '[oculto]',
        patron: '[oculto]',
        fotoReferencia: '[oculto]',
      });
    });

    it('convierte fechas a texto ISO', () => {
      expect(sanear({ fecha: new Date('2026-10-07T12:00:00Z') })).toEqual({
        fecha: '2026-10-07T12:00:00.000Z',
      });
    });
  });

  describe('cambios', () => {
    it('devuelve solo los campos que cambiaron, con el valor anterior y el nuevo', () => {
      expect(
        cambios(
          { id: 1, nombre: 'Ana', apellido: 'Pérez', actualizadoEn: new Date('2026-01-01') },
          { id: 1, nombre: 'Ana María', apellido: 'Pérez', actualizadoEn: new Date('2026-02-01') },
        ),
      ).toEqual({ anterior: { nombre: 'Ana' }, nuevo: { nombre: 'Ana María' } });
    });

    it('compara fechas por su valor', () => {
      const f = '2026-03-01T10:00:00.000Z';
      expect(cambios({ fechaHora: new Date(f) }, { fechaHora: new Date(f) })).toEqual({
        anterior: {},
        nuevo: {},
      });
    });
  });

  describe('registrarAuditoria', () => {
    beforeEach(() => limpiarBase());
    afterAll(() => prisma.$disconnect());

    it('guarda usuario, fecha y hora, acción, entidad y los valores anterior y nuevo', async () => {
      const usuario = await crearUsuarioBasico();

      await registrarAuditoria(prisma, {
        usuarioId: usuario.id,
        accion: 'MODIFICAR',
        entidad: 'Paciente',
        entidadId: 15,
        pacienteId: 15,
        anterior: { apellido: 'Pérez' },
        nuevo: { apellido: 'Peréz', contrasenaHash: 'no debe quedar' },
      });

      const [fila] = await prisma.auditoria.findMany();
      expect(fila).toMatchObject({
        usuarioId: usuario.id,
        accion: 'MODIFICAR',
        entidad: 'Paciente',
        entidadId: '15',
        pacienteId: 15,
        valorAnterior: { apellido: 'Pérez' },
        valorNuevo: { apellido: 'Peréz', contrasenaHash: '[oculto]' },
      });
      expect(fila?.fechaHora).toBeInstanceOf(Date);
    });
  });
});

describe('inalterabilidad de la auditoría', () => {
  beforeEach(() => limpiarBase());
  afterAll(() => prisma.$disconnect());

  it('la base rechaza modificar o borrar un registro de auditoría', async () => {
    const fila = await registrarAuditoria(prisma, { accion: 'CREAR', entidad: 'Paciente' });

    await expect(
      prisma.auditoria.update({ where: { id: fila.id }, data: { accion: 'OTRA' } }),
    ).rejects.toThrow(/auditoría no se puede modificar/);
    await expect(prisma.auditoria.delete({ where: { id: fila.id } })).rejects.toThrow(
      /auditoría no se puede modificar/,
    );
  });
});
