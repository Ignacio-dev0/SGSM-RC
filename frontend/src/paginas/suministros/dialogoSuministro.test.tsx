import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Suministro } from '../../api/tipos';
import { ProveedorSesion } from '../../auth/ContextoSesion';
import { ENFERMERO } from '../../pruebas/datos';
import { prepararSuministros, suministro } from '../../pruebas/datosSuministros';
import { simularSesion } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';
import { tema } from '../../tema';
import { DialogoSuministro } from './DialogoSuministro';

beforeEach(prepararSuministros);
afterEach(() => vi.unstubAllEnvs());

/** Un movimiento de insumos de la cama A-01, con dos insumos cargados. */
const deInsumos = () =>
  suministro({
    tipo: 'INSUMOS',
    prescripcion: null,
    tomaProgramada: null,
    detalles: [
      { insumoId: 20, insumo: 'Gasa estéril', tipoInsumo: 'INSUMO', cantidad: 2, unidad: 'unidad' },
      {
        insumoId: 21,
        insumo: 'Pañal talle M',
        tipoInsumo: 'INSUMO',
        cantidad: 1,
        unidad: 'unidad',
      },
    ],
  });

async function abrirCorreccion(s: Suministro) {
  simularSesion(ENFERMERO);
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={cliente}>
      <ThemeProvider theme={tema}>
        <ProveedorSesion>
          <DialogoSuministro inicial={s} alCerrar={() => {}} />
        </ProveedorSesion>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  const dialogo = screen.getByRole('dialog', { name: /Suministro/ });
  await userEvent.click(await within(dialogo).findByRole('button', { name: 'Corregir' }));
  return dialogo;
}

const confirmarConRostro = (dialogo: HTMLElement) =>
  within(dialogo).getByRole('button', { name: 'Confirmar corrección con mi rostro' });

describe('corregir un suministro: cantidades de insumos', () => {
  it('vaciar la cantidad de un insumo deshabilita confirmar, y escribirla de nuevo lo habilita', async () => {
    const dialogo = await abrirCorreccion(deInsumos());
    await userEvent.type(
      within(dialogo).getByLabelText(/Motivo de la corrección/),
      'Se cargó de más',
    );
    expect(confirmarConRostro(dialogo)).toBeEnabled();

    const gasa = within(dialogo).getByLabelText('Cantidad de Gasa estéril');
    await userEvent.clear(gasa);
    expect(confirmarConRostro(dialogo)).toBeDisabled();

    await userEvent.type(gasa, '1');
    expect(confirmarConRostro(dialogo)).toBeEnabled();
  });

  it('con una cantidad en cero tampoco se puede confirmar', async () => {
    const dialogo = await abrirCorreccion(deInsumos());
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'Error');
    const pañal = within(dialogo).getByLabelText('Cantidad de Pañal talle M');
    await userEvent.clear(pañal);
    await userEvent.type(pañal, '0');
    expect(confirmarConRostro(dialogo)).toBeDisabled();
  });

  it('si se quitan todos los insumos no se puede confirmar', async () => {
    const dialogo = await abrirCorreccion(
      suministro({
        ...deInsumos(),
        detalles: [
          {
            insumoId: 20,
            insumo: 'Gasa estéril',
            tipoInsumo: 'INSUMO',
            cantidad: 2,
            unidad: 'unidad',
          },
        ],
      }),
    );
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'Error');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Quitar Gasa estéril' }));
    expect(confirmarConRostro(dialogo)).toBeDisabled();
    expect(within(dialogo).getByText(/Falta indicar/)).toHaveTextContent(
      'Falta indicar al menos un insumo.',
    );
  });
});

