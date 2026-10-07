import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { CLAVE_TEMA, tema } from '../tema';
import { SelectorTema } from './SelectorTema';

describe('selector de tema (claro, oscuro o el del sistema)', () => {
  it('cambia a oscuro, lo aplica a la página y lo recuerda en la tablet', async () => {
    render(
      <ThemeProvider theme={tema} modeStorageKey={CLAVE_TEMA} defaultMode="system">
        <SelectorTema />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /Tema de la pantalla/ }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Oscuro' }));

    expect(document.documentElement).toHaveAttribute('data-tema', 'dark');
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('dark');
    expect(screen.getByRole('button', { name: /Tema de la pantalla: Oscuro/ })).toBeInTheDocument();
  });

  it('ofrece seguir el tema del sistema', async () => {
    render(
      <ThemeProvider theme={tema} modeStorageKey={CLAVE_TEMA} defaultMode="system">
        <SelectorTema />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Tema de la pantalla/ }));
    expect(
      screen.getByRole('menuitemradio', { name: 'Igual que el dispositivo' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Claro' })).toBeInTheDocument();
  });
});
