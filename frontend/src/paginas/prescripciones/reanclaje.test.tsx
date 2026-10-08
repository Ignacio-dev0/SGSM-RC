// Reanudar y cambiar la frecuencia re-anclan la agenda (C5 · F6): qué se explica y qué se renueva.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { Prescripcion } from '../../api/tipos';
import { MEDICO } from '../../pruebas/datos';
import {
  fijarAhora,
  prepararPrescripciones,
  prescripcion,
  restaurarPruebas,
} from '../../pruebas/datosPrescripciones';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';
import { formatearHora } from '../../utilidades/formato';

beforeEach(prepararPrescripciones);
afterEach(restaurarPruebas);

const NBSP = String.fromCharCode(160);

/**
 * El detalle que devuelve el servidor: `actual()` dice cuál es en cada pedido. Cuenta los pedidos
 * del detalle y de los recordatorios (la insignia del menú los tiene a la vista).
 */
function simularDetalle(actual: () => Prescripcion) {
  const pedidos = { detalle: 0, recordatorios: 0 };
  servidor.use(
    http.get('*/api/prescripciones/40', () => {
      pedidos.detalle += 1;
      return HttpResponse.json({ data: actual() });
    }),
    http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [actual()] })),
    http.get('*/api/recordatorios', () => {
      pedidos.recordatorios += 1;
      return HttpResponse.json({ data: [], meta: { total: 0 } });
    }),
  );
  return pedidos;
}

/**
 * Lo que otras pantallas ya tenían del paciente (sus prescripciones, la lista de Administrar y
 * el historial), con las mismas claves que usan. No están a la vista: al guardar quedan
 * invalidadas y se vuelven a pedir al abrirlas.
 */
const CONSULTAS_DEL_PACIENTE = [
  ['prescripciones', 7, 'VIGENTE'],
  ['prescripciones', 7, ''],
  ['historial', 7, { desde: '', hasta: '' }],
];

function cargarConsultasDelPaciente(cliente: QueryClient) {
  for (const clave of CONSULTAS_DEL_PACIENTE) cliente.setQueryData(clave, []);
}

const invalidadas = (cliente: QueryClient) =>
  CONSULTAS_DEL_PACIENTE.map((clave) => cliente.getQueryState(clave)?.isInvalidated);

const tomas = () =>
  within(screen.getByRole('list', { name: 'Próximas tomas' }))
    .getAllByRole('listitem')
    .map((t) => t.textContent);

