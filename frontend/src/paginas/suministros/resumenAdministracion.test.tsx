import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { ENFERMERO } from '../../pruebas/datos';
import { paciente } from '../../pruebas/datosPacientes';
import { prepararSuministros, vigente } from '../../pruebas/datosSuministros';
import { renderizarApp } from '../../pruebas/renderizar';
import { tema } from '../../tema';
import type { EstadoToma } from './estadoToma';
import { ResumenAdministracion } from './ResumenAdministracion';

const SIN_TOMAS: EstadoToma = { tipo: 'sin-tomas' };

describe('jerarquía de encabezados del resumen de administración (WCAG 1.3.1)', () => {
  it('el título del resumen es un h2: cuelga del título de la pantalla, sin saltar niveles', () => {
    render(
      <ThemeProvider theme={tema}>
        <ResumenAdministracion
          paciente={paciente()}
          prescripcion={vigente}
          cantidad={vigente.dosis}
          observaciones=""
          estado={SIN_TOMAS}
        />
      </ThemeProvider>,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Revise antes de confirmar' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Revise antes de confirmar' })).toBeInTheDocument();
  });

  describe('en la pantalla completa', () => {
    beforeEach(prepararSuministros);
    afterEach(() => vi.unstubAllEnvs());

    it('los encabezados descienden de a un nivel, empezando por el h1', async () => {
      renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);
      await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
      await screen.findByRole('heading', { name: 'Revise antes de confirmar' });

      const niveles = screen.getAllByRole('heading').map((h) => Number(h.tagName.slice(1)));
      // Un encabezado puede bajar de a un nivel o volver a uno anterior, nunca saltar hacia abajo.
      const saltos = niveles.filter(
        (nivel, i) => i > 0 && nivel > Math.max(...niveles.slice(0, i)) + 1,
      );
      expect(niveles[0]).toBe(1);
      expect({ niveles, saltos }).toEqual({ niveles, saltos: [] });
    });
  });
});
