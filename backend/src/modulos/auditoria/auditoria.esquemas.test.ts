import { esquemaBusquedaAuditoria } from './auditoria.esquemas';

describe('filtros de la auditoría (T604 · contrato con el frontend)', () => {
  it('sin filtros: página 1 de 50 registros', () => {
    expect(esquemaBusquedaAuditoria.parse({})).toEqual({ pagina: 1, tamano: 50 });
  });

  it('convierte los filtros de la query', () => {
    expect(
      esquemaBusquedaAuditoria.parse({
        desde: '2026-10-01',
        hasta: '2026-10-07',
        usuarioId: '4',
        pacienteId: '12',
        accion: ' MODIFICAR ',
        entidad: 'Paciente',
        pagina: '3',
        tamano: '100',
      }),
    ).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-07',
      usuarioId: 4,
      pacienteId: 12,
      accion: 'MODIFICAR',
      entidad: 'Paciente',
      pagina: 3,
      tamano: 100,
    });
  });

  it('acepta también porPagina, el nombre de la convención de la API (D48)', () => {
    expect(esquemaBusquedaAuditoria.parse({ porPagina: '20' }).tamano).toBe(20);
    expect(esquemaBusquedaAuditoria.parse({ porPagina: '20', tamano: '30' }).tamano).toBe(30);
  });

  it.each([
    ['más de 100 por página', { tamano: '101' }, 'tamano', /hasta 100/],
    ['la página 0', { pagina: '0' }, 'pagina', /empieza en 1/],
    ['una fecha con hora', { desde: '2026-10-01T10:00' }, 'desde', /AAAA-MM-DD/],
    ['un usuario que no es un número', { usuarioId: 'ana' }, 'usuarioId', /usuario/],
    ['un paciente que no es positivo', { pacienteId: '0' }, 'pacienteId', /paciente/],
    ['una acción vacía', { accion: '  ' }, 'accion', /acción/],
    [
      '"hasta" antes que "desde"',
      { desde: '2026-10-05', hasta: '2026-10-04' },
      'hasta',
      /anterior/,
    ],
  ])('rechaza %s', (_caso, query, campo, mensaje) => {
    const r = esquemaBusquedaAuditoria.safeParse(query);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual([campo]);
    expect(r.error?.issues[0]?.message).toMatch(mensaje);
  });
});