describe('corregir un suministro: lo que se confirma con el rostro (UX-08)', () => {
  it('de un medicamento muestra al paciente, el antes, el después y el motivo', async () => {
    const dialogo = await abrirCorreccion(suministro());
    const cantidad = within(dialogo).getByLabelText(/^Cantidad/);
    await userEvent.clear(cantidad);
    await userEvent.type(cantidad, '250');
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'Media dosis');
    await userEvent.click(confirmarConRostro(dialogo));

    const validacion = await screen.findByRole('dialog', { name: /Confirmar con su rostro/ });
    // La cama con el guion que no corta (F3).
    expect(validacion).toHaveTextContent(
      `Benítez, Rosa · DNI 30111222 · Cama A${String.fromCharCode(0x2011)}01`,
    );
    expect(validacion).toHaveTextContent('Antes: Paracetamol × 500 mg');
    expect(validacion).toHaveTextContent('Después: Paracetamol × 250 mg');
    expect(validacion).toHaveTextContent('Motivo: Media dosis');
  });

  it('de insumos muestra la lista de antes y la de después', async () => {
    const dialogo = await abrirCorreccion(deInsumos());
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Quitar Pañal talle M' }));
    const gasa = within(dialogo).getByLabelText('Cantidad de Gasa estéril');
    await userEvent.clear(gasa);
    await userEvent.type(gasa, '3');
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'Se cargó mal');
    await userEvent.click(confirmarConRostro(dialogo));

    const validacion = await screen.findByRole('dialog', { name: /Confirmar con su rostro/ });
    expect(validacion).toHaveTextContent(
      'Antes: Gasa estéril × 2 unidad, Pañal talle M × 1 unidad',
    );
    expect(validacion).toHaveTextContent('Después: Gasa estéril × 3 unidad');
    expect(validacion).not.toHaveTextContent(/Después:.*Pañal/);
    expect(validacion).toHaveTextContent('Motivo: Se cargó mal');
  });

  it('lo que se envía es lo mismo que se mostró', async () => {
    let enviado: Record<string, unknown> | undefined;
    servidor.use(
      http.post('*/api/biometria/validar', () =>
        HttpResponse.json({ data: { valido: true, validacionToken: 'tok-ok', similitud: 0.9 } }),
      ),
      http.patch('*/api/suministros/90', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: suministro({ corregido: true }) });
      }),
    );
    const dialogo = await abrirCorreccion(suministro());
    const cantidad = within(dialogo).getByLabelText(/^Cantidad/);
    await userEvent.clear(cantidad);
    await userEvent.type(cantidad, '250');
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'Media dosis');
    await userEvent.click(confirmarConRostro(dialogo));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    await within(dialogo).findByText(/Corregido por/);
    expect(enviado).toEqual({ cantidad: 250, motivo: 'Media dosis', validacionToken: 'tok-ok' });
  });
});

describe('corregir un suministro: qué falta para confirmar (UX-17)', () => {
  it('el requisito del motivo se ve desde el inicio, como ayuda del campo', async () => {
    const dialogo = await abrirCorreccion(suministro());
    expect(within(dialogo).getByLabelText(/Motivo de la corrección/)).toHaveAccessibleDescription(
      'Escriba el motivo (mínimo 3 letras)',
    );
  });

  it('con el botón deshabilitado, un texto junto a él dice qué falta', async () => {
    const dialogo = await abrirCorreccion(suministro());
    const boton = confirmarConRostro(dialogo);
    expect(boton).toBeDisabled();
    const falta = within(dialogo).getByText(/Falta indicar/);
    expect(falta).toHaveTextContent('Falta indicar el motivo (mínimo 3 letras).');
    // Está en la misma botonera que el botón, no perdido arriba.
    expect(falta.parentElement).toContainElement(boton);
    expect(boton).toHaveAccessibleDescription(/Falta indicar el motivo/);

    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'ab');
    expect(within(dialogo).getByText(/Falta indicar/)).toBeInTheDocument();
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'c');
    expect(within(dialogo).queryByText(/Falta indicar/)).not.toBeInTheDocument();
    expect(boton).toBeEnabled();
  });

  it('dice la cantidad cuando falta, y también el motivo si falta', async () => {
    const dialogo = await abrirCorreccion(suministro());
    await userEvent.clear(within(dialogo).getByLabelText(/^Cantidad/));
    expect(within(dialogo).getByText(/Falta indicar/)).toHaveTextContent(
      'Falta indicar la cantidad (mayor que 0) y el motivo (mínimo 3 letras).',
    );
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'Error');
    expect(within(dialogo).getByText(/Falta indicar/)).toHaveTextContent(
      'Falta indicar la cantidad (mayor que 0).',
    );
  });

  it('en insumos dice que cada uno necesita 1 o más', async () => {
    const dialogo = await abrirCorreccion(deInsumos());
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'Error');
    await userEvent.clear(within(dialogo).getByLabelText('Cantidad de Gasa estéril'));
    expect(within(dialogo).getByText(/Falta indicar/)).toHaveTextContent(
      'Falta indicar una cantidad de 1 o más en cada insumo.',
    );
  });
});

