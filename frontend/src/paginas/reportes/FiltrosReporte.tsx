import { useId } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { mensajeDeError } from '../../api/cliente';
import { useSalas } from '../../api/pacientes';
import { CampoTexto } from '../../componentes/CampoTexto';
import { Selector } from '../../componentes/Selector';
import { TAMANO_TACTIL_MINIMO } from '../../tema';
import { AGRUPACIONES, OPCIONES_TIPO } from './etiquetas';
import { ATAJOS, type Atajo } from './periodo';
import type { ParametrosReporte } from './useParametrosReporte';

interface Props {
  parametros: ParametrosReporte;
  /** Solo el reporte se agrupa; las estadísticas no. */
  conAgrupacion: boolean;
  /** Lo que respondió el servidor sobre las fechas (un 400 que igual llegó). */
  erroresServidor?: { desde?: string; hasta?: string };
}

/**
 * Parámetros de los reportes: período con atajos y fechas, sala, tipo y, en el reporte, la
 * agrupación. Todo vive en la URL. En teléfono van apilados; en tablet de a dos; en pantalla ancha
 * en una sola fila. El atajo marcado se ve por el relleno y por la tilde, no solo por el color.
 */
export function FiltrosReporte({ parametros, conAgrupacion, erroresServidor = {} }: Props) {
  const idPeriodo = useId();
  const salas = useSalas();
  const { efectivo, errores, valores } = parametros;

  return (
    <Box role="search" aria-label="Filtros" sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Typography id={idPeriodo} component="span" sx={{ fontWeight: 700 }}>
          Período
        </Typography>
        <ToggleButtonGroup
          aria-labelledby={idPeriodo}
          exclusive
          value={efectivo.atajo}
          onChange={(_e, atajo: Atajo | null) => atajo && parametros.elegirAtajo(atajo)}
        >
          {ATAJOS.map((a) => (
            <ToggleButton
              key={a.valor}
              value={a.valor}
              sx={{
                minHeight: TAMANO_TACTIL_MINIMO,
                minWidth: TAMANO_TACTIL_MINIMO,
                px: 2,
                gap: 0.5,
              }}
            >
              {efectivo.atajo === a.valor && <CheckIcon fontSize="small" aria-hidden />}
              {a.etiqueta}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: `repeat(${conAgrupacion ? 5 : 4}, minmax(0, 1fr))`,
          },
        }}
      >
        <CampoTexto
          etiqueta="Desde"
          type="date"
          valor={efectivo.desde}
          alCambiar={(v) => parametros.cambiarFecha('desde', v)}
          error={errores.desde ?? erroresServidor.desde}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: parametros.hoy } }}
        />
        <CampoTexto
          etiqueta="Hasta"
          type="date"
          valor={efectivo.hasta}
          alCambiar={(v) => parametros.cambiarFecha('hasta', v)}
          error={errores.hasta ?? erroresServidor.hasta}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: parametros.hoy } }}
        />
        <Selector
          etiqueta="Sala"
          valor={valores.salaId}
          alCambiar={(v) => parametros.fijar({ salaId: v })}
          textoVacio={salas.isLoading ? 'Cargando salas…' : 'Todas'}
          opciones={(salas.data ?? []).map((s) => ({ valor: String(s.id), etiqueta: s.nombre }))}
          error={
            salas.isError
              ? `No se pudo cargar la lista de salas. ${mensajeDeError(salas.error)}`
              : undefined
          }
          alReintentar={() => void salas.refetch()}
          reintentando={salas.isFetching}
        />
        <Selector
          etiqueta="Tipo"
          valor={valores.tipo}
          alCambiar={(v) => parametros.fijar({ tipo: v })}
          opciones={OPCIONES_TIPO}
        />
        {conAgrupacion && (
          <Selector
            etiqueta="Agrupar por"
            valor={parametros.agruparPor}
            alCambiar={(v) => parametros.fijar({ agruparPor: v })}
            opciones={AGRUPACIONES}
          />
        )}
      </Box>
    </Box>
  );
}
