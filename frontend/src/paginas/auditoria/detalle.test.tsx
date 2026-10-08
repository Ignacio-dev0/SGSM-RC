import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN } from '../../pruebas/datos';
import { entrada, prepararAuditoria } from '../../pruebas/datosAuditoria';
import { restaurarReportes, simularPantalla } from '../../pruebas/datosReportes';
import { renderizarApp } from '../../pruebas/renderizar';

afterEach(restaurarReportes);

/** Las filas de datos de la tabla (sin la cabecera), cuando ya llegaron. */
async function filasDeLaTabla() {
  const tabla = await screen.findByRole('table', { name: 'Movimientos' });
  await within(tabla).findAllByRole('row', { name: /Ver el detalle/ });
  return within(tabla).getAllByRole('row').slice(1);
}

/** Abre el detalle de la primera fila y devuelve el diálogo y las filas de "Antes y después". */
async function abrirPrimera(nombre: string) {
  const [fila] = await filasDeLaTabla();
  await userEvent.click(fila!);
  const dialogo = await screen.findByRole('dialog', { name: nombre });
  const tabla = within(dialogo).getByRole('table', { name: 'Antes y después' });
  const [cabecera, ...filas] = within(tabla).getAllByRole('row');
  const filaDe = (campo: string) => filas.find((f) => f.textContent?.startsWith(campo))!;
  return { dialogo, cabecera: cabecera!, filaDe };
}

describe('detalle de un movimiento: antes y después', () => {
  it('al abrir una fila muestra cada campo antes y después, con lo que cambió marcado con texto', async () => {
    prepararAuditoria([
      entrada({
        valorAnterior: { cama: 'Sala A · A-01', estado: 'INTERNADO' },
        valorNuevo: { cama: 'Sala A · A-02', estado: 'INTERNADO', observaciones: 'Aislamiento' },
        detalle: 'Traslado por aislamiento',
      }),
    ]);
    renderizarApp('/auditoria', ADMIN);

    const { dialogo, cabecera, filaDe } = await abrirPrimera('Trasladó · Paciente n.º 12');
    expect(dialogo).toHaveTextContent(/01\/10\/2026 23:30/);
    expect(dialogo).toHaveTextContent(/López, Lucas/);
    expect(dialogo).toHaveTextContent(/Alvarez, Ana · DNI 30111222/);
    expect(dialogo).toHaveTextContent(/Traslado por aislamiento/);
    expect(dialogo).toHaveTextContent('Cambiaron 2 de 3 campos.');
    expect(cabecera).toHaveTextContent(/Campo.*Antes.*Después/);

    // La cama con el guion que no la deja partir (F3).
    const g = String.fromCharCode(0x2011);
    expect(filaDe('Cama')).toHaveTextContent(new RegExp(`Sala A · A${g}01.*Sala A · A${g}02`));
    expect(within(filaDe('Cama')).getByText('Cambió')).toBeInTheDocument();
    // Los estados con las palabras de los chips, no con el código (E6-07).
    expect(filaDe('Estado')).toHaveTextContent(/Internado.*Internado/);
    expect(within(filaDe('Estado')).queryByText('Cambió')).not.toBeInTheDocument();
    // Un campo nuevo: antes no tenía valor.
    expect(filaDe('Observaciones')).toHaveTextContent(/Sin valor.*Aislamiento/);
    expect(within(filaDe('Observaciones')).getByText('Cambió')).toBeInTheDocument();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('un dato protegido se dice sin mostrarlo, con una sola nota, y si está de los dos lados cambió (E6-12)', async () => {
    prepararAuditoria([
      entrada({
        accion: 'MODIFICAR',
        entidad: 'Usuario',
        entidadId: '9',
        paciente: null,
        valorAnterior: { email: 'a@hospital.ar', contrasena: '[oculto]' },
        valorNuevo: { email: 'b@hospital.ar', contrasena: '[oculto]' },
      }),
    ]);
    renderizarApp('/auditoria', ADMIN);

    const { dialogo, filaDe } = await abrirPrimera('Modificó · Usuario n.º 9');
    expect(filaDe('Contraseña')).toHaveTextContent(
      /Dato protegido \(no se muestra\).*Dato protegido \(no se muestra\)/,
    );
    expect(within(filaDe('Contraseña')).getByText('Cambió')).toBeInTheDocument();
    expect(dialogo).toHaveTextContent('Cambiaron 2 de 2 campos.');
    expect(dialogo).not.toHaveTextContent('[oculto]');
    expect(within(dialogo).getAllByText(/Los datos protegidos .* no se muestran/)).toHaveLength(1);
  });

  it('lo que se creó con la acción no tiene valores anteriores, y los códigos se leen en palabras', async () => {
    prepararAuditoria([
      entrada({
        id: 811,
        accion: 'GENERAR',
        entidad: 'Recordatorio',
        entidadId: '301',
        usuario: { id: null, nombre: 'Sistema' },
        valorAnterior: null,
        valorNuevo: { tipo: 'MEDICAMENTO', prescripcionId: 40, prioridad: 'MEDIA' },
      }),
    ]);
    renderizarApp('/auditoria?origen=', ADMIN);

    const { dialogo, filaDe } = await abrirPrimera('Generó · Recordatorio n.º 301');
    expect(dialogo).toHaveTextContent(/No había valores anteriores/);
    expect(filaDe('Tipo')).toHaveTextContent(/Sin valor.*Medicamento/);
    expect(filaDe('Prescripción')).toHaveTextContent(/Sin valor.*n.º 40/);
    expect(filaDe('Prioridad')).toHaveTextContent(/Sin valor.*Pronto/);
    expect(dialogo).not.toHaveTextContent('MEDIA');
    expect(within(dialogo).queryByText('Cambió')).not.toBeInTheDocument();
    // Ningún dato protegido: la nota no aparece.
    expect(within(dialogo).queryByText(/Los datos protegidos/)).not.toBeInTheDocument();
  });

  it('se abre también con el teclado', async () => {
    prepararAuditoria();
    renderizarApp('/auditoria', ADMIN);
    const [fila] = await filasDeLaTabla();

    fila!.focus();
    await userEvent.keyboard('{Enter}');

    expect(
      await screen.findByRole('dialog', { name: 'Trasladó · Paciente n.º 12' }),
    ).toBeInTheDocument();
  });

  it('en el teléfono las filas son tarjetas y el detalle ocupa toda la pantalla', async () => {
    simularPantalla({ telefono: true });
    prepararAuditoria();
    renderizarApp('/auditoria', ADMIN);

    const lista = await screen.findByRole('list', { name: 'Movimientos' });
    const [tarjeta] = await within(lista).findAllByRole('button', { name: /Ver el detalle/ });
    await userEvent.click(tarjeta!);

    const dialogo = await screen.findByRole('dialog', { name: 'Trasladó · Paciente n.º 12' });
    expect(dialogo.className).toMatch(/fullScreen/i);
    // Antes y después como pares, sin una tabla de tres columnas que desborde.
    const campos = within(dialogo).getByRole('list', { name: 'Antes y después' });
    expect(within(campos).getByText('Cambió')).toBeInTheDocument();
    const cerrar = within(dialogo).getByRole('button', { name: 'Cerrar' });
    expect(parseFloat(getComputedStyle(cerrar).minHeight)).toBeGreaterThanOrEqual(48);
  });
});
