import { createContext, useContext } from 'react';
import type { EstadoConexion } from './conexion';

export interface ValorTiempoReal {
  /** 'inactivo' si la sesión no tiene `recordatorios.ver` (no se conecta). */
  estado: EstadoConexion | 'inactivo';
  /**
   * Hora del servidor menos hora de la tablet, en ms (R6). "Faltan 12 min" se calcula con
   * `Date.now() + desfaseMs`, para no depender del reloj de la tablet.
   */
  desfaseMs: number;
  /** Si los avisos suenan y vibran en esta tablet. */
  sonido: boolean;
  fijarSonido: (activo: boolean) => void;
}

const SIN_PROVEEDOR: ValorTiempoReal = {
  estado: 'inactivo',
  desfaseMs: 0,
  sonido: false,
  fijarSonido: () => {},
};

export const ContextoTiempoReal = createContext<ValorTiempoReal>(SIN_PROVEEDOR);

/** Estado del tiempo real de recordatorios (lo da ProveedorTiempoReal, en la plantilla). */
export const useTiempoReal = () => useContext(ContextoTiempoReal);
