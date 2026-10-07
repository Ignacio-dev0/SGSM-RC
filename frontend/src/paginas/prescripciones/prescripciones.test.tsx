import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Insumo, Prescripcion } from '../../api/tipos';
import { ENFERMERO, MEDICO } from '../../pruebas/datos';
import {
  listaDePacientes,
  paciente,
  simularCatalogosDePacientes,
} from '../../pruebas/datosPacientes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';
import { estadoToma, textoEstadoToma } from '../suministros/estadoToma';

const MEDICAMENTOS: Insumo[] = [
  {
    id: 1,
    nombre: 'Paracetamol',
    tipo: 'MEDICAMENTO',
    unidadMedida: 'mg',
    presentacion: 'Comprimidos 500 mg',
    activo: true,
  },
  {
    id: 2,
    nombre: 'Enalapril',
    tipo: 'MEDICAMENTO',
    unidadMedida: 'mg',
    presentacion: 'Comprimidos 10 mg',
    activo: true,
  },
];

const prescripcion = (extra: Partial<Prescripcion> = {}): Prescripcion => ({
  id: 40,
  pacienteId: 7,
  medicamento: {
    id: 1,
    nombre: 'Paracetamol',
    presentacion: 'Comprimidos 500 mg',
    unidadMedida: 'mg',
  },
  dosis: 500,
  unidadDosis: 'mg',
  frecuenciaHoras: 8,
  via: 'ORAL',
  fechaInicio: '2026-10-07T11:00:00.000Z',
  fechaFin: null,
  observaciones: 'Si fiebre',
  estado: 'VIGENTE',
  motivoCambioEstado: null,
  prescriptor: 'Ferreyra, Martín',
  creadoEn: '2026-10-07T11:00:00.000Z',
  proximaToma: '2026-10-07T19:00:00.000Z',
  ultimasAdministraciones: [
    { id: 3, fechaHora: '2026-10-07T11:05:00.000Z', cantidad: 500, usuario: 'Acosta, Sofía' },
  ],
  agenda: ['2026-10-07T19:00:00.000Z', '2026-10-08T03:00:00.000Z', '2026-10-08T11:00:00.000Z'],
  ...extra,
});

/** 15:00 en Argentina del 7/10: las 19:00 UTC de la prescripción de ejemplo son "hoy 16:00". */
const AHORA = '2026-10-07T18:00:00.000Z';

/** Fija "ahora" sin frenar los temporizadores: userEvent y MSW siguen funcionando. */
function fijarAhora(iso = AHORA) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

