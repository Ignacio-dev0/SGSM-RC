// Números de los reportes como se leen en Argentina: sin separador de miles y con coma decimal.

const NBSP = String.fromCharCode(160);

/** 1006 → "1006"; 0.5 → "0,5". */
export const numero = (n: number) =>
  n.toLocaleString('es-AR', { useGrouping: false, maximumFractionDigits: 1 });

/** 37.5 → "37,5 %", con el número y el signo sin cortes. */
export const porcentaje = (n: number) => `${numero(n)}${NBSP}%`;

/** 'AAAA-MM-DD' → 'DD/MM', para los ejes (el año ya está en el período). */
export const diaYMes = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
