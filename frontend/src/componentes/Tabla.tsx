import { Fragment, useId, type MouseEvent, type ReactNode } from 'react';
import {
  Box,
  ButtonBase,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { TAMANO_TACTIL_MINIMO } from '../tema';

export interface Columna<T> {
  titulo: string;
  valor: (fila: T) => ReactNode;
  ancho?: number | string;
  alinear?: 'left' | 'right' | 'center';
}

export interface Paginacion {
  /** Página actual, empezando en 1 (igual que la API). */
  pagina: number;
  porPagina: number;
  total: number;
  alCambiarPagina: (pagina: number) => void;
}

interface Props<T> {
  /** Nombre accesible de la tabla. */
  titulo: string;
  columnas: Columna<T>[];
  filas: T[];
  claveFila: (fila: T) => string | number;
  mensajeVacio?: string;
  cargando?: boolean;
  alTocarFila?: (fila: T) => void;
  /**
   * Nombre accesible de una fila tocable, que dice qué abre (por ejemplo "Abrir Benítez, Rosa").
   * Si no se pasa, la fila se anuncia con su contenido.
   */
  etiquetaFila?: (fila: T) => string;
  paginacion?: Paginacion;
  /** Si la consulta falló: se muestra el error en lugar del mensaje de "sin resultados". */
  error?: string | null;
}

/** Elementos que se operan por su cuenta: tocarlos no tiene que abrir la tarjeta. */
const CONTROLES =
  'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], ' +
  '[role="checkbox"], [role="switch"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';

/** Una columna sin valor para esa fila (por ejemplo, un botón que no aplica) no deja un par vacío. */
const tieneValor = (valor: ReactNode) =>
  valor !== null && valor !== undefined && valor !== false && valor !== true && valor !== '';

/** Texto que leen los lectores de pantalla pero no se ve. */
const SOLO_LECTOR = {
  position: 'absolute',
  // En píxeles: en sx, `width: 1` sería el 100 %.
  width: '1px',
  height: '1px',
  m: '-1px',
  p: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/** Chevron que avisa que la fila o tarjeta se abre; el lector de pantalla lo ignora. */
const IndicadorDeApertura = () => (
  <ChevronRightIcon aria-hidden color="action" sx={{ display: 'block' }} />
);

interface PropsTarjeta<T> {
  fila: T;
  columnas: Columna<T>[];
  alTocar?: (fila: T) => void;
  etiqueta?: string;
}

/**
 * Una fila como tarjeta: la primera columna es el título y el resto van como pares
 * "título: valor". Si la fila es tocable, el botón accesible (con foco visible y Enter/Espacio
 * nativos) es un hermano del contenido y no su envoltorio: así un control dentro de la tarjeta,
 * como "Administrar", nunca queda dentro de otro botón. El toque con el dedo cae sobre el
 * contenido, que ignora los toques sobre sus controles.
 */
function TarjetaFila<T>({ fila, columnas, alTocar, etiqueta }: PropsTarjeta<T>) {
  const id = useId();
  const [primera, ...resto] = columnas;
  const pares = resto
    .map((columna) => ({ columna, valor: columna.valor(fila) }))
    .filter(({ valor }) => tieneValor(valor));

  const alTocarContenido = (e: MouseEvent<HTMLElement>) => {
    const control = (e.target as Element).closest(CONTROLES);
    if (control && e.currentTarget.contains(control)) return;
    alTocar?.(fila);
  };

  return (
    <Paper
      component="li"
      variant="outlined"
      sx={{
        position: 'relative',
        minHeight: TAMANO_TACTIL_MINIMO,
        ...(alTocar && {
          '@media (hover: hover)': { '&:hover': { bgcolor: 'action.hover' } },
          '&:active': { bgcolor: 'action.selected' },
        }),
      }}
    >
      {alTocar && (
        <ButtonBase
          aria-label={etiqueta}
          aria-labelledby={etiqueta ? undefined : `${id}-titulo`}
          aria-describedby={pares.length > 0 ? `${id}-datos` : undefined}
          onClick={() => alTocar(fila)}
          disableRipple
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            '&.Mui-focusVisible': {
              outline: '3px solid',
              outlineColor: 'primary.main',
              outlineOffset: 2,
            },
          }}
        />
      )}
      <Box
        onClick={alTocar ? alTocarContenido : undefined}
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 2,
          cursor: alTocar ? 'pointer' : undefined,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            id={`${id}-titulo`}
            component="div"
            sx={{ fontWeight: 700, fontSize: '1.125rem', overflowWrap: 'anywhere' }}
          >
            {primera?.valor(fila)}
          </Typography>
          {pares.length > 0 && (
            <Box
              component="dl"
              id={`${id}-datos`}
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)',
                columnGap: 2,
                rowGap: 1,
                m: 0,
                mt: 1,
              }}
            >
              {pares.map(({ columna, valor }) => (
                <Fragment key={columna.titulo}>
                  <Typography
                    component="dt"
                    variant="body2"
                    color="text.secondary"
                    sx={{ overflowWrap: 'anywhere' }}
                  >
                    {columna.titulo}
                  </Typography>
                  <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                    {valor}
                  </Typography>
                </Fragment>
              ))}
            </Box>
          )}
        </Box>
        {alTocar && <IndicadorDeApertura />}
      </Box>
    </Paper>
  );
}

