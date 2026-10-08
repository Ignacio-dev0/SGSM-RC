// F3: la cama nunca se parte ("A-" y "01") en los diálogos que la nombran: usan formatearCama.
import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ProveedorSesion } from '../auth/ContextoSesion';
import { ENFERMERO, MEDICO } from '../pruebas/datos';
import { HISTORIAL, paciente, simularCatalogosDePacientes } from '../pruebas/datosPacientes';
import { prepararPrescripciones, prescripcion } from '../pruebas/datosPrescripciones';
import { prepararSuministros, suministro, validarRostro } from '../pruebas/datosSuministros';
import { renderizarApp, simularSesion } from '../pruebas/renderizar';
import { servidor } from '../pruebas/servidor';
import { tema } from '../tema';
import { nombreConCama } from './prescripciones/edicionPrescripcion';
import { DialogoSuministro } from './suministros/DialogoSuministro';

/** "A-01" con el guion que no permite cortar el renglón (U+2011). */
const A01 = `A${String.fromCharCode(0x2011)}01`;
const B01 = `B${String.fromCharCode(0x2011)}01`;

/** El texto nombra la cama sin cortes y nunca con el guion común. */
function nombraLaCamaSinCortes(elemento: HTMLElement, esperado: string | RegExp, cama = 'A-01') {
  expect(elemento).toHaveTextContent(esperado);
  expect(elemento.textContent).not.toContain(cama);
}

afterEach(() => vi.unstubAllEnvs());

