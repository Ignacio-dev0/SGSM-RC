import { Fragment, useId } from 'react';
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChangeCircleOutlinedIcon from '@mui/icons-material/ChangeCircleOutlined';
import type { EntradaAuditoria } from '../../api/auditoria';
import { Boton } from '../../componentes/Boton';
import { tinte } from '../../tema';
import { formatearFechaHora } from '../../utilidades/formato';
import { compararValores, textoDeValor, type FilaComparacion } from './comparacion';
import { accionEnPalabras, entidadConId, nombreDeCampo, pacienteConDni } from './palabras';

/** Un valor guardado, legible: simple en una línea; un objeto como pares; una lista numerada. */
function Valor({ valor }: { valor: unknown }) {
  const texto = textoDeValor(valor);
  if (texto === 'Sin valor') {
    return (
      <Typography component="span" color="text.secondary">
        Sin valor
      </Typography>
    );
  }
  if (texto !== null)
    return (
      <Box component="span" sx={{ overflowWrap: 'anywhere' }}>
        {texto}
      </Box>
    );
  if (Array.isArray(valor)) {
    return (
      <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
        {valor.map((v, i) => (
          <li key={i}>
            <Valor valor={v} />
          </li>
        ))}
      </Box>
    );
  }
  return (
    <Box
      component="dl"
      sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 1 }}
    >
      {Object.entries(valor as Record<string, unknown>).map(([clave, v]) => (
        <Fragment key={clave}>
          <Box component="dt" sx={{ fontWeight: 700 }}>
            {nombreDeCampo(clave)}:{' '}
          </Box>
          <Box component="dd" sx={{ m: 0, minWidth: 0 }}>
            <Valor valor={v} />
          </Box>
        </Fragment>
      ))}
    </Box>
  );
}

/** Lo que cambió se dice con ícono y texto, no solo con el fondo. */
const MarcaCambio = () => (
  <Box
    component="span"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 0.5,
      color: 'primary.main',
      fontWeight: 700,
      fontSize: '0.875rem',
    }}
  >
    <ChangeCircleOutlinedIcon fontSize="small" aria-hidden />
    Cambió
  </Box>
);

const fondoDeCambio = { bgcolor: (t: Parameters<typeof tinte>[0]) => tinte(t, 'primary', 0.08) };

function TablaComparacion({ filas }: { filas: FilaComparacion[] }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table aria-label="Antes y después">
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: '28%' }}>Campo</TableCell>
            <TableCell>Antes</TableCell>
            <TableCell>Después</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.clave} sx={f.cambio ? fondoDeCambio : undefined}>
              <TableCell component="th" scope="row" sx={{ verticalAlign: 'top' }}>
                <Box sx={{ fontWeight: 700 }}>{f.campo}</Box>
                {f.cambio && <MarcaCambio />}
              </TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>
                <Valor valor={f.antes} />
              </TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>
                <Valor valor={f.despues} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** En el teléfono, cada campo es una tarjeta con "Antes" y "Después" uno debajo del otro. */
function ListaComparacion({ filas }: { filas: FilaComparacion[] }) {
  return (
    <Box
      component="ul"
      role="list"
      aria-label="Antes y después"
      sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}
    >
      {filas.map((f) => (
        <Paper
          key={f.clave}
          component="li"
          variant="outlined"
          sx={{
            p: 2,
            ...(f.cambio && { ...fondoDeCambio, borderColor: 'primary.main', borderWidth: 2 }),
          }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 1 }}>
            <Typography sx={{ fontWeight: 700 }}>{f.campo}</Typography>
            {f.cambio && <MarcaCambio />}
          </Box>
          <Box
            component="dl"
            sx={{
              m: 0,
              mt: 1,
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr)',
              columnGap: 2,
              rowGap: 0.5,
            }}
          >
            <Typography component="dt" color="text.secondary">
              Antes
            </Typography>
            <Box component="dd" sx={{ m: 0, minWidth: 0 }}>
              <Valor valor={f.antes} />
            </Box>
            <Typography component="dt" color="text.secondary">
              Después
            </Typography>
            <Box component="dd" sx={{ m: 0, minWidth: 0 }}>
              <Valor valor={f.despues} />
            </Box>
          </Box>
        </Paper>
      ))}
    </Box>
  );
}

/** Cuántos campos cambiaron, o por qué no hay nada que comparar. */
function resumenDeCambios(e: EntradaAuditoria, filas: FilaComparacion[]) {
  if (filas.length === 0) return 'Esta acción no guardó valores.';
  if (e.valorAnterior === null)
    return 'No había valores anteriores: estos son los que guardó la acción.';
  if (e.valorNuevo === null) return 'La acción no guardó valores nuevos.';
  const n = filas.filter((f) => f.cambio).length;
  if (n === 0) return 'Ningún campo cambió.';
  const de = `${n} de ${filas.length} ${filas.length === 1 ? 'campo' : 'campos'}`;
  return `${n === 1 ? 'Cambió' : 'Cambiaron'} ${de}.`;
}

/**
 * Detalle de un registro de auditoría (T607): quién, cuándo, sobre qué paciente y, campo por
 * campo, el valor de antes y el de después, con lo que cambió marcado con ícono y texto. En el
 * teléfono ocupa toda la pantalla y los campos pasan a tarjetas.
 */
export function DetalleAuditoria({
  entrada: e,
  alCerrar,
}: {
  entrada: EntradaAuditoria;
  alCerrar: () => void;
}) {
  const idTitulo = useId();
  const telefono = useMediaQuery(useTheme().breakpoints.down('sm'));
  const filas = compararValores(e.valorAnterior, e.valorNuevo);
  const datos = [
    { titulo: 'Fecha y hora', valor: formatearFechaHora(e.fechaHora) },
    { titulo: 'Usuario', valor: e.usuario.nombre },
    { titulo: 'Paciente', valor: e.paciente && pacienteConDni(e.paciente) },
    { titulo: 'Detalle', valor: e.detalle },
  ].filter((d): d is { titulo: string; valor: string } => Boolean(d.valor));

  return (
    <Dialog
      open
      onClose={alCerrar}
      fullScreen={telefono}
      fullWidth
      maxWidth="md"
      aria-labelledby={idTitulo}
    >
      <DialogTitle id={idTitulo}>
        {`${accionEnPalabras(e.accion)} · ${entidadConId(e.entidad, e.entidadId)}`}
      </DialogTitle>
      <DialogContent>
        <Box
          component="dl"
          sx={{
            m: 0,
            mb: 3,
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr)',
            columnGap: 2,
            rowGap: 1,
          }}
        >
          {datos.map((d) => (
            <Fragment key={d.titulo}>
              <Typography component="dt" color="text.secondary">
                {d.titulo}
              </Typography>
              <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                {d.valor}
              </Typography>
            </Fragment>
          ))}
        </Box>
        <Typography variant="h6" component="h3">
          Antes y después
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 1.5 }}>
          {resumenDeCambios(e, filas)}
        </Typography>
        {filas.length > 0 &&
          (telefono ? <ListaComparacion filas={filas} /> : <TablaComparacion filas={filas} />)}
      </DialogContent>
      <DialogActions>
        <Boton variante="texto" onClick={alCerrar}>
          Cerrar
        </Boton>
      </DialogActions>
    </Dialog>
  );
}