/**
 * Tabla estándar (T010) con estados de carga, vacío y error, filas tocables (también con el
 * teclado: Tab y Enter) y paginación de la API. En un teléfono (menos de 600 px) cada fila se
 * muestra como una tarjeta, para no obligar a desplazarse hacia los costados.
 */
export function Tabla<T>({
  titulo,
  columnas,
  filas,
  claveFila,
  mensajeVacio = 'No hay resultados',
  cargando = false,
  alTocarFila,
  etiquetaFila,
  paginacion,
  error,
}: Props<T>) {
  const telefono = useMediaQuery(useTheme().breakpoints.down('sm'));
  // En el teléfono las tarjetas van sueltas sobre el fondo, sin el marco de la tabla.
  const marcoDeMensaje = telefono
    ? { border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }
    : undefined;

  return (
    <Paper variant="outlined" sx={telefono ? { border: 0, bgcolor: 'transparent' } : undefined}>
      {cargando && <LinearProgress aria-label="Cargando" sx={telefono ? { mb: 1.5 } : undefined} />}
      {telefono ? (
        filas.length > 0 && (
          <Box
            component="ul"
            // role explícito: Safari no anuncia como lista a una <ul> sin viñetas.
            role="list"
            aria-label={titulo}
            sx={{
              listStyle: 'none',
              m: 0,
              p: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            {filas.map((f) => (
              <TarjetaFila
                key={claveFila(f)}
                fila={f}
                columnas={columnas}
                alTocar={alTocarFila}
                etiqueta={alTocarFila ? etiquetaFila?.(f) : undefined}
              />
            ))}
          </Box>
        )
      ) : (
        <TableContainer>
          <Table aria-label={titulo}>
            <TableHead>
              <TableRow>
                {columnas.map((c) => (
                  <TableCell key={c.titulo} align={c.alinear} sx={{ width: c.ancho }}>
                    {c.titulo}
                  </TableCell>
                ))}
                {alTocarFila && (
                  // relative: el texto oculto queda dentro de la celda y no ensancha la página.
                  <TableCell sx={{ width: 48, position: 'relative' }}>
                    <Box component="span" sx={SOLO_LECTOR}>
                      Abrir
                    </Box>
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {filas.map((f) => (
                <TableRow
                  key={claveFila(f)}
                  hover={Boolean(alTocarFila)}
                  onClick={alTocarFila ? () => alTocarFila(f) : undefined}
                  tabIndex={alTocarFila ? 0 : undefined}
                  aria-label={alTocarFila ? etiquetaFila?.(f) : undefined}
                  onKeyDown={
                    alTocarFila
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            alTocarFila(f);
                          }
                        }
                      : undefined
                  }
                  sx={alTocarFila ? { cursor: 'pointer' } : undefined}
                >
                  {columnas.map((c) => (
                    <TableCell key={c.titulo} align={c.alinear}>
                      {c.valor(f)}
                    </TableCell>
                  ))}
                  {alTocarFila && (
                    <TableCell sx={{ width: 48, pr: 1 }}>
                      <IndicadorDeApertura />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {error ? (
        <Box
          role="alert"
          sx={{
            p: 4,
            textAlign: 'center',
            ...marcoDeMensaje,
            mt: telefono && filas.length > 0 ? 1.5 : 0,
          }}
        >
          <Typography color="error">{error}</Typography>
        </Box>
      ) : (
        !cargando &&
        filas.length === 0 && (
          <Box sx={{ p: 4, textAlign: 'center', ...marcoDeMensaje }}>
            <Typography color="text.secondary">{mensajeVacio}</Typography>
          </Box>
        )
      )}
      {paginacion && (
        <TablePagination
          component="div"
          count={paginacion.total}
          page={paginacion.pagina - 1}
          rowsPerPage={paginacion.porPagina}
          rowsPerPageOptions={[paginacion.porPagina]}
          onPageChange={(_e, p) => paginacion.alCambiarPagina(p + 1)}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          getItemAriaLabel={(tipo) => (tipo === 'next' ? 'Página siguiente' : 'Página anterior')}
        />
      )}
    </Paper>
  );
}
