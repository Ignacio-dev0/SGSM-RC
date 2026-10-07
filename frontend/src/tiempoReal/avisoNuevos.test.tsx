// Aviso de recordatorios nuevos: cuándo se cierra solo (E5-06) y dónde se anuncia (E5-05).
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Dialog, DialogTitle, ThemeProvider } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import { tema } from '../tema';
import { AvisoNuevos, RegionAvisos, type Aviso } from './AvisoNuevos';

const AVISO: Aviso = { texto: '2 recordatorios nuevos', id: 1 };

/** El aviso y, si se pide, un diálogo de MUI que se abre y se cierra desde la prueba. */
function Pantalla({
  fijo = false,
  alCerrar,
  conDialogo = false,
}: {
  fijo?: boolean;
  alCerrar: () => void;
  conDialogo?: boolean;
}) {
  const [abierto, setAbierto] = useState(conDialogo);
  return (
    <ThemeProvider theme={tema}>
      <MemoryRouter>
        <AvisoNuevos aviso={AVISO} alCerrar={alCerrar} fijo={fijo} />
        <RegionAvisos aviso={AVISO} />
        <button onClick={() => setAbierto(true)}>Abrir diálogo</button>
        <Dialog open={abierto} onClose={() => setAbierto(false)} transitionDuration={0}>
          <DialogTitle>Un diálogo</DialogTitle>
          <button onClick={() => setAbierto(false)}>Cerrar el diálogo</button>
        </Dialog>
      </MemoryRouter>
    </ThemeProvider>
  );
}

const region = () =>
  document.querySelector<HTMLElement>('[aria-live="polite"][data-avisos-recordatorios]')!;
/** Deja correr los observadores del DOM (microtareas) y lo que programaron. */
const asentar = () => act(async () => {});

describe('cierre automático del aviso (E5-06)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('se cierra solo a los 15 s', () => {
    const alCerrar = vi.fn();
    render(<Pantalla alCerrar={alCerrar} />);

    act(() => vi.advanceTimersByTime(14_999));
    expect(alCerrar).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it('no se cierra mientras el puntero está encima; al salir vuelve a contar', () => {
    const alCerrar = vi.fn();
    render(<Pantalla alCerrar={alCerrar} />);
    const aviso = screen.getByRole('group', { name: 'Recordatorios nuevos' });

    fireEvent.pointerEnter(aviso);
    act(() => vi.advanceTimersByTime(60_000));
    expect(alCerrar).not.toHaveBeenCalled();

    fireEvent.pointerLeave(aviso);
    act(() => vi.advanceTimersByTime(15_000));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it('no se cierra mientras el foco está adentro (por ejemplo, en "Ver recordatorios")', () => {
    const alCerrar = vi.fn();
    render(<Pantalla alCerrar={alCerrar} />);
    const ver = screen.getByRole('button', { name: 'Ver recordatorios' });

    act(() => ver.focus());
    act(() => vi.advanceTimersByTime(60_000));
    expect(alCerrar).not.toHaveBeenCalled();

    act(() => ver.blur());
    act(() => vi.advanceTimersByTime(15_000));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it('si hay urgentes queda hasta que se lo cierre', () => {
    const alCerrar = vi.fn();
    render(<Pantalla alCerrar={alCerrar} fijo />);

    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(alCerrar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el aviso' }));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it('mientras hay un diálogo abierto (lo tapa) no corre; al cerrarlo, recién ahí cuenta 15 s', async () => {
    const alCerrar = vi.fn();
    render(<Pantalla alCerrar={alCerrar} conDialogo />);
    await asentar();

    act(() => vi.advanceTimersByTime(60_000));
    expect(alCerrar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el diálogo' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await asentar();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(14_000));
    expect(alCerrar).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_000));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });
});

describe('dónde se anuncia el aviso (E5-05)', () => {
  it('la región aria-live vive fuera de la aplicación, directo en el body', () => {
    render(<Pantalla alCerrar={() => {}} />);

    expect(region().parentElement).toBe(document.body);
    expect(region()).toHaveTextContent('2 recordatorios nuevos');
  });

  it('con un diálogo abierto se anuncia desde adentro del diálogo, y nunca queda oculta', async () => {
    render(<Pantalla alCerrar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir diálogo' }));
    await asentar();

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toContainElement(region());
    expect(region().closest('[aria-hidden="true"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el diálogo' }));
    await asentar();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(region().parentElement).toBe(document.body);
    expect(region().closest('[aria-hidden="true"]')).toBeNull();
  });

  it('si MUI marca el body como oculto (un menú en cajón), la región se vuelve a mostrar', async () => {
    render(<Pantalla alCerrar={() => {}} />);

    act(() => region().setAttribute('aria-hidden', 'true'));
    await asentar();

    expect(region()).not.toHaveAttribute('aria-hidden');
  });
});
