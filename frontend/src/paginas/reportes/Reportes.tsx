import { useId } from 'react';
import { Box, Tab, Tabs } from '@mui/material';
import { useLocation, useSearchParams } from 'react-router-dom';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Estadisticas } from './Estadisticas';
import { ReporteSuministros } from './ReporteSuministros';
import { useParametrosReporte } from './useParametrosReporte';

const PESTANAS = ['suministros', 'estadisticas'] as const;
type Pestana = (typeof PESTANAS)[number];

const ETIQUETAS_PESTANA: Record<Pestana, string> = {
  suministros: 'Suministros',
  estadisticas: 'Estadísticas',
};

/**
 * Reportes (E6 · T605–T606 · CU32–CU34): el reporte de suministros agrupado y las estadísticas del
 * mismo período. Los parámetros (período, sala, tipo, agrupación) y la pestaña viven en la URL y
 * los comparten las dos pestañas: cambiar de una a otra no pierde lo elegido.
 */
export function Reportes() {
  const parametros = useParametrosReporte();
  const [busqueda, fijarBusqueda] = useSearchParams();
  const ubicacion = useLocation();
  const pedida = busqueda.get('pestana') as Pestana;
  const pestana: Pestana = PESTANAS.includes(pedida) ? pedida : 'suministros';
  // Cada pestaña y su panel se refieren entre sí (WAI-ARIA tabs).
  const base = useId();
  const idPestana = (v: Pestana) => `${base}-pestana-${v}`;
  const idPanel = (v: Pestana) => `${base}-panel-${v}`;

  const elegirPestana = (v: Pestana) => {
    const siguiente = new URLSearchParams(busqueda);
    if (v === 'suministros') siguiente.delete('pestana');
    else siguiente.set('pestana', v);
    fijarBusqueda(siguiente, { replace: true, state: ubicacion.state });
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Reportes"
        subtitulo="Medicamentos e insumos registrados en un período"
      />
      <Tabs
        value={pestana}
        aria-label="Secciones de los reportes"
        onChange={(_e, v: Pestana) => elegirPestana(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {PESTANAS.map((v) => (
          <Tab
            key={v}
            value={v}
            label={ETIQUETAS_PESTANA[v]}
            id={idPestana(v)}
            aria-controls={idPanel(v)}
          />
        ))}
      </Tabs>
      {/* Solo el panel de la pestaña activa está en la página: la otra no pide datos. */}
      <Box role="tabpanel" id={idPanel(pestana)} aria-labelledby={idPestana(pestana)}>
        {pestana === 'suministros' && <ReporteSuministros parametros={parametros} />}
        {pestana === 'estadisticas' && <Estadisticas parametros={parametros} />}
      </Box>
    </>
  );
}