describe('reanudar (C5 · F6)', () => {
  const suspendida = prescripcion({
    estado: 'SUSPENDIDA',
    proximaToma: null,
    agenda: [],
    motivoCambioEstado: 'Hipotensión',
  });
  const reanudada = prescripcion({
    proximaToma: '2026-10-07T18:00:00.000Z',
    agendaDesde: '2026-10-07T18:00:00.000Z',
    agenda: ['2026-10-07T18:00:00.000Z', '2026-10-08T02:00:00.000Z', '2026-10-08T10:00:00.000Z'],
  });

  it('el diálogo explica que las tomas vuelven a empezar desde ahora, con la frecuencia', async () => {
    simularDetalle(() => suspendida);
    renderizarApp('/prescripciones/40', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Reanudar' }));
    const dialogo = screen.getByRole('dialog', { name: /Reanudar/ });
    // Con el espacio que no separa el número de la unidad (toHaveTextContent lo normaliza).
    expect(dialogo.textContent).toContain(
      `Las tomas vuelven a empezar desde ahora, cada 8${NBSP}h.`,
    );
  });

  it('si el tratamiento todavía no empezó, dice que empiezan en su inicio (el servidor no lo adelanta)', async () => {
    fijarAhora('2026-10-07T18:00:00.000Z');
    // Empieza mañana a las 08:00 de Argentina.
    simularDetalle(() => ({ ...suspendida, fechaInicio: '2026-10-08T11:00:00.000Z' }));
    renderizarApp('/prescripciones/40', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Reanudar' }));
    const dialogo = screen.getByRole('dialog', { name: /Reanudar/ });
    expect(dialogo.textContent).toContain(
      `Las tomas empiezan en el inicio del tratamiento (08/10 08:00), cada 8${NBSP}h.`,
    );
    expect(dialogo).not.toHaveTextContent(/desde ahora/);
  });

  it('al reanudar, la agenda y la lista del paciente se renuevan sin recargar', async () => {
    let actual = suspendida;
    const pedidos = simularDetalle(() => actual);
    servidor.use(
      http.post('*/api/prescripciones/40/estado', () => {
        actual = reanudada;
        // Como el PATCH, la respuesta del cambio no trae la agenda.
        return HttpResponse.json({ data: { ...reanudada, agenda: undefined } });
      }),
    );
    const { cliente } = renderizarApp('/prescripciones/40', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Reanudar' }));
    await waitFor(() => expect(pedidos.recordatorios).toBeGreaterThan(0));
    cargarConsultasDelPaciente(cliente);
    const antes = { ...pedidos };
    const dialogo = screen.getByRole('dialog', { name: /Reanudar/ });
    await userEvent.type(within(dialogo).getByLabelText(/Motivo/), 'Mejoró la presión');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Reanudar' }));

    await waitFor(() => expect(pedidos.detalle).toBeGreaterThan(antes.detalle));
    // Los recordatorios (a la vista en la insignia) se vuelven a pedir; el resto queda invalidado.
    await waitFor(() => expect(pedidos.recordatorios).toBeGreaterThan(antes.recordatorios));
    expect(invalidadas(cliente)).toEqual([true, true, true]);
    await waitFor(() =>
      expect(tomas()).toEqual(
        reanudada.agenda!.map((t) => expect.stringContaining(formatearHora(t))),
      ),
    );
    expect(screen.queryByText('No hay tomas programadas.')).not.toBeInTheDocument();
  });
});

describe('cambiar la frecuencia (C5 · F6)', () => {
  /** Elige otra frecuencia, pone el motivo y abre la confirmación. */
  async function cambiarA(frecuencia: string) {
    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    await userEvent.selectOptions(screen.getByLabelText('Frecuencia'), frecuencia);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    return screen.getByRole('dialog', { name: /Guardar cambios/ });
  }

  /** Una dosis dada a las `fechaHora` (UTC) y atribuida a la toma `toma`. */
  const dosis = (fechaHora: string, toma: string) => ({
    id: 3,
    fechaHora,
    tomaProgramada: toma,
    cantidad: 500,
    usuario: 'Acosta, Sofía',
  });

  it('con una dosis dada en la agenda vigente, explica que la próxima toma se cuenta desde ella', async () => {
    fijarAhora('2026-10-07T18:00:00.000Z');
    // Tomas a las 11:00 y 19:00 UTC: se dio la de las 11:00 y la de las 19:00 todavía no llegó.
    simularDetalle(() =>
      prescripcion({
        ultimasAdministraciones: [dosis('2026-10-07T11:05:00.000Z', '2026-10-07T11:00:00.000Z')],
      }),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    const dialogo = await cambiarA('Cada 12 horas');
    expect(dialogo).toHaveTextContent('La próxima toma se cuenta desde la última dosis dada.');
  });

  it('sin dosis dadas, desde ahora', async () => {
    fijarAhora('2026-10-07T18:00:00.000Z');
    simularDetalle(() => prescripcion({ ultimasAdministraciones: [] }));
    renderizarApp('/prescripciones/40', MEDICO);

    const dialogo = await cambiarA('Cada 12 horas');
    expect(dialogo).toHaveTextContent('La próxima toma se cuenta desde ahora.');
  });

  it('después de reanudar, una dosis de antes de suspender no cuenta: desde ahora (D122)', async () => {
    // Se reanudó a las 15:00 (UTC); la última dosis es de las 06:00, de antes de suspender.
    fijarAhora('2026-10-07T15:30:00.000Z');
    simularDetalle(() =>
      prescripcion({
        agendaDesde: '2026-10-07T15:00:00.000Z',
        ultimasAdministraciones: [dosis('2026-10-07T06:00:00.000Z', '2026-10-07T03:00:00.000Z')],
      }),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    const dialogo = await cambiarA('Cada 12 horas');
    expect(dialogo).toHaveTextContent('La próxima toma se cuenta desde ahora.');
    expect(dialogo).not.toHaveTextContent(/última dosis/);
  });

  it('si después de la última dosis quedó una toma sin dar, desde ahora (D122)', async () => {
    // Se dio la de las 03:00 (UTC), no la de las 11:00; son las 12:00.
    fijarAhora('2026-10-07T12:00:00.000Z');
    simularDetalle(() =>
      prescripcion({
        fechaInicio: '2026-10-06T19:00:00.000Z',
        agendaDesde: '2026-10-06T19:00:00.000Z',
        ultimasAdministraciones: [dosis('2026-10-07T03:05:00.000Z', '2026-10-07T03:00:00.000Z')],
      }),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    const dialogo = await cambiarA('Cada 12 horas');
    expect(dialogo).toHaveTextContent('La próxima toma se cuenta desde ahora.');
  });

  it('si el tratamiento todavía no empezó, desde su inicio', async () => {
    fijarAhora('2026-10-07T18:00:00.000Z');
    simularDetalle(() =>
      prescripcion({
        fechaInicio: '2026-10-08T11:00:00.000Z',
        agendaDesde: '2026-10-08T11:00:00.000Z',
        ultimasAdministraciones: [],
      }),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    const dialogo = await cambiarA('Cada 12 horas');
    expect(dialogo).toHaveTextContent(
      'La próxima toma se cuenta desde el inicio del tratamiento (08/10 08:00).',
    );
  });

  it('cambiar otra cosa (la dosis) no habla de la próxima toma', async () => {
    simularDetalle(() => prescripcion());
    renderizarApp('/prescripciones/40', MEDICO);

    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    await userEvent.clear(dosis);
    await userEvent.type(dosis, '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const dialogo = screen.getByRole('dialog', { name: /Guardar cambios/ });
    expect(dialogo).not.toHaveTextContent(/próxima toma se cuenta/);
  });

  it('al guardar, el detalle y la agenda nueva se ven sin recargar', async () => {
    const nueva = prescripcion({
      frecuenciaHoras: 12,
      agendaDesde: '2026-10-07T11:05:00.000Z',
      proximaToma: '2026-10-07T23:05:00.000Z',
      agenda: ['2026-10-07T23:05:00.000Z', '2026-10-08T11:05:00.000Z'],
    });
    let actual = prescripcion();
    const pedidos = simularDetalle(() => actual);
    servidor.use(
      http.patch('*/api/prescripciones/40', () => {
        actual = nueva;
        return HttpResponse.json({ data: { ...nueva, agenda: undefined } });
      }),
    );
    const { cliente } = renderizarApp('/prescripciones/40', MEDICO);

    const dialogo = await cambiarA('Cada 12 horas');
    await waitFor(() => expect(pedidos.recordatorios).toBeGreaterThan(0));
    cargarConsultasDelPaciente(cliente);
    const antes = { ...pedidos };
    await userEvent.type(within(dialogo).getByLabelText(/Motivo/), 'Ajuste de dosis nocturna');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Los cambios se guardaron')).toBeInTheDocument();
    await waitFor(() => expect(pedidos.detalle).toBeGreaterThan(antes.detalle));
    await waitFor(() => expect(pedidos.recordatorios).toBeGreaterThan(antes.recordatorios));
    expect(invalidadas(cliente)).toEqual([true, true, true]);
    await waitFor(() => expect(tomas()).toHaveLength(2));
    expect(tomas()).toEqual(nueva.agenda!.map((t) => expect.stringContaining(formatearHora(t))));
  });
});
