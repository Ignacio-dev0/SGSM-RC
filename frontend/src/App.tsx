import { CssBaseline, ThemeProvider, Typography, createTheme } from '@mui/material';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PlantillaTablet } from './componentes/PlantillaTablet';

const tema = createTheme();

export function App() {
  return (
    <ThemeProvider theme={tema}>
      <CssBaseline />
      <BrowserRouter>
        <PlantillaTablet opciones={[{ ruta: '/', etiqueta: 'Inicio' }]}>
          <Routes>
            <Route path="/" element={<Typography variant="h4">Inicio</Typography>} />
          </Routes>
        </PlantillaTablet>
      </BrowserRouter>
    </ThemeProvider>
  );
}
