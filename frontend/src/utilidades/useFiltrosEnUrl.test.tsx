import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { InitialEntry } from 'react-router-dom';
import { useFiltrosEnUrl } from './useFiltrosEnUrl';

const POR_DEFECTO = { texto: '', estado: 'INTERNADO' };

/** Pantalla mínima que usa el hook y deja ver la URL, para probarlo sin una pantalla real. */
function Pantalla() {
  const f = useFiltrosEnUrl(POR_DEFECTO);
  const ubicacion = useLocation();
  const navegar = useNavigate();
  return (
    <>
      <input
        aria-label="Texto"
        value={f.valores.texto}
        onChange={(e) => f.fijar({ texto: e.target.value })}
      />
      <select
        aria-label="Estado"
        value={f.valores.estado}
        onChange={(e) => f.fijar({ estado: e.target.value })}
      >
        <option value="INTERNADO">Internados</option>
        <option value="EGRESADO">Egresados</option>
        <option value="">Todos</option>
      </select>
      <p data-testid="ruta">{ubicacion.pathname}</p>
      <p data-testid="busqueda">{ubicacion.search}</p>
      <p data-testid="estado-navegacion">{JSON.stringify(ubicacion.state)}</p>
      <p data-testid="pagina">{f.pagina}</p>
      <p data-testid="hay-filtros">{String(f.hayFiltros())}</p>
      <button onClick={() => f.irAPagina(3)}>Ir a la página 3</button>
      <button onClick={f.quitarFiltros}>Quitar</button>
      <button onClick={() => navegar(-1)}>Atrás</button>
      <Link to="/lista?texto=desde-enlace&pagina=2">Enlace</Link>
    </>
  );
}

function montar(...entradas: InitialEntry[]) {
  return render(
    <MemoryRouter initialEntries={entradas} initialIndex={entradas.length - 1}>
      <Routes>
        <Route path="*" element={<Pantalla />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Los parámetros de la URL actual, para comparar sin depender del orden. */
const parametros = () => new URLSearchParams(screen.getByTestId('busqueda').textContent ?? '');

describe('useFiltrosEnUrl', () => {
  it('sin parámetros en la URL usa los valores por defecto y no la ensucia', () => {
    montar('/lista');
    expect(screen.getByLabelText('Texto')).toHaveValue('');
    expect(screen.getByLabelText('Estado')).toHaveValue('INTERNADO');
    expect(screen.getByTestId('pagina')).toHaveTextContent('1');
    expect(screen.getByTestId('busqueda')).toBeEmptyDOMElement();
  });

  it('lee los filtros y la página de la URL, y un valor vacío cuenta como valor (no como ausente)', () => {
    montar('/lista?texto=a-01&estado=&pagina=2');
    expect(screen.getByLabelText('Texto')).toHaveValue('a-01');
    expect(screen.getByLabelText('Estado')).toHaveValue('');
    expect(screen.getByTestId('pagina')).toHaveTextContent('2');
  });

  it('escribe el cambio en la URL y, al cambiar un filtro, vuelve a la página 1', async () => {
    montar('/lista?pagina=3');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Egresados');
    expect(parametros().get('estado')).toBe('EGRESADO');
    expect(parametros().has('pagina')).toBe(false);
    expect(screen.getByTestId('pagina')).toHaveTextContent('1');
  });

  it('guarda "Todos" (vacío) cuando el valor por defecto no lo es, y no guarda lo que vale lo mismo que el defecto', async () => {
    montar('/lista');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Todos');
    expect(screen.getByTestId('busqueda')).toHaveTextContent('?estado=');
    expect(parametros().get('estado')).toBe('');

    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Internados');
    expect(screen.getByTestId('busqueda')).toBeEmptyDOMElement();
  });

  it('escribir seguido no pierde letras y la URL queda con lo escrito', async () => {
    montar('/lista');
    await userEvent.type(screen.getByLabelText('Texto'), 'a-01');
    expect(screen.getByLabelText('Texto')).toHaveValue('a-01');
    expect(parametros().get('texto')).toBe('a-01');
  });

  it('reemplaza la entrada del historial: Atrás sale de la pantalla, no deshace cada tecla', async () => {
    montar('/anterior', '/lista');
    await userEvent.type(screen.getByLabelText('Texto'), 'abc');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Egresados');
    await userEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByTestId('ruta')).toHaveTextContent('/anterior');
  });

  it('irAPagina escribe la página, y la página 1 no se escribe', async () => {
    montar('/lista');
    await userEvent.click(screen.getByRole('button', { name: 'Ir a la página 3' }));
    expect(parametros().get('pagina')).toBe('3');
    expect(screen.getByTestId('pagina')).toHaveTextContent('3');
  });

  it.each(['abc', '0', '-2', '1.5'])(
    'una página inválida en la URL (%s) cuenta como la primera',
    (p) => {
      montar(`/lista?pagina=${p}`);
      expect(screen.getByTestId('pagina')).toHaveTextContent('1');
    },
  );

  it('hayFiltros avisa si algo difiere de los valores por defecto', async () => {
    montar('/lista');
    expect(screen.getByTestId('hay-filtros')).toHaveTextContent('false');
    await userEvent.type(screen.getByLabelText('Texto'), 'x');
    expect(screen.getByTestId('hay-filtros')).toHaveTextContent('true');
  });

  it('la página sola no cuenta como filtro', () => {
    montar('/lista?pagina=2');
    expect(screen.getByTestId('hay-filtros')).toHaveTextContent('false');
  });

  it('quitarFiltros vuelve a los valores por defecto, a la página 1 y limpia la URL', async () => {
    montar('/lista?texto=a-01&estado=EGRESADO&pagina=2');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(screen.getByLabelText('Texto')).toHaveValue('');
    expect(screen.getByLabelText('Estado')).toHaveValue('INTERNADO');
    expect(screen.getByTestId('pagina')).toHaveTextContent('1');
    expect(screen.getByTestId('busqueda')).toBeEmptyDOMElement();
  });

  it('conserva el estado de la navegación (por ejemplo el aviso que dejó otra pantalla)', async () => {
    montar({ pathname: '/lista', state: { aviso: 'Usuario creado' } });
    await userEvent.type(screen.getByLabelText('Texto'), 'a');
    expect(screen.getByTestId('estado-navegacion')).toHaveTextContent('{"aviso":"Usuario creado"}');
  });

  it('conserva los parámetros de la URL que no son filtros', async () => {
    montar('/lista?otro=1');
    await userEvent.type(screen.getByLabelText('Texto'), 'a');
    expect(parametros().get('otro')).toBe('1');
    expect(parametros().get('texto')).toBe('a');
  });

  it('adopta los filtros de un enlace a la misma pantalla', async () => {
    montar('/lista');
    await userEvent.click(screen.getByRole('link', { name: 'Enlace' }));
    expect(screen.getByLabelText('Texto')).toHaveValue('desde-enlace');
    expect(screen.getByTestId('pagina')).toHaveTextContent('2');
  });
});
