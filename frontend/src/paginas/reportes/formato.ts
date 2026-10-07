// Números de los reportes como se leen en Argentina: sin separador de miles y con coma decimal.

const NBSP = String.fromCharCode(160);

const conDecimales = (n: number, decimales: number) =>
  n.toLocaleString('es-AR', { useGrouping: false, maximumFractionDigits: decimales });

/** Una cantidad, con hasta 3 decimales como la dosis: 1006 → "1006"; 2.25 → "2,25". */
export const numero = (n: number) => conDecimales(n, 3);

/** 37.5 → "37,5 %": un decimal, con el número y el signo sin cortes. */
export const porcentaje = (n: number) => `${conDecimales(n, 1)}${NBSP}%`;

/** 'AAAA-MM-DD' → 'DD/MM', para los ejes (el año ya está en el período). */
export const diaYMes = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
