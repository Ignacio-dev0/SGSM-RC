import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ProveedorSesion } from '../../auth/ContextoSesion';
import { useSesion } from '../../auth/useSesion';
import { ENFERMERO } from '../../pruebas/datos';
import {
  conEstudios,
  estudio,
  prepararEstudios,
  restaurarEstudios,
  validarRostro,
} from '../../pruebas/datosEstudios';
import { simularSesion } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';
import { tema } from '../../tema';
import { useConfirmacionEstudio, type ResultadoConfirmacion } from './ConfirmacionEstudio';

beforeEach(prepararEstudios);
afterEach(restaurarEstudios);

/** Una pantalla cualquiera (como el panel de recordatorios) que confirma un estudio por su id. */
function Pantalla({ alTerminar }: { alTerminar: (r: ResultadoConfirmacion) => void }) {
  const { usuario } = useSesion();
  const { abrirConfirmacion, dialogoConfirmacion } = useConfirmacionEstudio({ alTerminar });
  if (!usuario) return null;
  return (
    <>
      <button
        type="button"
        onClick={() =>
          abrirConfirmacion(60, {
            paciente: { apellido: 'Benítez', nombre: 'Rosa', dni: '30111222', cama: 'A-01' },
          })
        }
      >
        Confirmar desde el recordatorio
      </button>
      <button type="button" onClick={() => abrirConfirmacion(60)}>
        Confirmar solo con el id
      </button>
      {dialogoConfirmacion}
    </>
  );
}

function dibujar() {
  simularSesion(ENFERMERO);
  const alTerminar = vi.fn();
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cliente}>
      <ThemeProvider theme={tema}>
        <ProveedorSesion>
          <Pantalla alTerminar={alTerminar} />
        </ProveedorSesion>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return alTerminar;
}

const dialogo = () => screen.findByRole('dialog', { name: 'Confirmar que se realizó el estudio' });

describe('confirmar un estudio desde otra pantalla (useConfirmacionEstudio)', () => {
  it('con el id y los datos del paciente pide el estudio, lo confirma con el rostro y avisa', async () => {
    validarRostro();
    let enviado: unknown;
    servidor.use(
      http.post('*/api/estudios/60/confirmar', async ({ request }) => {
        enviado = await request.json();
        return HttpResponse.json({
          data: estudio({
            estado: 'REALIZADO',
            realizadoEn: new Date().toISOString(),
            confirmadoPor: { id: 3, nombre: 'Acosta, Sofía' },
          }),
        });
      }),
    );
    const alTerminar = dibujar();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirmar desde el recordatorio' }),
    );
    const d = await dialogo();
    expect(await within(d).findByText('Rx de tórax frente y perfil')).toBeVisible();
    expect(d).toHaveTextContent('Benítez, Rosa');
    expect(d).toHaveTextContent(/Cama A.01/);
    await userEvent.click(within(d).getByRole('button', { name: 'Confirmar con mi rostro' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    await waitFor(() => expect(alTerminar).toHaveBeenCalledTimes(1));
    expect(alTerminar.mock.calls[0]![0]).toMatchObject({
      tipo: 'exito',
      texto: expect.stringMatching(/Se confirmó que se realizó Rx de tórax frente y perfil/),
    });
    expect(enviado).toEqual({ validacionToken: 'tok-ok' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('solo con el id también identifica al paciente (lo pide al servidor)', async () => {
    dibujar();

    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar solo con el id' }));
    const d = await dialogo();

    await waitFor(() => expect(d).toHaveTextContent('Benítez, Rosa'));
    expect(d).toHaveTextContent('DNI 30111222');
    expect(d).toHaveTextContent(/Cama A.01/);
  });

  it('si el estudio ya no está programado, lo dice y no ofrece confirmarlo', async () => {
    conEstudios(
      estudio({
        estado: 'REALIZADO',
        realizadoEn: '2026-10-08T13:05:00.000Z',
        confirmadoPor: { id: 4, nombre: 'Gómez, Lucía' },
      }),
    );
    dibujar();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirmar desde el recordatorio' }),
    );
    const d = await dialogo();

    expect(await within(d).findByRole('alert')).toHaveTextContent(
      'Este estudio ya estaba confirmado o cancelado (por usted o por otra persona)',
    );
    expect(
      within(d).queryByRole('button', { name: 'Confirmar con mi rostro' }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('si el estudio no se puede cargar, lo dice y deja reintentar', async () => {
    let fallar = true;
    servidor.use(
      http.get('*/api/estudios/60', () =>
        fallar
          ? HttpResponse.json(
              { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error' } },
              { status: 500 },
            )
          : HttpResponse.json({ data: estudio() }),
      ),
    );
    dibujar();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirmar desde el recordatorio' }),
    );
    const d = await dialogo();
    const aviso = await within(d).findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudo cargar el estudio/);
    fallar = false;
    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));
    expect(await within(d).findByText('Rx de tórax frente y perfil')).toBeVisible();
  });
});
