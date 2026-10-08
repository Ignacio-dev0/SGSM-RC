// Catálogo: un insumo ya usado no cambia de tipo ni de unidad (C4 · F16).
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Insumo } from '../../api/tipos';
import { ADMIN } from '../../pruebas/datos';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

const insumo = (extra: Partial<Insumo> = {}): Insumo => ({
  id: 1,
  nombre: 'Paracetamol',
  tipo: 'MEDICAMENTO',
  unidadMedida: 'mg',
  presentacion: 'Comprimidos 500 mg',
  activo: true,
  enUso: false,
  ...extra,
});

const AYUDA = 'Ya se usó en prescripciones o registros: no se puede cambiar';

async function editar(i: Insumo) {
  servidor.use(http.get('*/api/insumos', () => HttpResponse.json({ data: [i] })));
  renderizarApp('/catalogo', ADMIN);
  await userEvent.click(await screen.findByText(i.nombre));
  return screen.getByRole('dialog', { name: /^Editar/ });
}

describe('insumo en uso (C4 · F16)', () => {
  it('ya usado: el tipo y la unidad no se pueden cambiar, y la ayuda dice por qué', async () => {
    const dialogo = await editar(insumo({ enUso: true }));

    const tipo = within(dialogo).getByLabelText(/^Tipo/);
    const unidad = within(dialogo).getByLabelText(/^Unidad de medida/);
    // Solo lectura y no deshabilitados: se llega con el teclado y el lector de pantalla los lee
    // con su explicación (un campo deshabilitado sale del orden de tabulación).
    for (const campo of [tipo, unidad]) {
      expect(campo).toHaveAttribute('readonly');
      expect(campo).toBeEnabled();
      expect(campo).toHaveAccessibleDescription(AYUDA);
      // La explicación no va en el gris de lo deshabilitado (contraste de 2,3:1).
      const ayuda = document.getElementById(campo.getAttribute('aria-describedby')!)!;
      expect(ayuda).not.toHaveClass('Mui-disabled');
    }
    expect(tipo).toHaveValue('Medicamento');
    expect(unidad).toHaveValue('mg');
    // Escribir no lo cambia.
    await userEvent.type(unidad, 'x');
    expect(unidad).toHaveValue('mg');
    // Se llega con Tab desde el nombre.
    within(dialogo)
      .getByLabelText(/^Nombre/)
      .focus();
    await userEvent.tab();
    expect(tipo).toHaveFocus();
    // El nombre y la presentación sí se corrigen.
    expect(within(dialogo).getByLabelText(/^Nombre/)).toBeEnabled();
    expect(within(dialogo).getByLabelText(/^Presentación/)).toBeEnabled();
  });

  it('ya usado: al guardar no manda el tipo ni la unidad', async () => {
    let enviado: Record<string, unknown> | undefined;
    servidor.use(
      http.patch('*/api/insumos/1', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: insumo({ enUso: true, presentacion: 'Comp. 500 mg' }) });
      }),
    );
    const dialogo = await editar(insumo({ enUso: true }));
    const presentacion = within(dialogo).getByLabelText(/^Presentación/);
    await userEvent.clear(presentacion);
    await userEvent.type(presentacion, 'Comp. 500 mg');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(enviado).toBeDefined());
    expect(enviado).toEqual({ nombre: 'Paracetamol', presentacion: 'Comp. 500 mg' });
  });

  it('sin usar: se pueden cambiar', async () => {
    const dialogo = await editar(insumo());

    expect(within(dialogo).getByLabelText(/^Tipo/)).toBeEnabled();
    expect(within(dialogo).getByLabelText(/^Unidad de medida/)).toBeEnabled();
    expect(within(dialogo).getByLabelText(/^Tipo/)).not.toHaveAccessibleDescription(AYUDA);
  });

  it('si el servidor responde que ya está en uso, lo dice con claridad y bloquea esos campos', async () => {
    servidor.use(
      http.patch('*/api/insumos/1', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'INSUMO_EN_USO',
              mensaje: 'El insumo está en uso: no se puede cambiar el tipo ni la unidad',
            },
          },
          { status: 409 },
        ),
      ),
    );
    // La lista decía que no estaba en uso: alguien lo prescribió mientras tanto.
    const dialogo = await editar(insumo());
    const unidad = within(dialogo).getByLabelText(/^Unidad de medida/);
    await userEvent.clear(unidad);
    await userEvent.type(unidad, 'comprimido');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Paracetamol ya se usó en prescripciones o registros, así que no se puede cambiar su tipo ni su unidad de medida. Si hace falta otro, agréguelo como nuevo.',
    );
    expect(within(dialogo).getByLabelText(/^Unidad de medida/)).toHaveAttribute('readonly');
    expect(within(dialogo).getByLabelText(/^Unidad de medida/)).toHaveValue('mg');
    expect(within(dialogo).getByLabelText(/^Tipo/)).toHaveAttribute('readonly');
  });
});
