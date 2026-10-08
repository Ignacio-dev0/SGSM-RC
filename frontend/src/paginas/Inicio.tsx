import { Box, Card, CardActionArea, CardContent, Grid, Typography } from '@mui/material';
import { Link as EnlaceRouter } from 'react-router-dom';
import { useUsuario } from '../auth/useSesion';
import {
  ESTILO_TITULO_ENFOCABLE,
  useEncabezadoDePantalla,
} from '../componentes/useEncabezadoDePantalla';
import { tareasDe } from '../navegacion/tareas';

/**
 * Inicio (hallazgo F2 de la revisión): las tareas del día del rol, con las palabras de quien
 * las hace, a un toque. El menú lateral sigue teniendo las secciones completas. La primera
 * tarea (la más frecuente del rol) se destaca a ancho completo y con borde de color (F34).
 */
export function Inicio() {
  const usuario = useUsuario();
  const tareas = tareasDe(usuario.permisos);
  const refSaludo = useEncabezadoDePantalla('Inicio');

  return (
    <>
      <Typography
        variant="h4"
        component="h1"
        ref={refSaludo}
        tabIndex={-1}
        sx={ESTILO_TITULO_ENFOCABLE}
      >
        Hola, {usuario.nombre}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {usuario.rol.nombre} · ¿Qué necesita hacer?
      </Typography>
      <Grid container spacing={2}>
        {tareas.map((t, i) => {
          const destacada = i === 0;
          return (
            <Grid key={t.ruta} size={destacada ? 12 : { xs: 12, sm: 6, lg: 4 }}>
              <Card
                variant="outlined"
                data-destacada={destacada ? 'true' : undefined}
                sx={{
                  height: '100%',
                  ...(destacada && { borderColor: 'primary.main', borderWidth: 2 }),
                }}
              >
                <CardActionArea component={EnlaceRouter} to={t.ruta} sx={{ p: 1, height: '100%' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <Box
                      sx={{
                        color: 'primary.main',
                        mt: 0.25,
                        ...(destacada && { '& svg': { fontSize: '2.25rem' } }),
                      }}
                    >
                      {t.icono}
                    </Box>
                    <Box>
                      <Typography
                        variant={destacada ? 'h5' : 'h6'}
                        component="span"
                        sx={{ display: 'block' }}
                      >
                        {t.etiqueta}
                      </Typography>
                      <Typography color="text.secondary">{t.descripcion}</Typography>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </>
  );
}