describe('la cama no se parte en los diálogos (F3)', () => {
  it('nombreConCama la escribe con el guion que no corta', () => {
    expect(nombreConCama(paciente())).toBe(`Benítez, Rosa (cama ${A01})`);
  });

  it('suspender una prescripción', async () => {
    prepararPrescripciones();
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Suspender' }));
    const dialogo = screen.getByRole('dialog', { name: /Suspender/ });
    await waitFor(() => nombraLaCamaSinCortes(dialogo, `Benítez, Rosa (cama ${A01})`));
  });

  it('guardar cambios en una prescripción', async () => {
    prepararPrescripciones();
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    await userEvent.clear(dosis);
    await userEvent.type(dosis, '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const dialogo = screen.getByRole('dialog', { name: /Guardar cambios/ });
    await waitFor(() => nombraLaCamaSinCortes(dialogo, `Cama ${A01}`));
  });

  it('dar de alta y trasladar', async () => {
    prepararPrescripciones();
    servidor.use(
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
      http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
    );
    renderizarApp('/pacientes/7', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Dar de alta' }));
    const alta = screen.getByRole('dialog', { name: /Dar de alta/ });
    nombraLaCamaSinCortes(alta, `cama ${A01}`);
    await userEvent.click(within(alta).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Trasladar' }));
    const traslado = screen.getByRole('dialog', { name: /Trasladar/ });
    nombraLaCamaSinCortes(traslado, `Cama actual: Sala A – Neurorrehabilitación · ${A01}`);
  });

  it('corregir un suministro (también lo que se ve junto a la cámara)', async () => {
    prepararSuministros();
    validarRostro();
    simularSesion(ENFERMERO);
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={cliente}>
        <ThemeProvider theme={tema}>
          <ProveedorSesion>
            <DialogoSuministro inicial={suministro()} alCerrar={() => {}} />
          </ProveedorSesion>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    const dialogo = screen.getByRole('dialog', { name: /Suministro/ });
    nombraLaCamaSinCortes(dialogo, `Cama ${A01}`);
    await userEvent.click(await within(dialogo).findByRole('button', { name: 'Corregir' }));
    await userEvent.type(
      within(dialogo).getByLabelText(/Motivo de la corrección/),
      'Error de carga',
    );
    await userEvent.click(
      within(dialogo).getByRole('button', { name: 'Confirmar corrección con mi rostro' }),
    );
    const rostro = await screen.findByRole('dialog', { name: /Confirmar con su rostro/ });
    nombraLaCamaSinCortes(rostro, `Cama ${A01}`);
  });

  it('registrar insumos: lo que se ve junto a la cámara', async () => {
    prepararSuministros();
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    const rostro = await screen.findByRole('dialog', { name: /Confirmar con su rostro/ });
    nombraLaCamaSinCortes(rostro, `Cama ${A01}`);
  });

  it('el aviso después de trasladar', async () => {
    prepararPrescripciones();
    let actual = paciente();
    servidor.use(
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: actual })),
      http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
      http.post('*/api/pacientes/7/trasladar', () => {
        actual = paciente({
          cama: {
            id: 9,
            numero: 'B-01',
            sala: { id: 2, nombre: 'Sala B – Traumatología' },
            desde: '2026-10-07T18:00:00.000Z',
          },
        });
        return HttpResponse.json({ data: actual });
      }),
    );
    renderizarApp('/pacientes/7', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Trasladar' }));
    const dialogo = screen.getByRole('dialog', { name: /Trasladar/ });
    await userEvent.selectOptions(
      within(dialogo).getByLabelText(/Cama nueva/),
      await within(dialogo).findByRole('option', { name: /B-01/ }),
    );
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Trasladar' }));

    nombraLaCamaSinCortes(
      await screen.findByRole('status'),
      `Paciente trasladado a la cama ${B01} (Sala B – Traumatología)`,
      'B-01',
    );
  });

  it('el aviso después de internar o reingresar', async () => {
    simularCatalogosDePacientes();
    const egresada = paciente({ estado: 'EGRESADO', cama: null, motivoEgreso: 'Alta médica' });
    let actual = egresada;
    servidor.use(
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: actual })),
      http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
      http.get('*/api/pacientes/7/estudios', () => HttpResponse.json({ data: [] })),
      http.post('*/api/pacientes/7/reingresar', () => {
        actual = paciente();
        return HttpResponse.json({ data: actual });
      }),
    );
    renderizarApp('/pacientes/nuevo?reingreso=7', MEDICO);

    await userEvent.selectOptions(
      await screen.findByLabelText(/^Cama/),
      await screen.findByRole('option', { name: /A-02/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Registrar reingreso' }));

    nombraLaCamaSinCortes(
      await screen.findByText(/^Reingreso registrado/),
      `Reingreso registrado en la cama ${A01} (Sala A – Neurorrehabilitación)`,
    );
  });

  it('el traslado en las modificaciones del historial (la cama como la guardó la auditoría)', async () => {
    prepararPrescripciones();
    servidor.use(
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
      http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
      http.get('*/api/pacientes/7/historial', () =>
        HttpResponse.json({
          data: {
            ...HISTORIAL,
            modificaciones: [
              {
                id: 1,
                fechaHora: '2026-10-03T14:00:00.000Z',
                accion: 'TRASLADAR',
                entidad: 'Paciente',
                usuario: 'Ferreyra, Martín',
                valorAnterior: { cama: 'Sala B – Traumatología · B-01' },
                valorNuevo: { cama: 'Sala A – Neurorrehabilitación · A-01' },
                detalle: null,
              },
            ],
          },
        }),
      ),
    );
    renderizarApp('/pacientes/7?pestana=historial', ENFERMERO);
    await userEvent.click(await screen.findByRole('tab', { name: /^Modificaciones/ }));
    const tabla = await screen.findByRole('table', { name: 'Modificaciones' });

    const fila = within(tabla).getAllByRole('row')[1]!;
    nombraLaCamaSinCortes(fila, `Cama: Sala B – Traumatología · ${B01} → Sala A`, 'B-01');
    expect(fila.textContent).not.toContain('A-01');
  });

  it('el aviso de administración registrada', async () => {
    prepararSuministros();
    validarRostro();
    servidor.use(
      http.post('*/api/suministros/medicamentos', () =>
        HttpResponse.json({ data: suministro() }, { status: 201 }),
      ),
    );
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    nombraLaCamaSinCortes(await screen.findByRole('status'), `(cama ${A01})`);
  });
});
