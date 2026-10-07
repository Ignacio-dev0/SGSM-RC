import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { tema } from '../tema';
import { ColumnaPrincipal, GrillaDeFiltros, Recargando } from './listado';

/** CSS que emotion generó para las clases de un elemento (jsdom no evalúa media queries). */
function reglasDe(elemento: Element) {
  const clases = [...elemento.classList].filter((c) => c.startsWith('css-'));
  const estilos = [...document.querySelectorAll('style')].map((e) => e.textContent).join('');
  return clases.map(
    (c) => estilos.match(new RegExp(String.raw`[^}]*\.${c}[^{]*\{[^}]*\}\}?`, 'g')) ?? [],
  );
}

const dibujar = (ui: React.ReactNode) => render(<ThemeProvider theme={tema}>{ui}</ThemeProvider>);

describe('GrillaDeFiltros (F32: filtros de a dos en tablet vertical)', () => {
  it('es una región de búsqueda con nombre y contiene los filtros', () => {
    dibujar(
      <GrillaDeFiltros columnas="2fr 1fr 1fr">
        <input aria-label="Buscar" />
        <input aria-label="Sala" />
      </GrillaDeFiltros>,
    );
    const region = screen.getByRole('search', { name: 'Filtros' });
    expect(region).toContainElement(screen.getByLabelText('Buscar'));
  });

  it('apila en teléfono, va de a dos columnas desde sm y usa las suyas en pantalla grande', () => {
    dibujar(
      <GrillaDeFiltros columnas="2fr 1fr 1fr">
        <input aria-label="Buscar" />
      </GrillaDeFiltros>,
    );
    const css = reglasDe(screen.getByRole('search')).flat().join('\n');
    expect(css).toMatch(/grid-template-columns:\s*1fr;/);
    expect(css).toMatch(
      /@media \(min-width:600px\)\{[^{]*\{[^}]*grid-template-columns:\s*1fr 1fr;/,
    );
    expect(css).toMatch(
      /@media \(min-width:900px\)\{[^{]*\{[^}]*grid-template-columns:\s*2fr 1fr 1fr;/,
    );
  });

  it('con "desde" lg las columnas grandes esperan al ancho de escritorio', () => {
    dibujar(
      <GrillaDeFiltros columnas="2fr 1fr 1fr 1fr 1.5fr" desde="lg">
        <input aria-label="Buscar" />
      </GrillaDeFiltros>,
    );
    const css = reglasDe(screen.getByRole('search')).flat().join('\n');
    expect(css).toMatch(
      /@media \(min-width:1200px\)\{[^{]*\{[^}]*grid-template-columns:\s*2fr 1fr 1fr 1fr 1\.5fr;/,
    );
    expect(css).not.toMatch(/@media \(min-width:900px\)\{[^{]*\{[^}]*grid-template-columns/);
  });

  it('el primer filtro (la búsqueda) ocupa todo el ancho en tablet vertical', () => {
    dibujar(
      <GrillaDeFiltros columnas="2fr 1fr 1fr">
        <input aria-label="Buscar" />
        <input aria-label="Sala" />
      </GrillaDeFiltros>,
    );
    const css = reglasDe(screen.getByRole('search')).flat().join('\n');
    expect(css).toMatch(
      /@media \(min-width:600px\)\{[^{]*>[^{]*first-of-type[^{]*\{[^}]*grid-column:\s*1\/-1;/,
    );
  });
});

describe('Recargando (F32: las filas viejas se ven atenuadas mientras llegan las nuevas)', () => {
  it('sin recarga no atenúa ni avisa que está ocupado', () => {
    dibujar(
      <Recargando activo={false}>
        <p>Fila</p>
      </Recargando>,
    );
    const caja = screen.getByText('Fila').parentElement!;
    expect(caja).toHaveAttribute('aria-busy', 'false');
    expect(caja).toHaveStyle({ opacity: '1' });
  });

  it('al recargar atenúa el contenido y lo marca como ocupado', () => {
    dibujar(
      <Recargando activo>
        <p>Fila</p>
      </Recargando>,
    );
    const caja = screen.getByText('Fila').parentElement!;
    expect(caja).toHaveAttribute('aria-busy', 'true');
    expect(caja).toHaveStyle({ opacity: '0.5' });
  });

  it('con movimiento reducido no hay transición', () => {
    dibujar(
      <Recargando activo>
        <p>Fila</p>
      </Recargando>,
    );
    const css = reglasDe(screen.getByText('Fila').parentElement!).flat().join('\n');
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: ?reduce\)\{[^{]*\{[^}]*transition:\s*none;/,
    );
  });
});

describe('ColumnaPrincipal (F32: lo que identifica a la fila, en negrita y con lugar)', () => {
  it('va en negrita y tiene un ancho mínimo desde tablet, para que la columna no se angoste', () => {
    dibujar(<ColumnaPrincipal>Benítez, Rosa</ColumnaPrincipal>);
    const texto = screen.getByText('Benítez, Rosa');
    expect(texto.tagName).toBe('STRONG');
    const css = reglasDe(texto).flat().join('\n');
    expect(css).toMatch(/@media \(min-width:600px\)\{[^{]*\{[^}]*min-width:150px;/);
  });

  it('en teléfono no fuerza ancho: la tarjeta no se desborda', () => {
    dibujar(<ColumnaPrincipal>Benítez, Rosa</ColumnaPrincipal>);
    const css = reglasDe(screen.getByText('Benítez, Rosa')).flat().join('\n');
    // Se descartan las reglas dentro de media queries: fuera de ellas no hay ancho mínimo.
    const sinMediaQueries = css.replace(/@media[^{]*\{[^{]*\{[^}]*\}\}/g, '');
    expect(sinMediaQueries).not.toMatch(/min-width:\s*\d/);
  });

  it('el ancho mínimo se puede ajustar', () => {
    dibujar(<ColumnaPrincipal ancho={200}>Paracetamol</ColumnaPrincipal>);
    const css = reglasDe(screen.getByText('Paracetamol')).flat().join('\n');
    expect(css).toMatch(/min-width:200px;/);
  });
});
