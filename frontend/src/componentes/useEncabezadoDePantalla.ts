import { useEffect, useRef } from 'react';
import type { SxProps, Theme } from '@mui/material';

/** Nombre del sistema al final del título de cada pantalla. */
const SISTEMA = 'SGSM-RC';

/**
 * Estilo del título que recibe el foco al abrir la pantalla: no es un control, así que no lleva
 * recuadro (ni siquiera con :focus-visible, que el navegador activa al enfocar por programa), y
 * deja lugar a la barra superior y a la franja de aviso si hay que desplazarlo a la vista.
 */
export const ESTILO_TITULO_ENFOCABLE = {
  '&:focus, &:focus-visible': { outline: 'none' },
  scrollMarginTop: 96,
} satisfies SxProps<Theme>;

/**
 * Al abrir una pantalla: pone su título en el del documento (WCAG 2.4.2) y lleva el foco a su
 * encabezado principal, para que el lector de pantalla y el teclado sepan que cambió el contenido
 * (UX-14). Devuelve la referencia que va en el `<h1>`, que debe tener `tabIndex={-1}`.
 */
export function useEncabezadoDePantalla(titulo: string) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const anterior = document.title;
    document.title = `${titulo} · ${SISTEMA}`;
    return () => {
      document.title = anterior;
    };
  }, [titulo]);

  useEffect(() => {
    const activo = document.activeElement;
    // Si la pantalla ya puso el foco en un control de su contenido (autoFocus), se lo respeta.
    if (activo instanceof HTMLElement && activo !== document.body && activo.closest('main')) return;
    ref.current?.focus();
  }, [titulo]);

  return ref;
}
