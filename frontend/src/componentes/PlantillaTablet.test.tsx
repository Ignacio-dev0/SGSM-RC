import { render, screen } from '@testing-library/react';
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
});
