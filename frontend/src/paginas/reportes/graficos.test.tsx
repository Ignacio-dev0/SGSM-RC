import { createElement } from 'react';
import type * as Barras from '@mui/x-charts/BarChart';
import type * as Lineas from '@mui/x-charts/LineChart';
import { ThemeProvider } from '@mui/material';
import { render, screen, within } from '@testing-library/react';
import {
  ESTADISTICAS,
  restaurarReportes,
  simularAnchoDeGraficos,
  simularPantalla,
} from '../../pruebas/datosReportes';
import { CLAVE_TEMA, tema as temaApp } from '../../tema';
import { GraficoEvolucion } from './evolucion';
import { GraficoConsumo, GraficoMasUsados, GraficoRecordatorios } from './graficos';
import type { TemaConEsquemas } from './usarGraficos';

const tema = temaApp as TemaConEsquemas;
const NBSP = String.fromCharCode(160);

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

const conTema = (hijos: React.ReactNode) =>
  render(
    <ThemeProvider theme={tema} modeStorageKey={CLAVE_TEMA} defaultMode="system">
      {hijos}
    </ThemeProvider>,
  );

const dibujarTodos = () =>
  conTema(
    <>
      <GraficoMasUsados insumos={ESTADISTICAS.insumosMasUsados} />
      <GraficoConsumo
        consumo={ESTADISTICAS.consumoPorTipo}
        total={ESTADISTICAS.totales.suministros}
      />
      <GraficoEvolucion dias={ESTADISTICAS.evolucionDiaria} />
      <GraficoRecordatorios
        recordatorios={ESTADISTICAS.recordatorios}
        periodo="del 01/10/2026 al 07/10/2026"
      />
    </>,
  );

const region = (nombre: string) => screen.getByRole('region', { name: nombre });
/** El relleno de cada barra de un gráfico, en orden. */
const rellenos = (nombre: string) =>
  [...region(nombre).querySelectorAll('rect.MuiBarChart-element')].map((r) =>
    r.getAttribute('fill'),
  );

beforeEach(() => {
  anotadas.skipAnimation = [];
  simularAnchoDeGraficos();
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

  it('cada gráfico se describe con su texto, que dice dónde están los mismos números (E6-18)', () => {
    dibujarTodos();
    for (const nombre of [
      'Medicamentos e insumos más usados',
      'Consumo por tipo',
      'Evolución diaria',
      'Recordatorios del período',
    ]) {
      expect(region(nombre)).toHaveAccessibleDescription(
        /Los mismos números están en Ver como tabla\.$/,
      );
    }
  });
});

// E6-01: cada color quiere decir lo mismo en toda la pantalla y nada se distingue solo por él.
describe('colores de las series', () => {
  it('en el oscuro, los del tema oscuro: medicamentos y con insumos con su color en todos los gráficos', () => {
    localStorage.setItem(CLAVE_TEMA, 'dark');
    dibujarTodos();
    const oscuro = tema.colorSchemes.dark!.palette;

    expect(rellenos('Consumo por tipo')).toEqual([oscuro.primary.main, oscuro.secondary.main]);
    const lineas = region('Evolución diaria');
    const trazo = (serie: string) =>
      lineas.querySelector(`.MuiLineChart-line[data-series="${serie}"]`)?.getAttribute('stroke');
    expect(trazo('medicamentos')).toBe(oscuro.primary.main);
    expect(trazo('insumos')).toBe(oscuro.secondary.main);
    expect(trazo('suministros')).toBe(oscuro.info.main);
  });

  it('más usados: un solo color, el de los suministros', () => {
    localStorage.setItem(CLAVE_TEMA, 'light');
    dibujarTodos();
    const claro = tema.colorSchemes.light!.palette;
    expect(new Set(rellenos('Medicamentos e insumos más usados'))).toEqual(
      new Set([claro.info.main]),
    );
  });

  it('recordatorios: un solo color neutro, y el de aviso solo para "Vencidos sin atender"', () => {
    localStorage.setItem(CLAVE_TEMA, 'light');
    dibujarTodos();
    const claro = tema.colorSchemes.light!.palette;
    expect(rellenos('Recordatorios del período')).toEqual([
      claro.text.secondary,
      claro.text.secondary,
      claro.text.secondary,
      claro.warning.main,
    ]);
  });

  it('nunca el verde de "éxito" ni el rojo de "error"', () => {
    localStorage.setItem(CLAVE_TEMA, 'light');
    const { container } = dibujarTodos();
    const claro = tema.colorSchemes.light!.palette;
    const usados = new Set(
      [...container.querySelectorAll('[fill], [stroke]')].flatMap((e) => [
        e.getAttribute('fill'),
        e.getAttribute('stroke'),
      ]),
    );
    expect(usados).toContain(claro.primary.main);
    expect(usados).not.toContain(claro.success.main);
    expect(usados).not.toContain(claro.error.main);
  });
});

