import { Component, type ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorDeCargaDePantalla } from './cargaDiferida';
import { LimiteDeCarga } from './LimiteDeCarga';

function Falla({ error }: { error: unknown }): ReactNode {
  throw error;
}

/** Otro límite por encima, para ver que los errores que no son de descarga siguen de largo. */
class LimiteExterno extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    return this.state.error ? (
      <p>Error externo: {this.state.error.message}</p>
    ) : (
      this.props.children
    );
  }
}

const descargaFallida = () =>
  new ErrorDeCargaDePantalla(
    new TypeError('Failed to fetch dynamically imported module: /assets/Reportes-abc.js'),
  );

describe('LimiteDeCarga: si no llega el código de una pantalla (T702)', () => {
  // React informa por consola cada error que atrapa un límite: acá son esperados.
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('explica qué pasó y ofrece Reintentar, que vuelve a cargar la página', async () => {
    const reintentar = vi.fn();
    render(
      <LimiteDeCarga clave="/reportes" alReintentar={reintentar}>
        <Falla error={descargaFallida()} />
      </LimiteDeCarga>,
    );

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('No se pudo abrir esta pantalla');
    expect(alerta).toHaveTextContent(/conexión con el servidor/);
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(reintentar).toHaveBeenCalledTimes(1);
  });

  it('cualquier otro error sigue de largo: no se disfraza de falla de la red', () => {
    render(
      <LimiteExterno>
        <LimiteDeCarga clave="/reportes">
          <Falla error={new Error('dato inesperado')} />
        </LimiteDeCarga>
      </LimiteExterno>,
    );

    expect(screen.getByText('Error externo: dato inesperado')).toBeInTheDocument();
    expect(screen.queryByText(/No se pudo abrir esta pantalla/)).not.toBeInTheDocument();
  });

  it('al ir a otra pantalla deja de mostrar el aviso', () => {
    const { rerender } = render(
      <LimiteDeCarga clave="/reportes">
        <Falla error={descargaFallida()} />
      </LimiteDeCarga>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <LimiteDeCarga clave="/">
        <p>Inicio</p>
      </LimiteDeCarga>,
    );
    expect(screen.getByText('Inicio')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
