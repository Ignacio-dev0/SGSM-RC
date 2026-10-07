import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ENFERMERO } from '../pruebas/datos';
import { renderizarApp } from '../pruebas/renderizar';

/**
 * Riesgo R10: en el teléfono la barra tiene el menú, el nombre del sistema, la insignia de
 * recordatorios, la campana y Salir. El tema pasa al cajón del menú para que "SGSM-RC" entre
 * sin cortarse.
 */
const original = window.matchMedia;
const simularAncho = (telefono: boolean) => {
  window.matchMedia = ((consulta: string) => ({
    matches: telefono && (consulta.includes('599.95') || consulta.includes('899.95')),
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
};
afterEach(() => {
  window.matchMedia = original;
});

describe('la barra superior en el teléfono (R10)', () => {
  it('el tema no está en la barra sino en el cajón del menú', async () => {
    simularAncho(true);
    renderizarApp('/', ENFERMERO);

    const barra = await screen.findByRole('banner');
    expect(within(barra).getByText('SGSM-RC')).toBeInTheDocument();
    expect(within(barra).queryByRole('button', { name: /Tema de la pantalla/ })).toBeNull();

    await userEvent.click(within(barra).getByRole('button', { name: 'Abrir el menú' }));
    const cajon = await screen.findByRole('presentation');
    await userEvent.click(within(cajon).getByRole('button', { name: /Tema de la pantalla/ }));
    expect(await screen.findByRole('menuitemradio', { name: 'Oscuro' })).toBeInTheDocument();
  });

  it('en tablet y PC el tema sigue en la barra', async () => {
    simularAncho(false);
    renderizarApp('/', ENFERMERO);

    const barra = await screen.findByRole('banner');
    expect(
      await within(barra).findByRole('button', { name: /Tema de la pantalla/ }),
    ).toBeInTheDocument();
  });
});
