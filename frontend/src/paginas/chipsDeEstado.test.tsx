import type { ReactElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { http, HttpResponse } from 'msw';
import type { Insumo, Prescripcion, Usuario } from '../api/tipos';
import { ADMIN, ENFERMERO } from '../pruebas/datos';
import {
  HISTORIAL,
  listaDePacientes,
  paciente,
  simularCatalogosDePacientes,
} from '../pruebas/datosPacientes';
import { AHORA, prescripcion } from '../pruebas/datosPrescripciones';
import { prepararSuministros, suministro } from '../pruebas/datosSuministros';
import { renderizarApp } from '../pruebas/renderizar';
import { servidor } from '../pruebas/servidor';
import { tema } from '../tema';
import { ChipEstadoToma } from './prescripciones/ChipEstadoToma';
import { TarjetaPrescripcion } from './suministros/TarjetaPrescripcion';

/**
 * Los estados de cada pantalla salen de ChipEstado (una sola tabla estado → color y variante):
 * lo esperable con contorno neutro, lo que pide atención relleno de advertencia, lo cerrado
 * relleno neutro, y ninguno en verde (F30).
 */

/** El chip (el recuadro de MUI) con ese texto dentro del contenedor. */
const chipDe = (donde: HTMLElement, texto: string) =>
  within(donde).getByText(texto).closest('.MuiChip-root') as HTMLElement;

const ESPERABLE = ['MuiChip-outlined', 'MuiChip-colorDefault'] as const;
const CERRADO = ['MuiChip-filled', 'MuiChip-colorDefault'] as const;
const ATENCION = ['MuiChip-filled', 'MuiChip-colorWarning'] as const;

/** CSS que emotion generó para las clases del elemento (jsdom no resuelve el tema al calcular estilos). */
const cssDe = (el: Element) => {
  const css = [...document.querySelectorAll('style')].map((e) => e.textContent ?? '').join('');
  return [...el.classList]
    .filter((c) => c.startsWith('css-'))
    .map((c) => css.match(new RegExp(String.raw`\.${c}\{([^}]*)\}`))?.[1] ?? '')
    .join(';');
};

/** Un chip de estado es ChipEstado (28 px), no un Chip suelto `small`; y nunca verde. */
function esChipEstado(chip: HTMLElement, ...clases: string[]) {
  expect(chip).toHaveClass(...clases);
  expect(cssDe(chip)).toMatch(/height:\s*28px/);
  expect(chip).not.toHaveClass('MuiChip-sizeSmall');
  expect(chip).not.toHaveClass('MuiChip-colorSuccess');
  expect(chip).not.toHaveClass('MuiChip-colorPrimary');
}

/** Ningún chip de la zona es verde. */
const sinVerde = (donde: HTMLElement) =>
  expect(donde.querySelectorAll('.MuiChip-colorSuccess')).toHaveLength(0);

describe('búsqueda de pacientes: el estado del paciente es un ChipEstado', () => {
  beforeEach(simularCatalogosDePacientes);

  it('Internado es discreto (contorno neutro) y Egresado queda cerrado (relleno neutro)', async () => {
    servidor.use(
      http.get('*/api/pacientes', () =>
        listaDePacientes([
          paciente(),
          paciente({ id: 8, apellido: 'Gómez', estado: 'EGRESADO', cama: null }),
        ]),
      ),
    );
    renderizarApp('/pacientes?estado=', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Pacientes' });
    await within(tabla).findByText('Gómez, Rosa');
    esChipEstado(chipDe(tabla, 'Internado'), ...ESPERABLE);
    esChipEstado(chipDe(tabla, 'Egresado'), ...CERRADO);
    sinVerde(tabla);
  });
});

describe('ficha del paciente: el estado Egresado es un ChipEstado', () => {
  it('un paciente egresado muestra Egresado con relleno neutro', async () => {
    servidor.use(
      http.get('*/api/pacientes/7', () =>
        HttpResponse.json({
          data: paciente({
            estado: 'EGRESADO',
            cama: null,
            fechaEgreso: '2026-10-05T12:00:00.000Z',
            motivoEgreso: 'Alta médica',
          }),
        }),
      ),
      http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
      http.get('*/api/pacientes/7/historial', () => HttpResponse.json({ data: HISTORIAL })),
    );
    renderizarApp('/pacientes/7?pestana=datos', ENFERMERO);

    const chip = (await screen.findByText('Egresado')).closest('.MuiChip-root') as HTMLElement;
    esChipEstado(chip, ...CERRADO);
  });
});

describe('lista de usuarios: el estado de la cuenta es un ChipEstado', () => {
  const usuario = (extra: Partial<Usuario>): Usuario => ({
    id: 10,
    nombreUsuario: 'lgomez',
    dni: '30111222',
    nombre: 'Lucía',
    apellido: 'Gómez',
    email: null,
    matricula: 'ME 2001',
    rol: { codigo: 'ENFERMERO', nombre: 'Enfermero' },
    activo: true,
    fechaBaja: null,
    bloqueadoHasta: null,
    ultimoAcceso: null,
    tieneBiometria: false,
    permisosDelRol: [],
    permisosAdicionales: [],
    ...extra,
  });

  it('Activo es discreto, Bloqueado pide atención y Dado de baja queda cerrado', async () => {
    const enUnaHora = new Date(Date.now() + 3_600_000).toISOString();
    const usuarios = [
      usuario({ id: 10, apellido: 'Activa' }),
      usuario({ id: 11, apellido: 'Bloqueada', bloqueadoHasta: enUnaHora }),
      usuario({ id: 12, apellido: 'Baja', activo: false }),
    ];
    servidor.use(
      http.get('*/api/roles', () => HttpResponse.json({ data: [] })),
      http.get('*/api/usuarios', () =>
        HttpResponse.json({
          data: usuarios,
          meta: { pagina: 1, porPagina: 20, total: 3, totalPaginas: 1 },
        }),
      ),
    );
    renderizarApp('/usuarios', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Usuarios' });
    await within(tabla).findByText('Activa, Lucía');
    esChipEstado(chipDe(tabla, 'Activo'), ...ESPERABLE);
    esChipEstado(chipDe(tabla, 'Bloqueado'), ...ATENCION);
    esChipEstado(chipDe(tabla, 'Dado de baja'), ...CERRADO);
    sinVerde(tabla);
  });
});

describe('catálogo de insumos: el estado solo se muestra cuando no es lo esperable', () => {
  const insumo = (id: number, nombre: string, extra: Partial<Insumo> = {}): Insumo => ({
    id,
    nombre,
    tipo: 'MEDICAMENTO',
    unidadMedida: 'mg',
    presentacion: '',
    activo: true,
    ...extra,
  });
  const catalogo = (insumos: Insumo[]) =>
    servidor.use(http.get('*/api/insumos', () => HttpResponse.json({ data: insumos })));

  it('con el filtro Activos no repite «Activo» en cada fila ni deja una columna vacía', async () => {
    catalogo([insumo(1, 'Paracetamol'), insumo(2, 'Enalapril'), insumo(3, 'Omeprazol')]);
    renderizarApp('/catalogo', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Catálogo' });
    await within(tabla).findByText('Paracetamol');
    expect(within(tabla).getAllByRole('row')).toHaveLength(4);
    expect(within(tabla).queryByText('Activo')).not.toBeInTheDocument();
    expect(tabla.querySelectorAll('.MuiChip-root')).toHaveLength(0);
    expect(within(tabla).queryByRole('columnheader', { name: 'Estado' })).not.toBeInTheDocument();
  });

  it('con el filtro Dados de baja cada fila dice «Dado de baja», cerrado y sin verde', async () => {
    catalogo([
      insumo(1, 'Paracetamol', { activo: false }),
      insumo(2, 'Enalapril', { activo: false }),
    ]);
    renderizarApp('/catalogo?activo=false', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Catálogo' });
    await within(tabla).findByText('Paracetamol');
    expect(within(tabla).getByRole('columnheader', { name: 'Estado' })).toBeInTheDocument();
    const chips = within(tabla).getAllByText('Dado de baja');
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      esChipEstado(chip.closest('.MuiChip-root') as HTMLElement, ...CERRADO);
    }
    sinVerde(tabla);
  });

  it('si en la lista hay algo distinto de activo, la columna aparece y cada estado se distingue', async () => {
    catalogo([insumo(1, 'Paracetamol'), insumo(2, 'Enalapril', { activo: false })]);
    renderizarApp('/catalogo', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Catálogo' });
    await within(tabla).findByText('Paracetamol');
    esChipEstado(chipDe(tabla, 'Activo'), ...ESPERABLE);
    esChipEstado(chipDe(tabla, 'Dado de baja'), ...CERRADO);
    sinVerde(tabla);
  });
});

describe('gestión biométrica: el estado del rostro es un ChipEstado', () => {
  it('Registrado es discreto y Sin registrar pide atención', async () => {
    const persona = (id: number, apellido: string, registrado: boolean) => ({
      id,
      nombreUsuario: `u${id}`,
      nombre: 'Lucía',
      apellido,
      rol: 'Enfermero',
      registrado,
      actualizadoEn: registrado ? '2026-10-07T12:00:00.000Z' : null,
    });
    servidor.use(
      http.get('*/api/biometria/usuarios', () =>
        HttpResponse.json({ data: [persona(3, 'Acosta', true), persona(4, 'Gómez', false)] }),
      ),
    );
    renderizarApp('/biometria', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Personal' });
    await within(tabla).findByText('Acosta, Lucía');
    esChipEstado(chipDe(tabla, 'Registrado'), ...ESPERABLE);
    esChipEstado(chipDe(tabla, 'Sin registrar'), ...ATENCION);
    sinVerde(tabla);
  });
});

describe('historial de suministros: el estado del registro es un ChipEstado', () => {
  beforeEach(prepararSuministros);
  afterEach(() => vi.unstubAllEnvs());

  it('Validado es discreto y Corregido es un hecho a tener en cuenta (contorno informativo)', async () => {
    servidor.use(
      http.get('*/api/suministros', () =>
        HttpResponse.json({
          data: [
            suministro({ id: 90 }),
            suministro({ id: 91, corregido: true, motivoCorreccion: 'Media dosis' }),
          ],
          meta: { pagina: 1, porPagina: 20, total: 2, totalPaginas: 1 },
        }),
      ),
    );
    renderizarApp('/suministros', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Suministros' });
    await within(tabla).findByText('Validado');
    esChipEstado(chipDe(tabla, 'Validado'), ...ESPERABLE);
    esChipEstado(chipDe(tabla, 'Corregido'), 'MuiChip-outlined', 'MuiChip-colorInfo');
    sinVerde(tabla);
  });
});

describe('estado de la toma: la ficha y Administrar muestran lo mismo', () => {
  const ahora = new Date(AHORA);
  const enMinutos = (m: number) => new Date(ahora.getTime() + m * 60_000).toISOString();

  /** Una prescripción en cada punto de la toma, respecto de `AHORA`. */
  const CASOS: [string, Prescripcion][] = [
    [
      'ya dada',
      prescripcion({
        proximaToma: enMinutos(470),
        ultimasAdministraciones: [
          { id: 1, fechaHora: enMinutos(-10), cantidad: 500, usuario: 'Acosta, Sofía' },
        ],
      }),
    ],
    ['toca ahora', prescripcion({ proximaToma: enMinutos(10), ultimasAdministraciones: [] })],
    ['atrasada', prescripcion({ proximaToma: enMinutos(-60), ultimasAdministraciones: [] })],
    ['falta', prescripcion({ proximaToma: enMinutos(185), ultimasAdministraciones: [] })],
    ['sin más tomas', prescripcion({ proximaToma: null, ultimasAdministraciones: [] })],
  ];

  const conTema = (ui: ReactElement) => render(<ThemeProvider theme={tema}>{ui}</ThemeProvider>);

  /** Las clases de MUI del chip y si lleva ícono: lo que se ve, sin los hashes de emotion. */
  const aspecto = (chip: Element) => ({
    clases: [...chip.classList].filter((c) => c.startsWith('MuiChip-')).sort(),
    icono: chip.querySelector('[data-testid="HistoryOutlinedIcon"]') !== null,
  });

  it('una toma ya dada va con contorno, color de advertencia y el ícono de historial', () => {
    conTema(<ChipEstadoToma prescripcion={CASOS[0]![1]} ahora={ahora} />);

    const chip = screen.getByText(/Ya se dio a las/).closest('.MuiChip-root') as HTMLElement;
    expect(chip).toHaveClass('MuiChip-outlined', 'MuiChip-colorWarning');
    expect(chip).not.toHaveClass('MuiChip-filled');
    expect(chip).not.toHaveClass('MuiChip-colorSuccess');
    expect(within(chip).getByTestId('HistoryOutlinedIcon')).toBeInTheDocument();
  });

  it('lo que toca o está atrasado va relleno; lo que falta, con contorno neutro y sin ícono', () => {
    conTema(
      <>
        <ChipEstadoToma prescripcion={CASOS[1]![1]} ahora={ahora} />
        <ChipEstadoToma prescripcion={CASOS[2]![1]} ahora={ahora} />
        <ChipEstadoToma prescripcion={CASOS[3]![1]} ahora={ahora} />
      </>,
    );

    const ahoraChip = screen.getByText('Toca ahora').closest('.MuiChip-root');
    expect(ahoraChip).toHaveClass('MuiChip-filled', 'MuiChip-colorPrimary');
    const atrasada = screen.getByText(/^Atrasada/).closest('.MuiChip-root');
    expect(atrasada).toHaveClass('MuiChip-filled', 'MuiChip-colorWarning');
    const falta = screen.getByText(/^Faltan/).closest('.MuiChip-root');
    expect(falta).toHaveClass('MuiChip-outlined', 'MuiChip-colorDefault');
    expect(screen.queryByTestId('HistoryOutlinedIcon')).not.toBeInTheDocument();
  });

  it.each(CASOS)(
    'toma «%s»: el chip de la ficha es igual al de la tarjeta de Administrar',
    (_n, p) => {
      const { container: ficha } = conTema(
        <ChipEstadoToma prescripcion={p} ahora={ahora} tamano="medium" />,
      );
      const deLaFicha = aspecto(ficha.querySelector('.MuiChip-root')!);
      const { container: tarjeta } = conTema(
        <TarjetaPrescripcion p={p} elegida={false} ahora={ahora} alElegir={() => {}} />,
      );
      const deLaTarjeta = aspecto(tarjeta.querySelector('.MuiChip-root')!);

      expect(deLaFicha).toEqual(deLaTarjeta);
    },
  );

  it('una prescripción que no está vigente no muestra estado de toma', () => {
    const { container } = conTema(
      <ChipEstadoToma
        prescripcion={prescripcion({ estado: 'SUSPENDIDA', proximaToma: null })}
        ahora={ahora}
      />,
    );
    expect(container.querySelector('.MuiChip-root')).toBeNull();
  });
});
