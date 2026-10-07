import { useId } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { mensajeDeError } from '../../api/cliente';
import { useSalas } from '../../api/pacientes';
import { CampoTexto } from '../../componentes/CampoTexto';
import { Selector } from '../../componentes/Selector';
import { TAMANO_TACTIL_MINIMO } from '../../tema';
import { AGRUPACIONES, OPCIONES_TIPO } from './etiquetas';
import { ATAJOS, enPalabrasDeLaPersona, type Atajo, type CampoFecha } from './periodo';
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
  const opcionesSala = (salas.data ?? []).map((s) => ({ valor: String(s.id), etiqueta: s.nombre }));
  // E6-16: la sala de un enlace viejo se ve aunque ya no exista (así se entiende el 404).
  if (valores.salaId && !opcionesSala.some((o) => o.valor === valores.salaId)) {
    opcionesSala.push({
      valor: valores.salaId,
      etiqueta: `Sala n.º ${valores.salaId}${salas.isSuccess ? ' (no existe)' : ''}`,
    });
  }

  /** Una fecha: se escribe sin pedir nada y se confirma al salir del campo o con Enter (E6-13). */
  const campoFecha = (campo: CampoFecha, etiqueta: string) => (
    <CampoTexto
      etiqueta={etiqueta}
      type="date"
      valor={parametros.valorDeFecha(campo)}
      alCambiar={(v) => parametros.escribirFecha(campo, v)}
      onBlur={() => parametros.confirmarFecha(campo)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') parametros.confirmarFecha(campo);
      }}
      error={errores[campo] ?? enPalabrasDeLaPersona(erroresServidor[campo])}
      slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: parametros.hoy } }}
    />
  );

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
        {campoFecha('desde', 'Desde')}
        {campoFecha('hasta', 'Hasta')}
        <Selector
          etiqueta="Sala"
          valor={valores.salaId}
          alCambiar={(v) => parametros.fijar({ salaId: v })}
          textoVacio={salas.isLoading ? 'Cargando salas…' : 'Todas'}
          opciones={opcionesSala}
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
