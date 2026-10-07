import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO } from '../../pruebas/datos';
import { listaDePacientes, paciente } from '../../pruebas/datosPacientes';
import {
  prepararSuministros,
  INSUMOS,
  suministro,
  validarRostro,
} from '../../pruebas/datosSuministros';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(prepararSuministros);
afterEach(() => vi.unstubAllEnvs());

describe('registro de insumos (T414 · CU21)', () => {
  it('carga varios insumos con sus cantidades y los registra en un solo movimiento', async () => {
    let enviado: Record<string, unknown> | undefined;
    validarRostro();
    servidor.use(
      http.post('*/api/suministros/insumos', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        // La respuesta refleja los insumos enviados, como hace el backend.
        const detalles = (enviado.items as { insumoId: number; cantidad: number }[]).map((i) => ({
          insumoId: i.insumoId,
          insumo: INSUMOS.find((x) => x.id === i.insumoId)!.nombre,
          tipoInsumo: 'INSUMO' as const,
          cantidad: i.cantidad,
          unidad: 'unidad',
        }));
        return HttpResponse.json(
          { data: suministro({ tipo: 'INSUMOS', prescripcion: null, detalles }) },
          { status: 201 },
        );
      }),
    );
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    await userEvent.click(screen.getByRole('button', { name: /Agregar Gasa estéril/ }));
    await userEvent.click(screen.getByRole('button', { name: /Agregar Pañal talle M/ }));
    const lista = screen.getByRole('list', { name: 'Insumos a registrar' });
    expect(within(lista).getByLabelText('Cantidad de Gasa estéril')).toHaveValue(2);
    await userEvent.click(within(lista).getByRole('button', { name: 'Sumar uno a Pañal talle M' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(/Se registraron 2 insumos/);
    expect(enviado).toMatchObject({
      pacienteId: 7,
      items: [
        { insumoId: 20, cantidad: 2 },
        { insumoId: 21, cantidad: 2 },
      ],
      validacionToken: 'tok-ok',
    });
  });

  it('al cambiar de paciente no arrastra los insumos ni las observaciones del anterior', async () => {
    const otro = paciente({ id: 8, dni: '27444555', nombre: 'Luis', apellido: 'Gómez' });
    servidor.use(
      http.get('*/api/pacientes', () => listaDePacientes([paciente(), otro])),
      http.get('*/api/pacientes/8', () => HttpResponse.json({ data: otro })),
    );
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    await userEvent.type(screen.getByLabelText('Observaciones'), 'Curación de escara');
    await userEvent.selectOptions(
      screen.getByLabelText('Paciente'),
      await screen.findByRole('option', { name: /Gómez, Luis/ }),
    );

    await waitFor(() => expect(screen.getByLabelText('Observaciones')).toHaveValue(''));
    expect(screen.queryByRole('list', { name: 'Insumos a registrar' })).not.toBeInTheDocument();
  });

  it('si no se puede cargar el catálogo de insumos, lo dice y deja reintentar', async () => {
    servidor.use(
      http.get('*/api/insumos', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 500 },
        ),
      ),
    );
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No se pudo cargar el catálogo de insumos/,
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('no deja confirmar sin insumos', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);
    expect(await screen.findByRole('button', { name: 'Confirmar con mi rostro' })).toBeDisabled();
  });
});