/** jsdom no evalúa media queries: simula una pantalla de menos de md (900 px). */
const matchMediaOriginal = window.matchMedia;
function simularPantallaAngosta() {
  window.matchMedia = ((consulta: string) => ({
    matches: consulta.includes('899.95'),
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

const errorDelServidor = () =>
  HttpResponse.json(
    { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
    { status: 500 },
  );

beforeEach(() => {
  simularCatalogosDePacientes();
  servidor.use(
    http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    http.get('*/api/insumos', () => HttpResponse.json({ data: MEDICAMENTOS })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  window.matchMedia = matchMediaOriginal;
});

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

describe('carga de prescripción (T304 · CU17)', () => {
  async function completar() {
    // No se puede guardar hasta ver a qué paciente se le indica (UX-06).
    await screen.findByRole('region', { name: 'Paciente' });
    await screen.findByRole('option', { name: /Paracetamol/ });
    await userEvent.selectOptions(
      screen.getByLabelText(/^Medicamento/),
      screen.getByRole('option', { name: /Paracetamol/ }),
    );
    await userEvent.type(screen.getByLabelText(/^Dosis/), '500');
    await userEvent.selectOptions(screen.getByLabelText(/^Frecuencia/), 'Cada 8 horas');
    await userEvent.selectOptions(screen.getByLabelText(/^Vía/), 'Oral');
  }

  it('carga la prescripción con la unidad del medicamento y muestra los horarios', async () => {
    let enviado: Record<string, unknown> | undefined;
    servidor.use(
      http.post('*/api/pacientes/7/prescripciones', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: prescripcion() }, { status: 201 });
      }),
      http.get('*/api/pacientes/7/prescripciones', () =>
        HttpResponse.json({ data: [prescripcion()] }),
      ),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await completar();
    expect(screen.getByLabelText(/^Unidad/)).toHaveValue('mg');
    expect(screen.getByText(/Primeras tomas/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar prescripción' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Prescripción cargada/);
    expect(enviado).toMatchObject({
      insumoId: 1,
      dosis: 500,
      unidadDosis: 'mg',
      frecuenciaHoras: 8,
      via: 'ORAL',
      fechaInicio: expect.any(String),
    });
  });

  it('identifica al paciente para el que se carga la prescripción', async () => {
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    const ficha = await screen.findByRole('region', { name: 'Paciente' });
    expect(ficha).toHaveTextContent('Benítez, Rosa');
    expect(ficha).toHaveTextContent('DNI 30111222');
    expect(ficha).toHaveTextContent('Cama A-01');
  });

  it('valida la dosis al salir del campo y los datos obligatorios al guardar', async () => {
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await screen.findByRole('region', { name: 'Paciente' });
    const dosis = await screen.findByLabelText(/^Dosis/);
    await userEvent.type(dosis, '0');
    // Mientras escribe no se avisa: el "0" de "0,5" todavía no es un error (UX-20b).
    expect(dosis).not.toHaveAttribute('aria-invalid', 'true');
    // Al salir del campo, un 0 sí se avisa.
    await userEvent.tab();
    expect(dosis).toHaveAccessibleDescription('La dosis debe ser mayor a 0');

    await userEvent.click(screen.getByRole('button', { name: 'Guardar prescripción' }));
    // Al guardar, el aviso de la dosis sigue y se suman los datos que faltan.
    expect(dosis).toHaveAccessibleDescription('La dosis debe ser mayor a 0');
    expect(screen.getByLabelText(/^Medicamento/)).toHaveAccessibleDescription(
      'Elija el medicamento',
    );
    expect(screen.getByLabelText(/^Vía/)).toHaveAccessibleDescription('Elija la vía');
    // El foco va al primer campo con error, para corregirlo sin buscarlo.
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-invalid', 'true'));
  });

  it('escribir 0,5 no avisa error a mitad de camino, y el aviso de un 0 se va al corregirlo', async () => {
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    const dosis = await screen.findByLabelText(/^Dosis/);
    await userEvent.type(dosis, '0');
    expect(dosis).not.toHaveAccessibleDescription();
    await userEvent.type(dosis, '.5');
    await userEvent.tab();
    expect(dosis).toHaveValue(0.5);
    expect(dosis).not.toHaveAttribute('aria-invalid', 'true');

    // Un 0 avisado al salir se limpia apenas se vuelve a escribir.
    await userEvent.clear(dosis);
    await userEvent.type(dosis, '0');
    await userEvent.tab();
    expect(dosis).toHaveAccessibleDescription('La dosis debe ser mayor a 0');
    await userEvent.type(dosis, '.5');
    expect(dosis).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('guardar con un 0 recién escrito (sin salir del campo) también lo avisa', async () => {
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await screen.findByRole('region', { name: 'Paciente' });
    await userEvent.type(await screen.findByLabelText(/^Dosis/), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar prescripción' }));

    expect(screen.getByLabelText(/^Dosis/)).toHaveAccessibleDescription(
      'La dosis debe ser mayor a 0',
    );
  });

  it('no deja guardar sin ver al paciente y lo dice junto al botón (UX-06)', async () => {
    let liberar!: () => void;
    const llega = new Promise<void>((resolver) => (liberar = resolver));
    servidor.use(
      http.get('*/api/pacientes/7', async () => {
        await llega;
        return HttpResponse.json({ data: paciente() });
      }),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    expect(await screen.findByText('Cargando los datos del paciente…')).toBeInTheDocument();
    const guardar = screen.getByRole('button', { name: 'Guardar prescripción' });
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAccessibleDescription('Esperando los datos del paciente…');
    expect(screen.getByText('Esperando los datos del paciente…')).toBeVisible();

    liberar();
    expect(await screen.findByRole('region', { name: 'Paciente' })).toHaveTextContent(
      'Benítez, Rosa',
    );
    expect(screen.queryByText('Cargando los datos del paciente…')).not.toBeInTheDocument();
    expect(guardar).toBeEnabled();
    expect(guardar).not.toHaveAccessibleDescription();
  });

  it('si no se puede cargar al paciente lo dice, deja reintentar y no deja guardar (UX-06)', async () => {
    let fallar = true;
    servidor.use(
      http.get('*/api/pacientes/7', () =>
        fallar ? errorDelServidor() : HttpResponse.json({ data: paciente() }),
      ),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudieron cargar los datos del paciente/);
    const guardar = screen.getByRole('button', { name: 'Guardar prescripción' });
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAccessibleDescription(/sin los datos del paciente/i);

    fallar = false;
    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Paciente' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(guardar).toBeEnabled();
  });

  it('T307: avisa si ya hay una vigente del mismo medicamento y permite cargarla igual', async () => {
    const envios: Record<string, unknown>[] = [];
    servidor.use(
      http.post('*/api/pacientes/7/prescripciones', async ({ request }) => {
        const cuerpo = (await request.json()) as Record<string, unknown>;
        envios.push(cuerpo);
        if (!cuerpo.confirmarDuplicada) {
          return HttpResponse.json(
            {
              error: {
                codigo: 'PRESCRIPCION_DUPLICADA',
                mensaje: 'El paciente ya tiene una prescripción vigente de Paracetamol',
                detalles: {
                  prescripciones: [
                    { id: 40, dosis: 1000, unidadDosis: 'mg', frecuenciaHoras: 6, via: 'ORAL' },
                  ],
                },
              },
            },
            { status: 409 },
          );
        }
        return HttpResponse.json({ data: prescripcion() }, { status: 201 });
      }),
      http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await completar();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar prescripción' }));
    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/ya tiene una prescripción vigente/);
    expect(aviso).toHaveTextContent(/1000 mg cada 6 h/);

    await userEvent.click(within(aviso).getByRole('button', { name: 'Cargar igual' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Prescripción cargada/);
    expect(envios.at(-1)).toMatchObject({ confirmarDuplicada: true });
  });
});

describe('modificación de prescripción (T306 · CU19)', () => {
  it('cambia la dosis pidiendo el motivo', async () => {
    let enviado: Record<string, unknown> | undefined;
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
      http.patch('*/api/prescripciones/40', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: prescripcion({ dosis: 1000 }) });
      }),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    await screen.findByRole('region', { name: 'Paciente' });
    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    await userEvent.clear(dosis);
    await userEvent.type(dosis, '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const dialogo = screen.getByRole('dialog', { name: /Guardar cambios/ });
    await userEvent.type(within(dialogo).getByLabelText(/Motivo del cambio/), 'Dolor persistente');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/guardaron/);
    expect(enviado).toMatchObject({ dosis: 1000, motivo: 'Dolor persistente' });
  });

  it('si la prescripción no se puede cargar lo dice y deja reintentar', async () => {
    let fallar = true;
    servidor.use(
      http.get('*/api/prescripciones/40', () =>
        fallar
          ? HttpResponse.json(
              { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
              { status: 500 },
            )
          : HttpResponse.json({ data: prescripcion() }),
      ),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo cargar la prescripción/);
    fallar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: /Paracetamol/ })).toBeInTheDocument();
  });

  it('si no se pueden cargar los medicamentos, el selector lo dice', async () => {
    servidor.use(
      http.get('*/api/insumos', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 500 },
        ),
      ),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await waitFor(() =>
      expect(screen.getByLabelText(/^Medicamento/)).toHaveAccessibleDescription(
        /No se pudo cargar la lista de medicamentos/,
      ),
    );
  });

  it('muestra de qué paciente es la prescripción', async () => {
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    const ficha = await screen.findByRole('region', { name: 'Paciente' });
    expect(ficha).toHaveTextContent('Benítez, Rosa');
    expect(ficha).toHaveTextContent('DNI 30111222');
    expect(ficha).toHaveTextContent('Cama A-01');
  });

  it('al guardar muestra el paciente y qué cambia, antes y después', async () => {
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    await screen.findByRole('region', { name: 'Paciente' });
    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    await userEvent.clear(dosis);
    await userEvent.type(dosis, '1000');
    await userEvent.selectOptions(screen.getByLabelText('Frecuencia'), 'Cada 12 horas');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const dialogo = screen.getByRole('dialog', { name: /Guardar cambios/ });
    expect(dialogo).toHaveTextContent(/Benítez, Rosa.*Cama A-01/);
    const tabla = within(dialogo).getByRole('table', { name: 'Cambios' });
    const filas = within(tabla).getAllByRole('row');
    expect(filas).toHaveLength(3);
    expect(filas[1]).toHaveTextContent(/Dosis\s*500 mg\s*1000 mg/);
    expect(filas[2]).toHaveTextContent(/Frecuencia\s*cada 8 h\s*cada 12 h/);
  });

  it('suspender (se puede reanudar) no se ve tan grave como finalizar (no se puede)', async () => {
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    const suspender = await screen.findByRole('button', { name: 'Suspender' });
    const finalizar = screen.getByRole('button', { name: 'Finalizar' });
    expect(suspender).not.toHaveClass('MuiButton-colorError');
    expect(finalizar).toHaveClass('MuiButton-colorError');
  });

  it('al suspender nombra el medicamento y el paciente', async () => {
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Suspender' }));
    const dialogo = screen.getByRole('dialog', { name: /Suspender/ });
    expect(dialogo).toHaveTextContent(/Paracetamol 500 mg cada 8 h de Benítez, Rosa \(cama A-01\)/);
  });

  it('suspende la prescripción con motivo', async () => {
    let enviado: unknown;
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
      http.post('*/api/prescripciones/40/estado', async ({ request }) => {
        enviado = await request.json();
        return HttpResponse.json({
          data: prescripcion({
            estado: 'SUSPENDIDA',
            proximaToma: null,
            motivoCambioEstado: 'Hipotensión',
          }),
        });
      }),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Suspender' }));
    const dialogo = screen.getByRole('dialog', { name: /Suspender/ });
    await userEvent.type(within(dialogo).getByLabelText(/Motivo/), 'Hipotensión');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Suspender' }));

    expect(await screen.findByText('Suspendida')).toBeInTheDocument();
    expect(enviado).toEqual({ estado: 'SUSPENDIDA', motivo: 'Hipotensión' });
  });

  it('el enfermero ve la prescripción y su agenda pero no puede modificarla', async () => {
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', ENFERMERO);

    expect(await screen.findByRole('heading', { name: /Paracetamol/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Próximas tomas' }).children).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  });

  it('Guardar cambios deshabilitado dice por qué: sin cambios o dosis inválida (UX-17)', async () => {
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    await screen.findByRole('region', { name: 'Paciente' });
    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAccessibleDescription('No hay cambios para guardar');
    expect(screen.getByText('No hay cambios para guardar')).toBeVisible();

    await userEvent.clear(dosis);
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAccessibleDescription('Revise la dosis');

    await userEvent.type(dosis, '1000');
    expect(guardar).toBeEnabled();
    expect(guardar).not.toHaveAccessibleDescription();
    expect(screen.queryByText('Revise la dosis')).not.toBeInTheDocument();
  });

  it('no deja guardar cambios sin ver al paciente y lo dice junto al botón (UX-06)', async () => {
    let liberar!: () => void;
    const llega = new Promise<void>((resolver) => (liberar = resolver));
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
      http.get('*/api/pacientes/7', async () => {
        await llega;
        return HttpResponse.json({ data: paciente() });
      }),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    expect(await screen.findByText('Cargando los datos del paciente…')).toBeInTheDocument();
    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    await userEvent.clear(dosis);
    await userEvent.type(dosis, '1000');
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAccessibleDescription('Esperando los datos del paciente…');

    liberar();
    await screen.findByRole('region', { name: 'Paciente' });
    expect(screen.queryByText('Cargando los datos del paciente…')).not.toBeInTheDocument();
    expect(guardar).toBeEnabled();
    expect(guardar).not.toHaveAccessibleDescription();
  });

  it('si no se puede cargar al paciente lo dice y deja reintentar, sin guardar a ciegas (UX-06)', async () => {
    let fallar = true;
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
      http.get('*/api/pacientes/7', () =>
        fallar ? errorDelServidor() : HttpResponse.json({ data: paciente() }),
      ),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudieron cargar los datos del paciente/);
    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    await userEvent.clear(dosis);
    await userEvent.type(dosis, '1000');
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAccessibleDescription(/sin los datos del paciente/i);

    fallar = false;
    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Paciente' })).toBeInTheDocument();
    expect(guardar).toBeEnabled();
  });
});
