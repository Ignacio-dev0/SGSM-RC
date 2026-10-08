import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { tema } from '../tema';
import { ChipEstado } from './ChipEstado';
import { ESTADOS_CHIP, type EstadoChip } from './estadosChip';

const dibujar = (estado: EstadoChip) =>
  render(
    <ThemeProvider theme={tema}>
      <ChipEstado estado={estado} />
    </ThemeProvider>,
  );

/**
 * La regla (F30), con un ejemplo por nivel de énfasis:
 *  - lo esperable, con contorno y neutro;
 *  - lo cerrado (ya no está en curso), relleno neutro;
 *  - lo que pide atención, relleno de color;
 *  - un hecho a tener en cuenta que no es un problema, con contorno de color.
 */
const TABLA: Array<[EstadoChip, string, 'default' | 'info' | 'warning', 'outlined' | 'filled']> = [
  ['VIGENTE', 'Vigente', 'default', 'outlined'],
  ['INTERNADO', 'Internado', 'default', 'outlined'],
  ['ACTIVO', 'Activo', 'default', 'outlined'],
  ['VALIDADO', 'Validado', 'default', 'outlined'],
  ['REGISTRADO', 'Registrado', 'default', 'outlined'],
  ['CORREGIDO', 'Corregido', 'info', 'outlined'],
  ['SUSPENDIDA', 'Suspendida', 'warning', 'filled'],
  ['BLOQUEADO', 'Bloqueado', 'warning', 'filled'],
  ['SIN_REGISTRAR', 'Sin registrar', 'warning', 'filled'],
  ['FINALIZADA', 'Finalizada', 'default', 'filled'],
  ['EGRESADO', 'Egresado', 'default', 'filled'],
  ['DADO_DE_BAJA', 'Dado de baja', 'default', 'filled'],
];

const nombreColor = (color: string) => `MuiChip-color${color[0]!.toUpperCase()}${color.slice(1)}`;

describe('ChipEstado (F30)', () => {
  it.each(TABLA)('%s se ve como "%s" (%s, %s)', (estado, etiqueta, color, variante) => {
    dibujar(estado);
    const chip = screen.getByText(etiqueta).closest('.MuiChip-root');
    expect(chip).not.toBeNull();
    expect(chip).toHaveClass(`MuiChip-${variante}`, nombreColor(color));
    expect(chip).not.toHaveClass(variante === 'filled' ? 'MuiChip-outlined' : 'MuiChip-filled');
  });

  it('la tabla no tiene estados de más ni de menos: cada uno está en estas pruebas', () => {
    expect(Object.keys(ESTADOS_CHIP).sort()).toEqual(TABLA.map(([estado]) => estado).sort());
  });

  it('el color sale solo de roles de la paleta (neutro, info o warning)', () => {
    for (const { color } of Object.values(ESTADOS_CHIP)) {
      expect(['default', 'info', 'warning']).toContain(color);
    }
  });

  it.each(TABLA)('%s tiene 28 px de alto y texto de al menos 0.875rem', (estado, etiqueta) => {
    dibujar(estado);
    const chip = screen.getByText(etiqueta).closest('.MuiChip-root')!;
    expect(chip).toHaveStyle({ height: '28px' });
    // jsdom resuelve los rem a px (16 px por rem): 0.875rem son 14 px.
    expect(parseFloat(getComputedStyle(chip).fontSize)).toBeGreaterThanOrEqual(14);
    // No usa el tamaño chico de MUI (24 px, texto de 13 px).
    expect(chip).not.toHaveClass('MuiChip-sizeSmall');
  });

  it('es solo texto: no se puede tocar ni recibe foco', () => {
    dibujar('VIGENTE');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Vigente').closest('.MuiChip-root')).not.toHaveAttribute('tabindex');
  });
});
