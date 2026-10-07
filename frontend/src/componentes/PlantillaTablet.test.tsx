import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PlantillaTablet } from './PlantillaTablet';

describe('PlantillaTablet', () => {
  it('muestra el menú lateral con las opciones y el área de contenido', () => {
    render(
      <MemoryRouter initialEntries={['/pacientes']}>
        <PlantillaTablet
          opciones={[
            { ruta: '/', etiqueta: 'Inicio' },
            { ruta: '/pacientes', etiqueta: 'Pacientes' },
          ]}
        >
          <p>Contenido de la pantalla</p>
        </PlantillaTablet>
      </MemoryRouter>,
    );

    const menu = screen.getByRole('navigation', { name: 'Menú principal' });
    expect(menu).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Pacientes' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('main')).toHaveTextContent('Contenido de la pantalla');
  });

  describe('en un teléfono', () => {
    const original = window.matchMedia;
    beforeEach(() => {
      // Simula una pantalla angosta: coincide la consulta "hasta 600 px" (breakpoints.down('sm')).
      window.matchMedia = ((consulta: string) => ({
        matches: consulta.includes('599.95'),
        media: consulta,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = original;
    });

    it('el menú se abre con un botón y se cierra al elegir una opción', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <PlantillaTablet
            opciones={[
              { ruta: '/', etiqueta: 'Inicio' },
              { ruta: '/pacientes', etiqueta: 'Pacientes' },
            ]}
          >
            <p>Contenido</p>
          </PlantillaTablet>
        </MemoryRouter>,
      );

      expect(screen.queryByRole('link', { name: 'Pacientes' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Abrir el menú' }));
      await userEvent.click(screen.getByRole('link', { name: 'Pacientes' }));

      // El cajón se cierra con su animación de salida.
      await waitFor(() =>
        expect(screen.queryByRole('link', { name: 'Pacientes' })).not.toBeInTheDocument(),
      );
      expect(screen.getByRole('main')).toHaveTextContent('Contenido');
    });
  });
});
