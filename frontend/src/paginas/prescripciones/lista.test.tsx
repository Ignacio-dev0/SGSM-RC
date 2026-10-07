import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Prescripcion } from '../../api/tipos';
import { ENFERMERO, MEDICO } from '../../pruebas/datos';
import { listaDePacientes, paciente } from '../../pruebas/datosPacientes';
import {
  prepararPrescripciones,
  restaurarPruebas,
  AHORA,
  errorDelServidor,
  fijarAhora,
  prescripcion,
  simularPantallaAngosta,
} from '../../pruebas/datosPrescripciones';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';
import { estadoToma, textoEstadoToma } from '../suministros/estadoToma';

beforeEach(prepararPrescripciones);
afterEach(restaurarPruebas);

describe('prescripciones del paciente (T305 · CU18)', () => {
  it('lista las prescripciones con dosis, frecuencia, próxima toma y últimas administraciones', async () => {
    servidor.use(
      http.get('*/api/pacientes/7/prescripciones', () =>
        HttpResponse.json({ data: [prescripcion()] }),
      ),
    );
    renderizarApp('/pacientes/7?pestana=prescripciones', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Prescripciones' });
    await within(tabla).findByText('Paracetamol');
    const fila = within(tabla).getAllByRole('row')[1]!;
    expect(fila).toHaveTextContent('Paracetamol');
    expect(fila).toHaveTextContent('500 mg');
    expect(fila).toHaveTextContent('cada 8 h');
    expect(fila).toHaveTextContent('Oral');
    expect(fila).toHaveTextContent('Vigente');
    expect(fila).toHaveTextContent(/Acosta/);
    expect(screen.queryByRole('button', { name: /Nueva prescripción/ })).not.toBeInTheDocument();
  });

  it('filtra entre vigentes y todas', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/pacientes/7/prescripciones', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: [] });
      }),
    );
    renderizarApp('/pacientes/7?pestana=prescripciones', MEDICO);

    await screen.findByRole('table', { name: 'Prescripciones' });
    expect(pedidos[0]?.get('estado')).toBe('VIGENTE');
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'Todas');
    await waitFor(() => expect(pedidos.at(-1)?.has('estado')).toBe(false));
  });

  it('si no se pueden cargar lo dice y deja reintentar, sin afirmar que no hay medicación (UX-02)', async () => {
    let fallar = true;
    servidor.use(
      http.get('*/api/pacientes/7/prescripciones', () =>
        fallar ? errorDelServidor() : HttpResponse.json({ data: [prescripcion()] }),
      ),
    );
    renderizarApp('/pacientes/7?pestana=prescripciones', ENFERMERO);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudieron cargar las prescripciones/);
    expect(screen.queryByText(/no tiene prescripciones vigentes/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fallar = false;
    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));
    const tabla = await screen.findByRole('table', { name: 'Prescripciones' });
    await within(tabla).findByText('Paracetamol');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('próxima toma y estado de la toma en la tabla (UX-15)', () => {
  const ahora = new Date(AHORA);

  it('la próxima toma dice si es hoy, mañana o qué día, y el estado de la toma va en la misma celda', async () => {
    fijarAhora();
    const hoy = prescripcion();
    // Cada 24 h: "08:00" puede ser mañana o pasado mañana, no solo "la hora".
    const cadaDia = prescripcion({
      id: 41,
      frecuenciaHoras: 24,
      ultimasAdministraciones: [],
      proximaToma: '2026-10-08T11:00:00.000Z',
    });
    const cada72 = prescripcion({
      id: 42,
      frecuenciaHoras: 72,
      ultimasAdministraciones: [],
      proximaToma: '2026-10-09T11:00:00.000Z',
    });
    servidor.use(
      http.get('*/api/pacientes/7/prescripciones', () =>
        HttpResponse.json({ data: [hoy, cadaDia, cada72] }),
      ),
    );
    renderizarApp('/pacientes/7?pestana=prescripciones', MEDICO);

    const tabla = await screen.findByRole('table', { name: 'Prescripciones' });
    await within(tabla).findAllByText('Paracetamol');
    const filas = within(tabla).getAllByRole('row');
    expect(filas[1]).toHaveTextContent('hoy 16:00');
    expect(filas[1]).toHaveTextContent(textoEstadoToma(estadoToma(hoy, ahora)));
    expect(filas[2]).toHaveTextContent('mañana 08:00');
    expect(filas[2]).toHaveTextContent(textoEstadoToma(estadoToma(cadaDia, ahora)));
    expect(filas[3]).toHaveTextContent('09/10 08:00');
    expect(filas[3]).toHaveTextContent(textoEstadoToma(estadoToma(cada72, ahora)));
  });

  it('una toma atrasada se distingue de una futura', async () => {
    fijarAhora();
    const atrasada = prescripcion({ proximaToma: '2026-10-07T17:00:00.000Z' });
    servidor.use(
      http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [atrasada] })),
    );
    renderizarApp('/pacientes/7?pestana=prescripciones', MEDICO);

    const tabla = await screen.findByRole('table', { name: 'Prescripciones' });
    await within(tabla).findByText('Paracetamol');
    const textoAtrasada = textoEstadoToma(estadoToma(atrasada, new Date(AHORA)));
    expect(textoAtrasada).toMatch(/^Atrasada/);
    expect(within(tabla).getAllByRole('row')[1]).toHaveTextContent(textoAtrasada);
  });

  it('una prescripción que no está vigente no muestra estado de la toma', async () => {
    fijarAhora();
    servidor.use(
      http.get('*/api/pacientes/7/prescripciones', () =>
        HttpResponse.json({
          data: [prescripcion({ estado: 'SUSPENDIDA', proximaToma: null })],
        }),
      ),
    );
    renderizarApp('/pacientes/7?pestana=prescripciones', MEDICO);

    const tabla = await screen.findByRole('table', { name: 'Prescripciones' });
    await within(tabla).findByText('Paracetamol');
    const fila = within(tabla).getAllByRole('row')[1]!;
    expect(fila).toHaveTextContent('Suspendida');
    expect(fila).not.toHaveTextContent(/Sin más tomas|Atrasada|Faltan|Toca ahora/);
  });
});

