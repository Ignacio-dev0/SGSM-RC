import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Insumo } from '../../api/tipos';
import { ADMIN, ENFERMERO } from '../../pruebas/datos';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

const insumo = (extra: Partial<Insumo> = {}): Insumo => ({
  id: 1,
  nombre: 'Paracetamol',
  tipo: 'MEDICAMENTO',
  unidadMedida: 'mg',
  presentacion: 'Comprimidos 500 mg',
  activo: true,
  ...extra,
});

describe('catálogo de insumos y medicamentos (T303)', () => {
  it('lista el catálogo y filtra por tipo', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/insumos', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: [insumo()] });
      }),
    );
    renderizarApp('/catalogo', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Catálogo' });
    expect(await within(tabla).findByText('Paracetamol')).toBeInTheDocument();
    expect(within(tabla).getByText('Medicamento')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Insumos');
    await waitFor(() => expect(pedidos.at(-1)?.get('tipo')).toBe('INSUMO'));
  });

  it('agrega un insumo al catálogo', async () => {
    let enviado: unknown;
    servidor.use(
      http.get('*/api/insumos', () => HttpResponse.json({ data: [] })),
      http.post('*/api/insumos', async ({ request }) => {
        enviado = await request.json();
        return HttpResponse.json(
          { data: insumo({ id: 9, nombre: 'Pañal adulto', tipo: 'INSUMO' }) },
          { status: 201 },
        );
      }),
    );
    renderizarApp('/catalogo', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Agregar al catálogo' }));
    // El título dice qué se agrega según el tipo elegido (medicamento o insumo).
    const dialogo = screen.getByRole('dialog', { name: 'Nuevo medicamento' });
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre/), 'Pañal adulto');
    await userEvent.selectOptions(within(dialogo).getByLabelText(/^Tipo/), 'Insumo no medicinal');
    expect(dialogo).toHaveAccessibleName('Nuevo insumo');
    await userEvent.type(within(dialogo).getByLabelText(/^Unidad de medida/), 'unidad');
    await userEvent.type(within(dialogo).getByLabelText(/^Presentación/), 'Paquete x 10');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Pañal adulto/);
    expect(enviado).toEqual({
      nombre: 'Pañal adulto',
      tipo: 'INSUMO',
      unidadMedida: 'unidad',
      presentacion: 'Paquete x 10',
    });
  });

  it('da de baja un insumo desde su edición', async () => {
    const baja = vi.fn(() => HttpResponse.json({ data: insumo({ activo: false }) }));
    servidor.use(
      http.get('*/api/insumos', () => HttpResponse.json({ data: [insumo()] })),
      http.delete('*/api/insumos/1', baja),
    );
    renderizarApp('/catalogo', ADMIN);

    await userEvent.click(await screen.findByText('Paracetamol'));
    const dialogo = screen.getByRole('dialog', { name: 'Editar medicamento' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Dar de baja' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/dado de baja/);
    expect(baja).toHaveBeenCalled();
  });

  it('el enfermero no tiene acceso a la administración del catálogo', async () => {
    renderizarApp('/catalogo', ENFERMERO);
    expect(await screen.findByText(/No tiene permiso/)).toBeInTheDocument();
  });
});
