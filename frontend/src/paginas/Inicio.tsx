import { Box, Card, CardActionArea, CardContent, Grid, Typography } from '@mui/material';
import { Link as EnlaceRouter } from 'react-router-dom';
import { useUsuario } from '../auth/useSesion';
import { tareasDe } from '../navegacion/tareas';

/**
 * Inicio (hallazgo F2 de la revisión): las tareas del día del rol, con las palabras de quien
 * las hace, a un toque. El menú lateral sigue teniendo las secciones completas.
 */
export function Inicio() {
  const usuario = useUsuario();
  const tareas = tareasDe(usuario.permisos);

  return (
    <>
      <Typography variant="h4" component="h1">
        Hola, {usuario.nombre}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {usuario.rol.nombre} · ¿Qué necesita hacer?
      </Typography>
      <Grid container spacing={2}>
        {tareas.map((t) => (
          <Grid key={t.ruta} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardActionArea component={EnlaceRouter} to={t.ruta} sx={{ p: 1, height: '100%' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{ color: 'primary.main', mt: 0.25 }}>{t.icono}</Box>
                  <Box>
                    <Typography variant="h6" component="span" sx={{ display: 'block' }}>
                      {t.etiqueta}
                    </Typography>
                    <Typography color="text.secondary">{t.descripcion}</Typography>
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </>
  );
}
