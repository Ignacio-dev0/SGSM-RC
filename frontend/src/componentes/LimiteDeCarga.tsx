import { Component, type ReactNode } from 'react';
import { Alerta } from './Alerta';
import { Boton } from './Boton';
import { ErrorDeCargaDePantalla } from './cargaDiferida';

interface Props {
  /** La ruta abierta: al cambiar, se vuelve a intentar mostrar la pantalla. */
  clave: string;
  /** Por defecto recarga la página, que trae también la versión nueva si la hubo. */
  alReintentar?: () => void;
  children: ReactNode;
}

interface Estado {
  error: { valor: unknown } | null;
  clave: string;
}

const recargarPagina = () => window.location.reload();

/**
 * Límite de error de las pantallas diferidas (T702): si no llegó su código, lo dice en vez de
 * dejar la pantalla en blanco y ofrece Reintentar. El menú y la barra quedan a mano. Cualquier
 * otro error sigue de largo, para no disfrazarlo de falla de la red.
 */
export class LimiteDeCarga extends Component<Props, Estado> {
  override state: Estado = { error: null, clave: this.props.clave };

  static getDerivedStateFromError(valor: unknown): Partial<Estado> {
    return { error: { valor } };
  }

  static getDerivedStateFromProps(props: Props, estado: Estado): Partial<Estado> | null {
    // Otra ruta: se olvida el error de la anterior.
    return props.clave === estado.clave ? null : { error: null, clave: props.clave };
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (!(error.valor instanceof ErrorDeCargaDePantalla)) throw error.valor;
    return (
      <Alerta
        tipo="error"
        titulo="No se pudo abrir esta pantalla"
        accion={
          <Boton variante="texto" onClick={this.props.alReintentar ?? recargarPagina}>
            Reintentar
          </Boton>
        }
      >
        Puede que se haya cortado la conexión con el servidor o que haya una versión nueva del
        sistema. Reintentar vuelve a cargar la página.
      </Alerta>
    );
  }
}
