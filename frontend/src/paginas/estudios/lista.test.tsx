import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { UsuarioSesion } from '../../api/tipos';
import { ADMIN, ENFERMERO, MEDICO } from '../../pruebas/datos';
import {
  CANCELADO,
  REALIZADO,
  conEstudios,
  errorApi,
  estudio,
  prepararEstudios,
  restaurarEstudios,
} from '../../pruebas/datosEstudios';
import { paciente } from '../../pruebas/datosPacientes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(prepararEstudios);
afterEach(restaurarEstudios);

const RUTA = '/pacientes/7?pestana=estudios';

/** Los títulos de los estudios de una lista, en el orden en que se ven. */
const titulos = (lista: HTMLElement) =>
  within(lista)
    .getAllByRole('listitem')
    .map((li) => within(li).getByRole('heading').textContent);

/** La tarjeta (ítem de la lista) del estudio con ese nombre. */
const tarjeta = (nombre: string | RegExp) =>
  screen.getByRole('heading', { name: nombre }).closest('li') as HTMLElement;

const chipDe = (donde: HTMLElement, texto: string) =>
  within(donde).getByText(texto).closest('.MuiChip-root') as HTMLElement;

describe('pestaña Estudios de la ficha del paciente (T510 · S15)', () => {
  it('la ficha tiene la pestaña Estudios y abre en ella con ?pestana=estudios', async () => {
    renderizarApp(RUTA, ENFERMERO);

    const pestana = await screen.findByRole('tab', { name: 'Estudios' });
    expect(pestana).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel', { name: 'Estudios' });
    expect(await within(panel).findByRole('list', { name: 'Programados' })).toBeInTheDocument();
  });

  it('muestra primero los programados y después los realizados y cancelados, como los ordena el servidor', async () => {
    renderizarApp(RUTA, ENFERMERO);

    const programados = await screen.findByRole('list', { name: 'Programados' });
    expect(titulos(programados)).toEqual(['Rx de tórax frente y perfil', 'Hemograma completo']);
    const resto = screen.getByRole('list', { name: 'Realizados y cancelados' });
    expect(titulos(resto)).toEqual(['Ecografía abdominal', 'Interconsulta con fonoaudiología']);
    // Los programados van arriba en la página.
    expect(
      programados.compareDocumentPosition(resto) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('cada estudio dice nombre, tipo, fecha y hora en 24 h, preparación y observaciones', async () => {
    renderizarApp(RUTA, ENFERMERO);

    await screen.findByRole('list', { name: 'Programados' });
    const rx = tarjeta('Rx de tórax frente y perfil');
    expect(rx).toHaveTextContent('Radiografía');
    // 13:00 UTC son las 10:00 de Argentina, con fecha y hora en el mismo renglón.
    expect(rx).toHaveTextContent(/08\/10\/2026\s10:00/);
    expect(rx).toHaveTextContent('Retirar alhajas y objetos metálicos');
    expect(rx).toHaveTextContent('Trasladar en silla de ruedas');
    expect(rx).toHaveTextContent('Ferreyra, Martín');
    // Sin preparación ni observaciones no quedan rótulos vacíos.
    const eco = tarjeta('Ecografía abdominal');
    expect(eco).not.toHaveTextContent('Preparación');
  });

  it('el realizado dice quién lo confirmó y cuándo; el cancelado, el motivo', async () => {
    renderizarApp(RUTA, ENFERMERO);

    await screen.findByRole('list', { name: 'Realizados y cancelados' });
    const eco = tarjeta('Ecografía abdominal');
    expect(eco).toHaveTextContent(/Acosta, Sofía/);
    expect(eco).toHaveTextContent(/06\/10\/2026\s10:05/);
    expect(eco).toHaveTextContent('Sin novedad');
    const inter = tarjeta('Interconsulta con fonoaudiología');
    expect(inter).toHaveTextContent('Se suspendió el turno');
  });

  it('el estado se dice con la etiqueta, nunca en verde: Programado con contorno neutro; Realizado y Cancelado cerrados', async () => {
    renderizarApp(RUTA, ENFERMERO);

    await screen.findByRole('list', { name: 'Programados' });
    const programado = chipDe(tarjeta('Rx de tórax frente y perfil'), 'Programado');
    expect(programado).toHaveClass('MuiChip-outlined', 'MuiChip-colorDefault');
    const realizado = chipDe(tarjeta('Ecografía abdominal'), 'Realizado');
    expect(realizado).toHaveClass('MuiChip-filled', 'MuiChip-colorDefault');
    const cancelado = chipDe(tarjeta('Interconsulta con fonoaudiología'), 'Cancelado');
    expect(cancelado).toHaveClass('MuiChip-filled', 'MuiChip-colorDefault');
    for (const chip of [programado, realizado, cancelado]) {
      expect(chip).not.toHaveClass('MuiChip-sizeSmall');
      expect(getComputedStyle(chip).height).toBe('28px');
    }
    const panel = screen.getByRole('tabpanel', { name: 'Estudios' });
    expect(panel.querySelectorAll('.MuiChip-colorSuccess')).toHaveLength(0);
  });

  it('mientras llegan los estudios dice que está cargando', async () => {
    servidor.use(
      http.get('*/api/pacientes/7/estudios', async () => {
        await delay('infinite');
        return HttpResponse.json({ data: [] });
      }),
    );
    renderizarApp(RUTA, MEDICO);

    expect(await screen.findByText('Cargando los estudios…')).toBeInTheDocument();
    expect(screen.queryByText(/No tiene estudios/)).not.toBeInTheDocument();
  });

  it('si no se pueden cargar lo dice y deja reintentar, sin afirmar que no tiene estudios', async () => {
    let fallar = true;
    servidor.use(
      http.get('*/api/pacientes/7/estudios', () =>
        fallar ? errorApi(500, 'ERROR_INTERNO') : HttpResponse.json({ data: [estudio()] }),
      ),
    );
    renderizarApp(RUTA, MEDICO);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudieron cargar los estudios/);
    expect(screen.queryByText(/No tiene estudios/)).not.toBeInTheDocument();

    fallar = false;
    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { name: 'Rx de tórax frente y perfil' }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sin estudios dice que no tiene estudios programados y ofrece programar a quien puede', async () => {
    conEstudios();
    renderizarApp(RUTA, MEDICO);

    expect(await screen.findByText('No tiene estudios programados')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Programar estudio' })).toHaveLength(1);
  });

  it('si solo tiene realizados o cancelados, también dice que no tiene programados', async () => {
    conEstudios(REALIZADO, CANCELADO);
    renderizarApp(RUTA, ENFERMERO);

    expect(await screen.findByText('No tiene estudios programados')).toBeVisible();
    expect(screen.getByRole('list', { name: 'Realizados y cancelados' })).toBeInTheDocument();
  });
});

describe('qué puede hacer cada rol con los estudios (S15)', () => {
  it('enfermería confirma que se realizó, pero no programa, reprograma ni cancela', async () => {
    renderizarApp(RUTA, ENFERMERO);

    await screen.findByRole('list', { name: 'Programados' });
    expect(screen.queryByRole('button', { name: 'Programar estudio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Reprogramar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cancelar estudio/ })).not.toBeInTheDocument();
    const rx = tarjeta('Rx de tórax frente y perfil');
    expect(
      within(rx).getByRole('button', {
        name: 'Confirmar que se realizó Rx de tórax frente y perfil',
      }),
    ).toBeVisible();
  });

  it('el médico programa, reprograma y cancela, pero no confirma que se realizó', async () => {
    renderizarApp(RUTA, MEDICO);

    await screen.findByRole('list', { name: 'Programados' });
    expect(screen.getByRole('button', { name: 'Programar estudio' })).toBeVisible();
    const rx = tarjeta('Rx de tórax frente y perfil');
    expect(within(rx).getByRole('button', { name: /^Reprogramar/ })).toBeVisible();
    expect(within(rx).getByRole('button', { name: /^Cancelar estudio/ })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Confirmar que se realizó/ }),
    ).not.toBeInTheDocument();
  });

  it('un estudio realizado o cancelado no ofrece ninguna acción', async () => {
    renderizarApp(RUTA, ADMIN);

    await screen.findByRole('list', { name: 'Realizados y cancelados' });
    for (const nombre of ['Ecografía abdominal', 'Interconsulta con fonoaudiología']) {
      expect(within(tarjeta(nombre)).queryAllByRole('button')).toHaveLength(0);
    }
    // El administrador tiene los dos permisos: en un programado ve las tres acciones.
    expect(within(tarjeta('Rx de tórax frente y perfil')).getAllByRole('button')).toHaveLength(3);
  });

  it('a un paciente egresado no se le ofrece programar', async () => {
    servidor.use(
      http.get('*/api/pacientes/7', () =>
        HttpResponse.json({ data: paciente({ estado: 'EGRESADO', cama: null }) }),
      ),
    );
    conEstudios(CANCELADO);
    renderizarApp(RUTA, MEDICO);

    expect(await screen.findByText('No tiene estudios programados')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Programar estudio' })).not.toBeInTheDocument();
  });

  it('sin el permiso estudios.ver no hay pestaña Estudios', async () => {
    const sinEstudios: UsuarioSesion = {
      ...ENFERMERO,
      permisos: ENFERMERO.permisos.filter((p) => !p.startsWith('estudios.')),
    };
    servidor.use(
      http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
    );
    renderizarApp(RUTA, sinEstudios);

    // Se abre en la pestaña inicial, sin pedir los estudios.
    expect(await screen.findByRole('tab', { name: 'Prescripciones' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('tab', { name: 'Estudios' })).not.toBeInTheDocument();
  });

  it('los botones de cada estudio miden al menos 48 px de alto (objetivo táctil)', async () => {
    renderizarApp(RUTA, ADMIN);

    await screen.findByRole('list', { name: 'Programados' });
    const botones = within(tarjeta('Rx de tórax frente y perfil')).getAllByRole('button');
    for (const boton of botones) {
      expect(parseFloat(getComputedStyle(boton).minHeight)).toBeGreaterThanOrEqual(48);
    }
    await waitFor(() =>
      expect(
        parseFloat(getComputedStyle(screen.getByRole('tab', { name: 'Estudios' })).minHeight),
      ).toBeGreaterThanOrEqual(48),
    );
  });
});
