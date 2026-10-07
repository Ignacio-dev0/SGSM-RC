import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { tema } from '../tema';
import { AccionesFormulario } from './AccionesFormulario';
import { Boton } from './Boton';

/**
 * jsdom no evalúa media queries: lo que vale desde un ancho mínimo se lee del CSS que genera
 * emotion. Devuelve las declaraciones del contenedor (o de sus hijos directos) de esa media query.
 */
function reglasDesde(contenedor: Element, minimo: string, hijos = false) {
  const clase = [...contenedor.classList].find((c) => c.startsWith('css-'))!;
  const css = [...document.querySelectorAll('style')].map((e) => e.textContent).join('');
  const inicio = `@media (min-width:${minimo}){.${clase}${hijos ? '>*' : ''}{`;
  // Cada tramo que sigue a `inicio` termina en la primera llave que cierra.
  return css
    .split(inicio)
    .slice(1)
    .map((tramo) => tramo.slice(0, tramo.indexOf('}')))
    .join('');
}

function dibujar() {
  render(
    <ThemeProvider theme={tema}>
      <AccionesFormulario>
        <Boton variante="texto">Cancelar</Boton>
        <Boton variante="secundario">Guardar borrador</Boton>
        <Boton>Registrar</Boton>
      </AccionesFormulario>
    </ThemeProvider>,
  );
  return screen.getByRole('group', { name: 'Acciones del formulario' });
}

describe('AccionesFormulario (F31)', () => {
  it('muestra los botones en el orden recibido: la acción principal va al final', () => {
    dibujar();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Cancelar',
      'Guardar borrador',
      'Registrar',
    ]);
  });

  it('en cualquier pantalla es una fila flexible de ancho completo con 8 px entre botones', () => {
    const grupo = dibujar();
    const estilo = getComputedStyle(grupo);
    expect(estilo.display).toBe('flex');
    expect(estilo.width).toBe('100%');
    // Un paso de la escala de espaciado del tema (8 px).
    expect(estilo.gap).toBe('var(--mui-spacing)');
  });

  it('en teléfono los botones se apilan, cada uno a lo ancho', () => {
    const grupo = dibujar();
    expect(reglasDesde(grupo, '0px')).toMatch(/flex-direction:column/);
    expect(reglasDesde(grupo, '0px', true)).toMatch(/width:100%/);
  });

  it('desde tablet va en fila, alineado a la derecha, y los botones recuperan su ancho', () => {
    const grupo = dibujar();
    const desdeSm = reglasDesde(grupo, '600px');
    expect(desdeSm).toMatch(/flex-direction:row/);
    expect(desdeSm).toMatch(/justify-content:flex-end/);
    expect(reglasDesde(grupo, '600px', true)).toMatch(/width:auto/);
  });
});
