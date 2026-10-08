// Auditoría: quién lo hizo y sobre qué, con el nombre del registro cuando viene (C2 · F14).
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN } from '../../pruebas/datos';
import { entrada, prepararAuditoria } from '../../pruebas/datosAuditoria';
import { restaurarReportes } from '../../pruebas/datosReportes';
import { renderizarApp } from '../../pruebas/renderizar';
import { sobreQue } from './palabras';

afterEach(restaurarReportes);

/** López le cambió el rol a Pérez: "Usuario" es a quién se lo hicieron, no quién lo hizo. */
const cambioDeRol = entrada({
  id: 900,
  accion: 'MODIFICAR',
  entidad: 'Usuario',
  entidadId: '4',
  entidadEtiqueta: 'Pérez, Ana',
  paciente: null,
  valorAnterior: { rol: 'ENFERMERO' },
  valorNuevo: { rol: 'MEDICO' },
});

async function filasDeLaTabla() {
  const tabla = await screen.findByRole('table', { name: 'Movimientos' });
  await within(tabla).findAllByRole('row', { name: /Ver el detalle/ });
  return { tabla, filas: within(tabla).getAllByRole('row').slice(1) };
}

describe('sobre qué se hizo, con su nombre (C2 · F14)', () => {
  it('sobreQue usa el nombre del registro cuando viene, y si no, el número', () => {
    expect(sobreQue(cambioDeRol)).toBe('Usuario: Pérez, Ana');
    expect(sobreQue(entrada({ entidad: 'Prescripcion', entidadId: '40' }))).toBe(
      'Prescripción n.º 40',
    );
    expect(
      sobreQue(
        entrada({
          entidad: 'Prescripcion',
          entidadId: '40',
          entidadEtiqueta: 'Paracetamol · Alvarez, Ana',
        }),
      ),
    ).toBe('Prescripción: Paracetamol · Alvarez, Ana');
  });

  it('la tabla separa "Quién lo hizo" de "Sobre qué" y nombra al usuario afectado', async () => {
    prepararAuditoria([cambioDeRol]);
    renderizarApp('/auditoria', ADMIN);

    const { tabla, filas } = await filasDeLaTabla();
    const cabecera = within(tabla)
      .getAllByRole('columnheader')
      .map((c) => c.textContent);
    expect(cabecera).toEqual(expect.arrayContaining(['Quién lo hizo', 'Sobre qué']));
    expect(cabecera).not.toContain('Usuario');
    expect(filas[0]).toHaveTextContent(/López, Lucas.*Modificó.*Usuario: Pérez, Ana/);
    expect(filas[0]).not.toHaveTextContent('Usuario n.º 4');
  });

  it('el detalle dice quién lo hizo y sobre qué, cada cosa en su renglón', async () => {
    prepararAuditoria([cambioDeRol]);
    renderizarApp('/auditoria', ADMIN);

    const { filas } = await filasDeLaTabla();
    await userEvent.click(filas[0]!);
    const dialogo = await screen.findByRole('dialog', { name: 'Modificó · Usuario: Pérez, Ana' });
    const datos = within(dialogo)
      .getAllByRole('term')
      .map((t) => ({
        titulo: t.textContent,
        valor: t.nextElementSibling?.textContent,
      }));
    expect(datos).toEqual(
      expect.arrayContaining([
        { titulo: 'Quién lo hizo', valor: 'López, Lucas' },
        { titulo: 'Sobre qué', valor: 'Usuario: Pérez, Ana' },
      ]),
    );
    expect(datos.map((d) => d.titulo)).not.toContain('Usuario');
  });

  it('el filtro de las personas también se llama "Quién lo hizo"', async () => {
    prepararAuditoria([cambioDeRol]);
    renderizarApp('/auditoria', ADMIN);
    await filasDeLaTabla();

    expect(screen.getByRole('combobox', { name: 'Quién lo hizo' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Usuario' })).not.toBeInTheDocument();
  });
});
