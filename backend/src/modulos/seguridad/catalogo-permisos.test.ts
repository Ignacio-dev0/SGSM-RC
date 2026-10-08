import { prisma } from '../../db';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { CODIGOS_PERMISO, PERMISOS } from './catalogo-permisos';

/**
 * Las descripciones de los permisos se muestran en la pantalla de permisos de un usuario (D117):
 * en palabras de quien la usa y con el glosario de PRODUCT.md, sin códigos de trazabilidad.
 */
describe('catálogo de permisos en palabras del usuario (D117)', () => {
  const descripciones = CODIGOS_PERMISO.map((c) => [c, PERMISOS[c].descripcion] as const);

  it.each(descripciones)('%s no muestra códigos (CU, T, RF, RN…)', (_codigo, descripcion) => {
    expect(descripcion).not.toMatch(/\b(CU|T|RF|RNF|RN|S|E)\d/);
    expect(descripcion).not.toMatch(/[()]/);
  });

  it.each(descripciones)('%s usa el glosario (sin receta, alarma, log, turno…)', (_c, texto) => {
    expect(texto).not.toMatch(/receta|alarma|alerta|\blog\b|turno|suministrar|biom[eé]tric/i);
  });

  it('dice las tareas con las palabras de las pantallas', () => {
    expect(PERMISOS['usuarios.gestionar'].descripcion).toBe(
      'Crear, buscar, modificar, dar de baja y reactivar usuarios',
    );
    expect(PERMISOS['pacientes.gestionar'].descripcion).toBe(
      'Internar, modificar, trasladar y dar de alta pacientes',
    );
    // "Dar de alta" es solo de pacientes: un usuario o un insumo se crea o se agrega.
    const otros = descripciones.filter(([c]) => c !== 'pacientes.gestionar');
    expect(otros.filter(([, d]) => /alta/i.test(d))).toEqual([]);
  });

  it('GET /api/permisos entrega las descripciones nuevas', async () => {
    await prepararBaseConSeguridad();
    const { agente } = await agenteConRol('ADMINISTRADOR');
    const res = await agente.get('/api/permisos');
    const usuarios = res.body.data.find(
      (p: { codigo: string }) => p.codigo === 'usuarios.gestionar',
    );
    expect(usuarios.descripcion).toBe('Crear, buscar, modificar, dar de baja y reactivar usuarios');
    await prisma.$disconnect();
  });
});