describe('prescripciones del paciente en pantalla angosta (tablet vertical y teléfono)', () => {
  const ahora = new Date(AHORA);
  const lista = (data: Prescripcion[]) =>
    servidor.use(http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data })));

  beforeEach(() => {
    simularPantallaAngosta();
    fijarAhora();
  });

  it('muestra una tarjeta por prescripción en lugar de la tabla, con todo a la vista', async () => {
    const enalapril = prescripcion({
      id: 41,
      medicamento: { ...prescripcion().medicamento, id: 2, nombre: 'Enalapril' },
    });
    lista([prescripcion(), enalapril]);
    renderizarApp('/pacientes/7?pestana=prescripciones', ENFERMERO);

    const tarjetas = await screen.findByRole('list', { name: 'Prescripciones' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const items = within(tarjetas).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    const tarjeta = items[0]!;
    expect(tarjeta).toHaveTextContent(/Paracetamol/);
    expect(tarjeta).toHaveTextContent(/500\smg/);
    expect(tarjeta).toHaveTextContent('Vigente');
    expect(tarjeta).toHaveTextContent(textoEstadoToma(estadoToma(prescripcion(), ahora)));
    expect(tarjeta).toHaveTextContent(/Oral · cada 8\sh/);
    expect(tarjeta).toHaveTextContent('Próxima: hoy 16:00');
    expect(tarjeta).toHaveTextContent('Última: 07/10/2026 08:05 (Acosta, Sofía)');
    expect(within(tarjeta).getByRole('button', { name: 'Administrar Paracetamol' })).toBeVisible();
  });

  it('sin administraciones previas lo dice, y una toma atrasada se ve atrasada', async () => {
    const atrasada = prescripcion({
      ultimasAdministraciones: [],
      proximaToma: '2026-10-07T17:00:00.000Z',
    });
    lista([atrasada]);
    renderizarApp('/pacientes/7?pestana=prescripciones', ENFERMERO);

    const tarjeta = within(
      await screen.findByRole('list', { name: 'Prescripciones' }),
    ).getAllByRole('listitem')[0]!;
    expect(tarjeta).toHaveTextContent('Próxima: hoy 14:00');
    expect(tarjeta).toHaveTextContent('Última: sin registros');
    expect(tarjeta).toHaveTextContent(textoEstadoToma(estadoToma(atrasada, ahora)));
  });

  it('tocar la tarjeta abre el detalle de la prescripción', async () => {
    lista([prescripcion()]);
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/pacientes/7?pestana=prescripciones', MEDICO);

    const tarjeta = within(
      await screen.findByRole('list', { name: 'Prescripciones' }),
    ).getAllByRole('listitem')[0]!;
    await userEvent.click(within(tarjeta).getByText(/Comprimidos 500/));

    expect(await screen.findByRole('heading', { name: /Paracetamol/ })).toBeInTheDocument();
    expect(await screen.findByLabelText(/^Dosis/)).toBeInTheDocument();
  });

  it('con teclado, la tarjeta es un botón con el nombre del medicamento que abre el detalle', async () => {
    lista([prescripcion()]);
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/pacientes/7?pestana=prescripciones', MEDICO);

    const abrir = await screen.findByRole('button', { name: /^Paracetamol 500\smg/ });
    abrir.focus();
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByLabelText(/^Dosis/)).toBeInTheDocument();
  });

  it('Administrar lleva a administrar esa prescripción, sin abrir el detalle ni ir dentro de otro botón', async () => {
    vi.stubEnv('VITE_BIOMETRIA_MODO', 'simulado');
    let detallesPedidos = 0;
    lista([prescripcion()]);
    servidor.use(
      http.get('*/api/pacientes', () => listaDePacientes([paciente()])),
      http.get('*/api/prescripciones/40', () => {
        detallesPedidos++;
        return HttpResponse.json({ data: prescripcion() });
      }),
    );
    renderizarApp('/pacientes/7?pestana=prescripciones', ENFERMERO);

    const tarjetas = await screen.findByRole('list', { name: 'Prescripciones' });
    const administrar = within(tarjetas).getByRole('button', { name: 'Administrar Paracetamol' });
    expect(administrar.parentElement?.closest('button, [role="button"]')).toBeNull();
    await userEvent.click(administrar);

    expect(
      await screen.findByRole('heading', { name: 'Administrar medicamento' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('region', { name: 'Revise antes de confirmar' }),
    ).toHaveTextContent(/Paracetamol 500\smg/);
    expect(detallesPedidos).toBe(0);
    vi.unstubAllEnvs();
  });

  it('el médico no ve Administrar, y una prescripción suspendida no muestra estado de la toma', async () => {
    lista([prescripcion(), prescripcion({ id: 41, estado: 'SUSPENDIDA', proximaToma: null })]);
    renderizarApp('/pacientes/7?pestana=prescripciones', MEDICO);

    const tarjetas = await screen.findByRole('list', { name: 'Prescripciones' });
    const items = within(tarjetas).getAllByRole('listitem');
    expect(within(tarjetas).queryByRole('button', { name: /Administrar/ })).not.toBeInTheDocument();
    expect(items[1]).toHaveTextContent('Suspendida');
    expect(items[1]).not.toHaveTextContent(/Sin más tomas|Atrasada|Faltan|Toca ahora/);
  });

  it('el enfermero no ve Administrar en una prescripción suspendida', async () => {
    lista([prescripcion({ estado: 'SUSPENDIDA', proximaToma: null })]);
    renderizarApp('/pacientes/7?pestana=prescripciones', ENFERMERO);

    const tarjetas = await screen.findByRole('list', { name: 'Prescripciones' });
    expect(within(tarjetas).queryByRole('button', { name: /Administrar/ })).not.toBeInTheDocument();
  });

  it('sin prescripciones vigentes lo dice', async () => {
    lista([]);
    renderizarApp('/pacientes/7?pestana=prescripciones', MEDICO);
    expect(await screen.findByText('El paciente no tiene prescripciones vigentes')).toBeVisible();
  });

  it('si la carga falla, deja reintentar y no dice que no hay prescripciones', async () => {
    servidor.use(http.get('*/api/pacientes/7/prescripciones', () => errorDelServidor()));
    renderizarApp('/pacientes/7?pestana=prescripciones', MEDICO);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudieron cargar las prescripciones/);
    expect(within(aviso).getByRole('button', { name: 'Reintentar' })).toBeVisible();
    expect(screen.queryByText(/no tiene prescripciones/i)).not.toBeInTheDocument();
  });
});

