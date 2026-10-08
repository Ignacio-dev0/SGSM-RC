import {
  esquemaCancelarEstudio,
  esquemaConfirmarEstudio,
  esquemaFiltroEstudios,
  esquemaProgramarEstudio,
  esquemaReprogramarEstudio,
} from './estudios.esquemas';

const FECHA = '2026-10-08T13:00:00.000Z';

describe('esquemas de estudios (E5 · T509–T513 · contrato con el frontend)', () => {
  describe('programar: POST /api/pacientes/:id/estudios', () => {
    it('con lo mínimo (tipo y fecha) deja nombre y preparación para que los complete el tipo', () => {
      expect(esquemaProgramarEstudio.parse({ tipoEstudioId: 3, fechaHora: FECHA })).toEqual({
        tipoEstudioId: 3,
        fechaHora: FECHA,
        nombre: undefined,
        preparacion: undefined,
        observaciones: null,
      });
    });

    it('recorta los textos; una preparación vacía o null queda en null (sin preparación)', () => {
      expect(
        esquemaProgramarEstudio.parse({
          tipoEstudioId: 3,
          fechaHora: '2026-10-08T10:00:00-03:00',
          nombre: '  Rx de tórax frente y perfil ',
          preparacion: '  ',
          observaciones: ' Trasladar en silla de ruedas ',
        }),
      ).toEqual({
        tipoEstudioId: 3,
        fechaHora: '2026-10-08T10:00:00-03:00',
        nombre: 'Rx de tórax frente y perfil',
        preparacion: null,
        observaciones: 'Trasladar en silla de ruedas',
      });
      expect(
        esquemaProgramarEstudio.parse({ tipoEstudioId: 3, fechaHora: FECHA, preparacion: null })
          .preparacion,
      ).toBeNull();
    });

    it.each([
      ['sin tipo', { fechaHora: FECHA }, 'tipoEstudioId', /tipo de estudio/i],
      [
        'con un tipo que no es un id',
        { tipoEstudioId: 0, fechaHora: FECHA },
        'tipoEstudioId',
        /tipo/i,
      ],
      ['sin fecha', { tipoEstudioId: 3 }, 'fechaHora', /fecha/i],
      [
        'con una fecha que no es ISO',
        { tipoEstudioId: 3, fechaHora: '08/10/2026 10:00' },
        'fechaHora',
        /fecha/i,
      ],
      [
        'con una fecha sin zona horaria',
        { tipoEstudioId: 3, fechaHora: '2026-10-08T10:00:00' },
        'fechaHora',
        /fecha/i,
      ],
      [
        'con un nombre de más de 120 caracteres',
        { tipoEstudioId: 3, fechaHora: FECHA, nombre: 'x'.repeat(121) },
        'nombre',
        /120/,
      ],
      [
        'con una preparación de más de 500 caracteres',
        { tipoEstudioId: 3, fechaHora: FECHA, preparacion: 'x'.repeat(501) },
        'preparacion',
        /500/,
      ],
      [
        'con observaciones de más de 500 caracteres',
        { tipoEstudioId: 3, fechaHora: FECHA, observaciones: 'x'.repeat(501) },
        'observaciones',
        /500/,
      ],
    ])('rechaza el pedido %s, con un mensaje para la persona', (_caso, cuerpo, campo, mensaje) => {
      const r = esquemaProgramarEstudio.safeParse(cuerpo);
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual([campo]);
      expect(r.error?.issues[0]?.message).toMatch(mensaje);
    });
  });

  describe('reprogramar: PATCH /api/estudios/:id', () => {
    it('recibe solo la fecha nueva', () => {
      expect(esquemaReprogramarEstudio.parse({ fechaHora: FECHA, nombre: 'otro' })).toEqual({
        fechaHora: FECHA,
      });
    });

    it('exige una fecha y hora ISO con zona', () => {
      expect(esquemaReprogramarEstudio.safeParse({}).success).toBe(false);
      expect(esquemaReprogramarEstudio.safeParse({ fechaHora: 'mañana' }).success).toBe(false);
    });
  });

  describe('cancelar: POST /api/estudios/:id/cancelar', () => {
    it('exige el motivo y le quita los espacios de los bordes', () => {
      expect(esquemaCancelarEstudio.parse({ motivo: '  Se suspendió el turno  ' })).toEqual({
        motivo: 'Se suspendió el turno',
      });
    });

    it.each([
      ['sin motivo', {}],
      ['con un motivo de menos de 3 letras', { motivo: ' no ' }],
      ['con un motivo de más de 255 caracteres', { motivo: 'x'.repeat(256) }],
    ])('rechaza el pedido %s', (_caso, cuerpo) => {
      const r = esquemaCancelarEstudio.safeParse(cuerpo);
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual(['motivo']);
      expect(r.error?.issues[0]?.message).toMatch(/motivo|cancela/i);
    });
  });

  describe('confirmar: POST /api/estudios/:id/confirmar', () => {
    it('recibe el comprobante facial y observaciones opcionales', () => {
      expect(
        esquemaConfirmarEstudio.parse({ validacionToken: 'tok', observaciones: ' Sin novedad ' }),
      ).toEqual({ validacionToken: 'tok', observaciones: 'Sin novedad' });
      expect(esquemaConfirmarEstudio.parse({ validacionToken: 'tok', observaciones: '' })).toEqual({
        validacionToken: 'tok',
        observaciones: null,
      });
    });

    it('sin comprobante pasa la validación: el servidor responde 403 VALIDACION_FACIAL_REQUERIDA', () => {
      expect(esquemaConfirmarEstudio.parse({})).toEqual({
        validacionToken: undefined,
        observaciones: null,
      });
    });

    it('rechaza observaciones de más de 500 caracteres', () => {
      expect(esquemaConfirmarEstudio.safeParse({ observaciones: 'x'.repeat(501) }).success).toBe(
        false,
      );
    });
  });

  describe('filtro: GET /api/pacientes/:id/estudios?estado', () => {
    it('acepta los tres estados o ninguno', () => {
      expect(esquemaFiltroEstudios.parse({})).toEqual({});
      expect(esquemaFiltroEstudios.parse({ estado: 'PROGRAMADO' })).toEqual({
        estado: 'PROGRAMADO',
      });
      expect(esquemaFiltroEstudios.safeParse({ estado: 'PENDIENTE' }).success).toBe(false);
    });
  });
});
