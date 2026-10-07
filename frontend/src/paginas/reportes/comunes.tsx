import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { ErrorApi, erroresPorCampo } from '../../api/cliente';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import type { useDescarga } from './Descargas';

const conPunto = (texto: string) => (/[.!?]$/.test(texto) ? texto : `${texto}.`);

/**
 * Por qué no hay reporte. Un 400 o un 404 dicen qué corregir (la sala no existe, el período es
 * largo): sin Reintentar, que daría lo mismo, pero con "Quitar filtros" si hay filtros (E6-16).
 * Lo demás (el servidor, la red) se puede reintentar.
 */
export function ErrorDelReporte({
  que,
  error,
  alReintentar,
  alQuitarFiltros,
}: {
  /** Qué no se pudo armar, con artículo: "el reporte de suministros". */
  que: string;
  error: unknown;
  alReintentar: () => void;
  /** Solo si hay filtros que quitar. */
  alQuitarFiltros?: (() => void) | undefined;
}) {
  if (error instanceof ErrorApi && (error.estado === 400 || error.estado === 404)) {
    const { desde, hasta, ...otros } = erroresPorCampo(error);
    const mensajes = Object.values(otros);
    let texto = error.message;
    if (mensajes.length > 0) texto = mensajes.map(conPunto).join(' ');
    else if (desde || hasta) texto = 'Revise las fechas del período.';
    const verbo = /^(los|las) /.test(que) ? 'pudieron' : 'pudo';
    return (
      <Alerta
        tipo="error"
        accion={
          alQuitarFiltros && (
            <Boton variante="texto" onClick={alQuitarFiltros}>
              Quitar filtros
            </Boton>
          )
        }
      >{`No se ${verbo} armar ${que}. ${conPunto(texto)}`}</Alerta>
    );
  }
  return <ErrorDeCarga que={que} error={error} alReintentar={alReintentar} />;
}

/**
 * Fila de arriba de los resultados: qué período, sala y tipo se están mostrando (los del servidor,
 * ya normalizados) y, a la derecha, las descargas.
 */
export function ResumenYDescargas({
  resumen,
  acciones,
}: {
  resumen: string;
  acciones?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        mb: 2,
      }}
    >
      <Typography sx={{ fontWeight: 700 }}>{resumen}</Typography>
      {acciones}
    </Box>
  );
}

/** "Quitar filtros" debajo de un resultado vacío, cuando hay algo que quitar. */
export function QuitarFiltros({ alQuitar }: { alQuitar: () => void }) {
  return (
    <Box
      role="group"
      aria-label="Qué puede hacer ahora"
      sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}
    >
      <Boton variante="secundario" onClick={alQuitar}>
        Quitar filtros
      </Boton>
    </Box>
  );
}

/** Mientras el período tiene un error, no hay resultados que mostrar (ni unos viejos). */
export const PeriodoACorregir = ({ que }: { que: string }) => (
  <Typography color="text.secondary" sx={{ py: 2 }}>
    Corrija el período para ver {que}.
  </Typography>
);

/**
 * Lo que va donde se descarga (E6-15): los botones si hay algo para bajar (o si una descarga sigue
 * en curso, aunque hayan cambiado los filtros); si no hay datos, lo dice; y a quien no descarga
 * (el médico, decisión del lead) le dice a quién pedírselo.
 */
export function AccionesDeDescarga({
  puedeExportar,
  hayDatos,
  actualizando,
  descarga,
}: {
  puedeExportar: boolean;
  hayDatos: boolean;
  /** Lo que se ve es el resultado anterior mientras llega el nuevo. */
  actualizando: boolean;
  descarga: ReturnType<typeof useDescarga>;
}) {
  const nota = (texto: string) => (
    <Typography variant="body2" color="text.secondary">
      {texto}
    </Typography>
  );
  if (!puedeExportar) return nota('Para descargar el archivo, pídaselo a un administrador.');
  if (descarga.enCurso || (hayDatos && !actualizando)) return descarga.botones;
  if (!hayDatos && !actualizando) return nota('No hay datos para descargar en este período');
  return null;
}
