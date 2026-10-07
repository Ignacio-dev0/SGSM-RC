import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO, MEDICO } from '../../pruebas/datos';
import { prepararSuministros, suministro, validarRostro } from '../../pruebas/datosSuministros';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(prepararSuministros);
afterEach(() => vi.unstubAllEnvs());

describe('historial y corrección de suministros (T415 · T416 · CU22 · CU23)', () => {
  it('lista los suministros y filtra por tipo y responsable', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/suministros', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          data: [suministro()],
          meta: { pagina: 1, porPagina: 20, total: 1, totalPaginas: 1 },
        });
      }),
    );
    renderizarApp('/suministros', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Suministros' });
    expect(await within(tabla).findByText(/Paracetamol × 500 mg/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Medicamentos');
    await screen.findByRole('option', { name: 'Acosta, Sofía' });
    await userEvent.selectOptions(screen.getByLabelText('Responsable'), 'Acosta, Sofía');

    await waitFor(() => {
      expect(pedidos.at(-1)?.get('tipoInsumo')).toBe('MEDICAMENTO');
      expect(pedidos.at(-1)?.get('usuarioId')).toBe('3');
    });
  });

  it('corrige la cantidad de una administración dentro de las 24 horas, con motivo y rostro', async () => {
    let enviado: Record<string, unknown> | undefined;
    validarRostro();
    servidor.use(
      http.get('*/api/suministros', () =>
        HttpResponse.json({
          data: [suministro()],
          meta: { pagina: 1, porPagina: 20, total: 1, totalPaginas: 1 },
        }),
      ),
      http.patch('*/api/suministros/90', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          data: suministro({
            corregido: true,
            motivoCorreccion: 'Media dosis',
            corregidoPor: 'Acosta, Sofía',
            detalles: [
              {
                insumoId: 1,
                insumo: 'Paracetamol',
                tipoInsumo: 'MEDICAMENTO',
                cantidad: 250,
                unidad: 'mg',
              },
            ],
          }),
        });
      }),
    );
    renderizarApp('/suministros', ENFERMERO);

    await userEvent.click(await screen.findByText(/Paracetamol × 500 mg/));
    const dialogo = screen.getByRole('dialog', { name: /Suministro/ });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Corregir' }));
    const cantidad = within(dialogo).getByLabelText(/^Cantidad/);
    await userEvent.clear(cantidad);
    await userEvent.type(cantidad, '250');
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'Media dosis');
    await userEvent.click(
      within(dialogo).getByRole('button', { name: 'Confirmar corrección con mi rostro' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    expect(await within(dialogo).findByText(/Corregido por Acosta, Sofía/)).toBeInTheDocument();
    expect(enviado).toEqual({ cantidad: 250, motivo: 'Media dosis', validacionToken: 'tok-ok' });
  });

  it('pasadas las 24 horas ya no ofrece corregir', async () => {
    servidor.use(
      http.get('*/api/suministros', () =>
        HttpResponse.json({
          data: [suministro({ corregibleHasta: new Date(Date.now() - 1000).toISOString() })],
          meta: { pagina: 1, porPagina: 20, total: 1, totalPaginas: 1 },
        }),
      ),
    );
    renderizarApp('/suministros', ENFERMERO);

    await userEvent.click(await screen.findByText(/Paracetamol × 500 mg/));
    const dialogo = screen.getByRole('dialog', { name: /Suministro/ });
    expect(within(dialogo).queryByRole('button', { name: 'Corregir' })).not.toBeInTheDocument();
    expect(within(dialogo).getByText(/plazo de corrección venció/)).toBeInTheDocument();
  });

  it('el médico consulta el historial pero no registra suministros', async () => {
    servidor.use(
      http.get('*/api/suministros', () =>
        HttpResponse.json({
          data: [],
          meta: { pagina: 1, porPagina: 20, total: 0, totalPaginas: 0 },
        }),
      ),
    );
    renderizarApp('/suministros', MEDICO);
    await screen.findByRole('table', { name: 'Suministros' });
    expect(
      screen.queryByRole('button', { name: /Administrar medicamento/ }),
    ).not.toBeInTheDocument();
  });
});