describe('administrar desde la lista de prescripciones', () => {
  it('cada vigente tiene Administrar, que abre la pantalla con paciente y prescripción elegidos', async () => {
    vi.stubEnv('VITE_BIOMETRIA_MODO', 'simulado');
    servidor.use(
      http.get('*/api/pacientes', () => listaDePacientes([paciente()])),
      http.get('*/api/pacientes/7/prescripciones', () =>
        HttpResponse.json({ data: [prescripcion()] }),
      ),
    );
    renderizarApp('/pacientes/7?pestana=prescripciones', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Prescripciones' });
    await userEvent.click(
      await within(tabla).findByRole('button', { name: 'Administrar Paracetamol' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Administrar medicamento' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('region', { name: 'Revise antes de confirmar' }),
    ).toHaveTextContent(/Paracetamol 500\smg/);
    vi.unstubAllEnvs();
  });

  it('el médico no ve Administrar', async () => {
    servidor.use(
      http.get('*/api/pacientes/7/prescripciones', () =>
        HttpResponse.json({ data: [prescripcion()] }),
      ),
    );
    renderizarApp('/pacientes/7?pestana=prescripciones', MEDICO);

    const tabla = await screen.findByRole('table', { name: 'Prescripciones' });
    await within(tabla).findByText('Paracetamol');
    expect(within(tabla).queryByRole('button', { name: /Administrar/ })).not.toBeInTheDocument();
  });
});
