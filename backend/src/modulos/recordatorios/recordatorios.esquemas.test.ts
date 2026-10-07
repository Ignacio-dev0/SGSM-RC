import { esquemaBusquedaRecordatorios, esquemaNoAdministrado } from './recordatorios.esquemas';

describe('esquemas de recordatorios (E5 · contrato con el frontend)', () => {
  describe('búsqueda: GET /api/recordatorios?tipo&salaId', () => {
    it('sin filtros trae todos', () => {
      expect(esquemaBusquedaRecordatorios.parse({})).toEqual({});
    });

    it('filtra por tipo y por sala, convirtiendo la sala de la query a número', () => {
      expect(esquemaBusquedaRecordatorios.parse({ tipo: 'MEDICAMENTO', salaId: '3' })).toEqual({
        tipo: 'MEDICAMENTO',
        salaId: 3,
      });
      expect(esquemaBusquedaRecordatorios.parse({ tipo: 'ESTUDIO' })).toEqual({ tipo: 'ESTUDIO' });
    });

    it.each([
      ['un tipo que no existe', { tipo: 'VACUNA' }],
      ['una sala que no es un número', { salaId: 'A' }],
      ['una sala que no es positiva', { salaId: '0' }],
    ])('rechaza %s', (_caso, query) => {
      expect(esquemaBusquedaRecordatorios.safeParse(query).success).toBe(false);
    });
  });

  describe('"No se administró": POST /api/recordatorios/:id/no-administrar', () => {
    it('exige el motivo y le quita los espacios de los bordes', () => {
      expect(esquemaNoAdministrado.parse({ motivo: '  Paciente en ayunas  ' })).toEqual({
        motivo: 'Paciente en ayunas',
      });
    });

    it.each([
      ['sin motivo', {}],
      ['con un motivo de menos de 3 letras', { motivo: ' no ' }],
      ['con un motivo de más de 255 caracteres', { motivo: 'x'.repeat(256) }],
    ])('rechaza el pedido %s, con un mensaje para la persona', (_caso, cuerpo) => {
      const r = esquemaNoAdministrado.safeParse(cuerpo);
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual(['motivo']);
      expect(r.error?.issues[0]?.message).toMatch(/motivo|administr/i);
    });
  });
});
