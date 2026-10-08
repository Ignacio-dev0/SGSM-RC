import { prisma } from '../../db';
import {
  crearInsumo,
  crearPacienteBasico,
  crearPrescripcionBasica,
  crearUsuarioBasico,
} from '../../../tests/soporte/fabricas';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

type Sesion = Awaited<ReturnType<typeof agenteConRol>>;

/**
 * entidadEtiqueta (D114): cada entrada de la auditoría dice el nombre del registro afectado
 * cuando se puede resolver sin costo alto, buscado por lote (una consulta por tipo de registro
 * de la página, no una por fila).
 */
describe('auditoría: el nombre del registro afectado (D114)', () => {
  let admin: Sesion;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    admin = await agenteConRol('ADMINISTRADOR');
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  /** Entradas armadas a mano en 2018, en este orden (la primera, la más reciente). */
  async function auditar(entradas: [string, string | null][]) {
    for (const [i, [entidad, entidadId]] of entradas.entries()) {
      await prisma.auditoria.create({
        data: {
          fechaHora: new Date(Date.UTC(2018, 0, 1, 12, 0, entradas.length - i)),
          accion: 'MODIFICAR',
          entidad,
          entidadId,
        },
      });
    }
  }

  const etiquetas = async () => {
    const res = await admin.agente.get('/api/auditoria').query({ hasta: '2018-01-01' });
    expect(res.status).toBe(200);
    return (res.body.data as { entidad: string; entidadEtiqueta: string | null }[]).map((x) => [
      x.entidad,
      x.entidadEtiqueta,
    ]);
  };

  it('usuario y paciente por "Apellido, Nombre", insumo con su presentación y prescripción con medicamento y paciente', async () => {
    const sofia = await crearUsuarioBasico({ apellido: 'Suárez', nombre: 'Sofía' });
    const ana = await crearPacienteBasico(sofia.id, { apellido: 'Alvarez', nombre: 'Ana' });
    const beto = await crearPacienteBasico(sofia.id, { apellido: 'Benítez', nombre: 'Beto' });
    const gasa = await crearInsumo({ nombre: 'Gasa', tipo: 'INSUMO', presentacion: 'Sobre x 10' });
    const paracetamol = await crearInsumo({ nombre: 'Paracetamol', presentacion: '' });
    const receta = await crearPrescripcionBasica(ana.id, sofia.id, { insumoId: paracetamol.id });
    await auditar([
      ['Usuario', String(sofia.id)],
      ['Paciente', String(beto.id)],
      ['Insumo', String(gasa.id)],
      ['Prescripcion', String(receta.id)],
      ['Recordatorio', '7'],
      ['Usuario', null],
      ['Paciente', '999999'],
      ['Reporte', 'suministros'],
      ['Usuario', '99999999999'],
    ]);

    expect(await etiquetas()).toEqual([
      ['Usuario', 'Suárez, Sofía'],
      ['Paciente', 'Benítez, Beto'],
      ['Insumo', 'Gasa Sobre x 10'],
      ['Prescripcion', 'Paracetamol · Alvarez, Ana'],
      ['Recordatorio', null],
      ['Usuario', null],
      ['Paciente', null],
      ['Reporte', null],
      ['Usuario', null],
    ]);
  });

  it('busca los nombres por lote: una consulta por tipo de registro, no una por fila', async () => {
    const usuarios = [];
    for (const nombre of ['Uno', 'Dos', 'Tres', 'Cuatro']) {
      usuarios.push(await crearUsuarioBasico({ nombre }));
    }
    const insumos = [];
    for (const nombre of ['A', 'B', 'C']) insumos.push(await crearInsumo({ nombre }));
    await auditar([
      ...usuarios.map((u): [string, string] => ['Usuario', String(u.id)]),
      ...insumos.map((i): [string, string] => ['Insumo', String(i.id)]),
    ]);
    const porUsuario = jest.spyOn(prisma.usuario, 'findMany');
    const porInsumo = jest.spyOn(prisma.insumo, 'findMany');

    const resultado = await etiquetas();

    expect(resultado).toHaveLength(7);
    expect(resultado.every(([, etiqueta]) => etiqueta !== null)).toBe(true);
    expect(porUsuario).toHaveBeenCalledTimes(1);
    expect(porInsumo).toHaveBeenCalledTimes(1);
  });
});
