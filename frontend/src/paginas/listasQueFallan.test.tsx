// F60 (UX-25): si una lista no carga, el selector dice por qué y deja reintentar ahí mismo, sin
// obligar a salir de la pantalla y volver a entrar (con lo que ya se cargó, perdido).
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO, MEDICO } from '../pruebas/datos';
import { CAMAS_LIBRES, paciente, simularCatalogosDePacientes } from '../pruebas/datosPacientes';
import {
  MEDICAMENTOS,
  prepararPrescripciones,
  restaurarPruebas,
} from '../pruebas/datosPrescripciones';
import { prepararSuministros } from '../pruebas/datosSuministros';
import { renderizarApp } from '../pruebas/renderizar';
import { servidor } from '../pruebas/servidor';

const errorInterno = () =>
  HttpResponse.json(
    { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' } },
    { status: 500 },
  );

const FALLA = /El servidor tuvo un problema\. Intente de nuevo en unos minutos/;

/** Responde con error hasta que la prueba llama a lo que devuelve: un servidor que se recupera. */
function servidorQueSeRecupera(ruta: string, respuestaBuena: () => Response) {
  let roto = true;
  servidor.use(http.get(ruta, () => (roto ? errorInterno() : respuestaBuena())));
  return () => {
    roto = false;
  };
}

describe('lista de pacientes (SelectorPaciente)', () => {
  beforeEach(prepararSuministros);
  afterEach(() => vi.unstubAllEnvs());

  it('con un error del servidor lo explica, deja Reintentar al lado y, al recuperarse, carga la lista', async () => {
    const arreglar = servidorQueSeRecupera('*/api/pacientes', () =>
      HttpResponse.json({
        data: [paciente()],
        meta: { pagina: 1, porPagina: 100, total: 1, totalPaginas: 1 },
      }),
    );
    renderizarApp('/suministros/medicamento', ENFERMERO);

    const selector = await screen.findByRole('combobox', { name: 'Paciente' });
    await waitFor(() => expect(selector).toHaveAccessibleDescription(FALLA));
    expect(selector).toHaveAccessibleDescription(/No se pudo cargar la lista de pacientes/);
    expect(selector).not.toHaveAccessibleDescription(/vuelva a entrar/);

    arreglar();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('option', { name: /Benítez, Rosa/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('combobox', { name: 'Paciente' })).not.toHaveAccessibleDescription(
      /No se pudo/,
    );
  });

  it('sin conexión dice la causa que corresponde (no culpa al servidor)', async () => {
    servidor.use(http.get('*/api/pacientes', () => HttpResponse.error()));
    renderizarApp('/suministros/insumos', ENFERMERO);

    const selector = await screen.findByRole('combobox', { name: 'Paciente' });
    await waitFor(() =>
      expect(selector).toHaveAccessibleDescription(/No hay conexión con el servidor/),
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('lista de medicamentos (CargaPrescripcion)', () => {
  beforeEach(prepararPrescripciones);
  afterEach(restaurarPruebas);

  it('con un error del servidor lo explica y Reintentar recupera la lista', async () => {
    const arreglar = servidorQueSeRecupera('*/api/insumos', () =>
      HttpResponse.json({ data: MEDICAMENTOS }),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    const selector = await screen.findByLabelText(/^Medicamento/);
    await waitFor(() => expect(selector).toHaveAccessibleDescription(FALLA));
    expect(selector).toHaveAccessibleDescription(/No se pudo cargar la lista de medicamentos/);

    arreglar();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('option', { name: /Paracetamol/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument(),
    );
  });

  it('reintentar no borra lo que ya se había cargado en el formulario', async () => {
    const arreglar = servidorQueSeRecupera('*/api/insumos', () =>
      HttpResponse.json({ data: MEDICAMENTOS }),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await userEvent.type(await screen.findByLabelText(/^Dosis/), '500');
    await screen.findByRole('button', { name: 'Reintentar' });
    arreglar();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await screen.findByRole('option', { name: /Paracetamol/ });
    expect(screen.getByLabelText(/^Dosis/)).toHaveValue(500);
  });
});

describe('lista de camas (RegistroPaciente)', () => {
  beforeEach(simularCatalogosDePacientes);

  it('con un error del servidor lo explica y Reintentar recupera las camas libres', async () => {
    const arreglar = servidorQueSeRecupera('*/api/camas', () =>
      HttpResponse.json({ data: CAMAS_LIBRES }),
    );
    renderizarApp('/pacientes/nuevo', MEDICO);

    const selector = await screen.findByLabelText(/^Cama/);
    await waitFor(() => expect(selector).toHaveAccessibleDescription(FALLA));
    expect(selector).toHaveAccessibleDescription(/No se pudo cargar la lista de camas/);

    arreglar();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('option', { name: /A-02/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument(),
    );
  });
});
