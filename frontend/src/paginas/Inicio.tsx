import { Card, CardActionArea, CardContent, Grid, Typography } from '@mui/material';
import { Link as EnlaceRouter } from 'react-router-dom';
import { useUsuario } from '../auth/useSesion';
import { opcionesDelMenu } from '../navegacion/menu';

/** Pantalla de inicio: saludo y accesos directos a lo que el rol habilita. */
export function Inicio() {
  const usuario = useUsuario();
  const accesos = opcionesDelMenu(usuario.permisos).filter((o) => o.ruta !== '/');

  return (
    <>
      <Typography variant="h4" component="h1">
        Hola, {usuario.nombre}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {usuario.rol.nombre} · ¿Qué necesita hacer?
      </Typography>
      <Grid container spacing={2}>
        {accesos.map((o) => (
          <Grid key={o.ruta} size={{ xs: 12, sm: 6, lg: 4 }}>
            <Card variant="outlined">
              <CardActionArea component={EnlaceRouter} to={o.ruta} sx={{ p: 1 }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {o.icono}
                  <Typography variant="h6" component="span">
                    {o.etiqueta}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </>
  );
}