describe('barras con nombre y número (E6-01 · E6-02 · E6-03)', () => {
  it('recordatorios: una barra por estado, con su nombre en el eje y su número al final, sin leyenda', () => {
    dibujarTodos();
    const r = within(region('Recordatorios del período'));
    for (const nombre of ['A tiempo', 'Tarde', 'No administrados', 'Vencidos sin atender']) {
      expect(r.getByText(nombre)).toBeInTheDocument();
    }
    const numeros = [...region('Recordatorios del período').querySelectorAll('.MuiBarChart-label')];
    expect(numeros.map((n) => n.textContent)).toEqual(['2', '1', '1', '1']);
    expect(region('Recordatorios del período').querySelector('.MuiChartsLegend-root')).toBeNull();
  });

  it('consumo por tipo: dos barras con nombre y el porcentaje sobre el total del período, que puede pasar de 100 %', () => {
    conTema(
      <GraficoConsumo
        consumo={[
          { tipo: 'MEDICAMENTO', suministros: 4 },
          { tipo: 'INSUMO', suministros: 5 },
        ]}
        total={8}
      />,
    );
    const consumo = region('Consumo por tipo');
    expect(within(consumo).getByText('Con medicamentos')).toBeInTheDocument();
    expect(within(consumo).getByText('Con insumos')).toBeInTheDocument();
    expect([...consumo.querySelectorAll('.MuiBarChart-label')].map((n) => n.textContent)).toEqual([
      `4 (50${NBSP}%)`,
      `5 (62,5${NBSP}%)`,
    ]);
    expect(consumo).toHaveAccessibleDescription(/sobre los 8 suministros del período/);
    expect(consumo).toHaveAccessibleDescription(/pueden sumar más de 100\s%/);
  });

  it('más usados: el nombre y la presentación en dos renglones del eje', () => {
    dibujarTodos();
    const masUsados = region('Medicamentos e insumos más usados');
    const renglones = [...masUsados.querySelectorAll('.MuiChartsAxis-tickLabel tspan')].map(
      (t) => t.textContent,
    );
    expect(renglones).toEqual(
      expect.arrayContaining([
        'Pañal para adultos',
        `Paquete x${NBSP}10`,
        'Paracetamol',
        `Comprimidos 500${NBSP}mg`,
      ]),
    );
  });

  it('el número de la barra más larga entra a su derecha: no lo corta el área del gráfico (E6-17)', () => {
    dibujarTodos();
    for (const nombre of [
      'Recordatorios del período',
      'Consumo por tipo',
      'Medicamentos e insumos más usados',
    ]) {
      const seccion = region(nombre);
      const area = Number(seccion.querySelector('clipPath rect')?.getAttribute('width'));
      const barras = [...seccion.querySelectorAll('rect.MuiBarChart-element')].map((r) =>
        Number(r.getAttribute('width')),
      );
      expect(area).toBeGreaterThan(0);
      expect(Math.max(...barras)).toBeLessThan(area * 0.9);
    }
  });

  it('más usados: los dos renglones enteros, sin "…", cuando entran', () => {
    dibujarTodos();
    const masUsados = region('Medicamentos e insumos más usados');
    const etiquetas = [...masUsados.querySelectorAll('.MuiChartsAxis-tickLabel')].map(
      (t) => t.textContent ?? '',
    );
    expect(etiquetas.join(' ')).not.toContain('…');
  });

  it('más usados en el teléfono: la tabla ya abierta, porque el eje es angosto', () => {
    simularPantalla({ telefono: true });
    dibujarTodos();
    const masUsados = region('Medicamentos e insumos más usados');
    expect(within(masUsados).getByRole('button', { name: 'Ocultar la tabla' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(
      within(masUsados).getByRole('list', { name: 'Medicamentos e insumos más usados (tabla)' }),
    ).toBeInTheDocument();
  });
});

// E6-11: cada línea se reconoce por su trazo y su forma también en la leyenda.
describe('evolución diaria', () => {
  const dias = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      fecha: `2026-09-${String(i + 1).padStart(2, '0')}`,
      suministros: i % 4,
      medicamentos: i % 2,
      insumos: i % 3,
    }));

  it('la leyenda muestra el trazo y la forma de cada línea', () => {
    conTema(<GraficoEvolucion dias={dias(7)} />);
    const leyenda = region('Evolución diaria');
    const marca = (serie: string) =>
      leyenda.querySelector(`.MuiChartsLegend-item[data-series="${serie}"] svg[data-trazo]`);
    expect(marca('suministros')?.getAttribute('data-trazo')).toBe('continuo');
    expect(marca('medicamentos')?.getAttribute('data-trazo')).toBe('rayado');
    expect(marca('insumos')?.getAttribute('data-trazo')).toBe('punteado');
    expect(marca('suministros')?.getAttribute('data-forma')).toBe('circle');
    expect(marca('medicamentos')?.getAttribute('data-forma')).toBe('square');
    expect(marca('insumos')?.getAttribute('data-forma')).toBe('triangle');
    expect(marca('medicamentos')?.querySelector('line')?.getAttribute('stroke-dasharray')).toBe(
      '8 4',
    );
  });

  it('con muchos días las marcas siguen, cada tantos puntos (con el primero y el último)', () => {
    conTema(<GraficoEvolucion dias={dias(30)} />);
    const marcas = region('Evolución diaria').querySelectorAll(
      '.MuiLineChart-mark[data-series="suministros"]',
    );
    expect(marcas.length).toBeGreaterThan(2);
    expect(marcas.length).toBeLessThan(30);
  });
});
