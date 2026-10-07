import { createElement } from 'react';
import type * as Barras from '@mui/x-charts/BarChart';
import type * as Lineas from '@mui/x-charts/LineChart';
import type * as Torta from '@mui/x-charts/PieChart';
import { ThemeProvider } from '@mui/material';
import { render, screen, within } from '@testing-library/react';
import { ESTADISTICAS, restaurarReportes, simularPantalla } from '../../pruebas/datosReportes';
import { CLAVE_TEMA, tema as temaApp } from '../../tema';
import { GraficoConsumo, GraficoEvolucion, GraficoInsumos, GraficoRecordatorios } from './graficos';
import type { TemaConEsquemas } from './usarGraficos';

const tema = temaApp as TemaConEsquemas;

// Se anota con qué `skipAnimation` se dibuja cada gráfico de @mui/x-charts.
const anotadas = vi.hoisted(() => ({ skipAnimation: [] as unknown[] }));

function anotar<P extends { skipAnimation?: boolean }>(Componente: (p: P) => unknown) {
  return (p: P) => {
    anotadas.skipAnimation.push(p.skipAnimation);
    return createElement(Componente as never, p as never);
  };
}

vi.mock('@mui/x-charts/BarChart', async (importar) => {
  const original = await importar<typeof Barras>();
  return { ...original, BarChart: anotar(original.BarChart as never) };
});
vi.mock('@mui/x-charts/LineChart', async (importar) => {
  const original = await importar<typeof Lineas>();
  return { ...original, LineChart: anotar(original.LineChart as never) };
});
vi.mock('@mui/x-charts/PieChart', async (importar) => {
  const original = await importar<typeof Torta>();
  return { ...original, PieChart: anotar(original.PieChart as never) };
});

const dibujarTodos = () =>
  render(
    <ThemeProvider theme={tema} modeStorageKey={CLAVE_TEMA} defaultMode="system">
      <GraficoInsumos insumos={ESTADISTICAS.insumosMasUsados} />
      <GraficoConsumo consumo={ESTADISTICAS.consumoPorTipo} />
      <GraficoEvolucion dias={ESTADISTICAS.evolucionDiaria} />
      <GraficoRecordatorios
        recordatorios={ESTADISTICAS.recordatorios}
        periodo="del 01/10/2026 al 07/10/2026"
      />
    </ThemeProvider>,
  );

beforeEach(() => {
  anotadas.skipAnimation = [];
});
afterEach(restaurarReportes);

describe('gráficos de las estadísticas', () => {
  it('sin animación si el dispositivo pide movimiento reducido', () => {
    simularPantalla({ movimientoReducido: true });
    dibujarTodos();
    expect(anotadas.skipAnimation.length).toBeGreaterThanOrEqual(4);
    expect(anotadas.skipAnimation.every((s) => s === true)).toBe(true);
  });

  it('con animación si no se pide lo contrario', () => {
    simularPantalla({});
    dibujarTodos();
    expect(anotadas.skipAnimation.length).toBeGreaterThan(0);
    expect(anotadas.skipAnimation.every((s) => s === false)).toBe(true);
  });

  it('los colores salen del tema activo: en el oscuro, los del tema oscuro', () => {
    localStorage.setItem(CLAVE_TEMA, 'dark');
    dibujarTodos();

    const leyenda = within(screen.getByRole('region', { name: 'Consumo por tipo' }));
    const marca = (texto: RegExp) =>
      leyenda
        .getByText(texto)
        .closest('li')
        ?.querySelector('.MuiChartsLabelMark-fill')
        ?.getAttribute('fill');
    expect(marca(/Medicamentos: 3/)).toBe(tema.colorSchemes.dark?.palette.primary.main);
    expect(marca(/Insumos: 5/)).toBe(tema.colorSchemes.dark?.palette.secondary.main);
  });

  it('en el claro, los del tema claro; nunca el verde de "éxito" ni el rojo de "error"', () => {
    localStorage.setItem(CLAVE_TEMA, 'light');
    const { container } = dibujarTodos();

    const claro = tema.colorSchemes.light!.palette;
    const usados = new Set(
      [...container.querySelectorAll('[fill]')].map((e) => e.getAttribute('fill')),
    );
    expect(usados).toContain(claro.primary.main);
    expect(usados).not.toContain(claro.success.main);
    expect(usados).not.toContain(claro.error.main);
  });
});