describe('corregir un suministro: la rueda del mouse no cambia las cantidades (UX-19)', () => {
  it('en un medicamento, la rueda sobre la cantidad enfocada le saca el foco y no la modifica', async () => {
    const dialogo = await abrirCorreccion(suministro());
    const cantidad = within(dialogo).getByLabelText(/^Cantidad/);
    cantidad.focus();
    expect(cantidad).toHaveFocus();

    fireEvent.wheel(cantidad, { deltaY: -100 });

    expect(cantidad).not.toHaveFocus();
    expect(cantidad).toHaveValue(500);
  });

  it('en los insumos también', async () => {
    const dialogo = await abrirCorreccion(deInsumos());
    const gasa = within(dialogo).getByLabelText('Cantidad de Gasa estéril');
    gasa.focus();
    expect(gasa).toHaveFocus();

    fireEvent.wheel(gasa, { deltaY: 100 });

    expect(gasa).not.toHaveFocus();
    expect(gasa).toHaveValue(2);
  });
});

describe('corregir un suministro: plazo y observaciones (F5)', () => {
  const PASARON_24_H =
    'Pasaron más de 24 horas: ya no se puede corregir. Avise a su supervisora para dejar constancia.';

  /** Contesta la validación facial y guarda lo que se manda a corregir. */
  function registrarCorreccion() {
    const enviados: Record<string, unknown>[] = [];
    servidor.use(
      http.post('*/api/biometria/validar', () =>
        HttpResponse.json({ data: { valido: true, validacionToken: 'tok-ok', similitud: 0.9 } }),
      ),
      http.patch('*/api/suministros/90', async ({ request }) => {
        const cuerpo = (await request.json()) as Record<string, unknown>;
        enviados.push(cuerpo);
        return HttpResponse.json({
          data: suministro({
            corregido: true,
            observaciones: (cuerpo.observaciones as string | null | undefined) ?? null,
          }),
        });
      }),
    );
    return enviados;
  }

  async function confirmarConElRostro(dialogo: HTMLElement) {
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'Se cargó mal');
    await userEvent.click(confirmarConRostro(dialogo));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );
    await within(dialogo).findByText(/Corregido por/);
  }

  const HORA = 3_600_000;

  /** Un suministro de hace `hace` horas con `plazo` horas para corregirlo (ya vencido). */
  function abrirVencido(hace: number, plazo: number) {
    simularSesion(ENFERMERO);
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const fechaHora = Date.now() - hace * HORA;
    render(
      <QueryClientProvider client={cliente}>
        <ThemeProvider theme={tema}>
          <ProveedorSesion>
            <DialogoSuministro
              inicial={suministro({
                fechaHora: new Date(fechaHora).toISOString(),
                corregibleHasta: new Date(fechaHora + plazo * HORA).toISOString(),
              })}
              alCerrar={() => {}}
            />
          </ProveedorSesion>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    return screen.getByRole('dialog', { name: /Suministro/ });
  }

  it('pasadas las 24 horas dice que nadie puede corregirlo y a quién avisar', async () => {
    const dialogo = abrirVencido(25, 24);
    expect(await within(dialogo).findByText(PASARON_24_H)).toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: 'Corregir' })).not.toBeInTheDocument();
  });

  it('el plazo es el que tiene configurado el servidor, no siempre 24 horas', async () => {
    const dialogo = abrirVencido(50, 48);
    expect(
      await within(dialogo).findByText(
        'Pasaron más de 48 horas: ya no se puede corregir. Avise a su supervisora para dejar constancia.',
      ),
    ).toBeInTheDocument();
  });

  it('si el plazo vence mientras se corrige, el rechazo del servidor dice lo mismo', async () => {
    servidor.use(
      http.post('*/api/biometria/validar', () =>
        HttpResponse.json({ data: { valido: true, validacionToken: 'tok-ok', similitud: 0.9 } }),
      ),
      http.patch('*/api/suministros/90', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'FUERA_DE_PLAZO',
              mensaje: 'Un suministro solo se puede corregir dentro de las 24 horas de registrado.',
            },
          },
          { status: 422 },
        ),
      ),
    );
    const dialogo = await abrirCorreccion(suministro());
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'Se cargó mal');
    await userEvent.click(confirmarConRostro(dialogo));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(PASARON_24_H);
    // Sale de la corrección: no queda un botón que nunca va a funcionar, ni se ofrece Corregir.
    expect(
      within(dialogo).queryByRole('button', { name: 'Confirmar corrección con mi rostro' }),
    ).not.toBeInTheDocument();
    expect(within(dialogo).queryByLabelText(/Motivo de la corrección/)).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: 'Corregir' })).not.toBeInTheDocument();
    expect(within(dialogo).getAllByText(PASARON_24_H)).toHaveLength(1);
    expect(within(dialogo).getByRole('button', { name: 'Cerrar' })).toBeEnabled();
  });

  it('las observaciones se pueden corregir: vienen cargadas y se mandan si cambian', async () => {
    const enviados = registrarCorreccion();
    const dialogo = await abrirCorreccion(suministro({ observaciones: 'Con agua' }));
    const observaciones = within(dialogo).getByLabelText(/^Observaciones/);
    expect(observaciones).toHaveValue('Con agua');
    await userEvent.clear(observaciones);
    await userEvent.type(observaciones, 'Con jugo');
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'Se cargó mal');
    await userEvent.click(confirmarConRostro(dialogo));

    // Junto a la cámara se ve también el cambio de las observaciones.
    const validacion = await screen.findByRole('dialog', { name: /Confirmar con su rostro/ });
    expect(validacion).toHaveTextContent('Observaciones: Con agua → Con jugo');
    await userEvent.click(within(validacion).getByRole('button', { name: /Simular el rostro de/ }));

    await within(dialogo).findByText(/Corregido por/);
    expect(enviados[0]).toEqual({
      cantidad: 500,
      observaciones: 'Con jugo',
      motivo: 'Se cargó mal',
      validacionToken: 'tok-ok',
    });
  });

  it('si no se tocan, las observaciones no viajan (quedan como estaban)', async () => {
    const enviados = registrarCorreccion();
    const dialogo = await abrirCorreccion(suministro({ observaciones: 'Con agua' }));
    const cantidad = within(dialogo).getByLabelText(/^Cantidad/);
    await userEvent.clear(cantidad);
    await userEvent.type(cantidad, '250');

    await confirmarConElRostro(dialogo);

    expect(enviados[0]).not.toHaveProperty('observaciones');
  });

  it('borrarlas las deja vacías', async () => {
    const enviados = registrarCorreccion();
    const dialogo = await abrirCorreccion(suministro({ observaciones: 'Con agua' }));
    await userEvent.clear(within(dialogo).getByLabelText(/^Observaciones/));

    await confirmarConElRostro(dialogo);

    expect(enviados[0]).toMatchObject({ observaciones: null });
  });
});

describe('corregir un suministro: tres validaciones fallidas (F4)', () => {
  it('dice claramente que la corrección NO se guardó', async () => {
    const corregir = vi.fn(() => HttpResponse.json({ data: suministro() }));
    servidor.use(
      http.post('*/api/biometria/validar', () =>
        HttpResponse.json({ data: { valido: false, intentosRestantes: 0, cancelada: true } }),
      ),
      http.patch('*/api/suministros/90', corregir),
    );
    const dialogo = await abrirCorreccion(suministro());
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'Se cargó mal');
    await userEvent.click(confirmarConRostro(dialogo));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    const rostro = screen.getByRole('dialog', { name: /Confirmar con su rostro/ });
    expect(await within(rostro).findByRole('alert')).toHaveTextContent(
      'No se guardó la corrección. Los tres intentos fallidos quedaron registrados y se avisó al administrador.',
    );
    expect(corregir).not.toHaveBeenCalled();
  });
});
