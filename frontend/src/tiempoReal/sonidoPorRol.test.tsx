// Sonido de los avisos y tono repetido: encendidos por defecto solo para el personal de sala (F8).
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { esPersonalDeSala } from '../auth/personalDeSala';
import { ADMIN, ENFERMERO, MEDICO } from '../pruebas/datos';
import { simularAudioYVibracion } from '../pruebas/audioFalso';
import {
  RECORDATORIOS,
  avisarCambio,
  registrarConexiones,
  respuestaRecordatorios,
  simularRecordatorios,
} from '../pruebas/datosRecordatorios';
import { renderizarApp } from '../pruebas/renderizar';
import { servidor } from '../pruebas/servidor';
import { guardarPreferenciaSonido, leerPreferenciaSonido } from './avisos';

const regionDeAvisos = () =>
  document.querySelector<HTMLElement>('[aria-live="polite"][data-avisos-recordatorios]')!;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('quién es personal de sala (F8)', () => {
  it('atiende recordatorios y no administra usuarios', () => {
    expect(esPersonalDeSala(ENFERMERO)).toBe(true);
    // El administrador también puede atender, pero no está en la sala.
    expect(esPersonalDeSala(ADMIN)).toBe(false);
    expect(esPersonalDeSala(MEDICO)).toBe(false);
    expect(esPersonalDeSala(null)).toBe(false);
  });
});

describe('preferencia de sonido según quién usa la tablet (F8)', () => {
  it('sin elección guardada, el valor por defecto de cada uno', () => {
    expect(leerPreferenciaSonido(true)).toBe(true);
    expect(leerPreferenciaSonido(false)).toBe(false);
  });

  it('se guarda solo lo que se aparta del valor por defecto', () => {
    // El administrador lo enciende: queda encendido para él.
    guardarPreferenciaSonido(true, false);
    expect(leerPreferenciaSonido(false)).toBe(true);
    // Lo vuelve a apagar: vuelve a su valor por defecto, sin nada guardado.
    guardarPreferenciaSonido(false, false);
    expect(localStorage.getItem('sgsm.sonidoAvisos')).toBeNull();
    // La enfermera lo apaga: queda apagado en la tablet.
    guardarPreferenciaSonido(false, true);
    expect(leerPreferenciaSonido(true)).toBe(false);
  });
});

describe('aviso de recordatorios nuevos (F8)', () => {
  async function avisoNuevo(usuario: typeof ENFERMERO) {
    const audio = simularAudioYVibracion();
    const conexiones = registrarConexiones();
    servidor.use(http.get('*/api/recordatorios', () => respuestaRecordatorios(RECORDATORIOS)));
    renderizarApp('/', usuario);
    await waitFor(() => expect(conexiones).toHaveLength(1));
    avisarCambio(1, 0);
    await waitFor(() => expect(regionDeAvisos()).toHaveTextContent('1 recordatorio nuevo'));
    return audio;
  }

  it('al personal de sala le suena y vibra', async () => {
    const { notas, vibrar } = await avisoNuevo(ENFERMERO);
    await waitFor(() => expect(vibrar).toHaveBeenCalled());
    expect(notas.length).toBeGreaterThan(0);
  });

  it('al administrador le avisa con el texto, sin sonido', async () => {
    const { notas, vibrar } = await avisoNuevo(ADMIN);
    expect(vibrar).not.toHaveBeenCalled();
    expect(notas).toHaveLength(0);
  });

  it('el tono repetido de los urgentes tampoco le suena al administrador', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { notas } = simularAudioYVibracion();
    const conexiones = registrarConexiones();
    servidor.use(http.get('*/api/recordatorios', () => respuestaRecordatorios(RECORDATORIOS)));
    renderizarApp('/', ADMIN);
    await screen.findByRole('link', { name: /^Recordatorios: \d+ para atender/ });
    await waitFor(() => expect(conexiones).toHaveLength(1));

    act(() => vi.advanceTimersByTime(15 * 60_000));
    expect(notas).toHaveLength(0);
  });
});

describe('interruptor "Sonido de avisos" del panel (F8)', () => {
  it('el administrador lo ve apagado y lo puede encender', async () => {
    simularRecordatorios();
    renderizarApp('/recordatorios', ADMIN);

    const interruptor = await screen.findByRole('switch', { name: 'Sonido de avisos' });
    expect(interruptor).not.toBeChecked();
    await userEvent.click(interruptor);

    expect(interruptor).toBeChecked();
    expect(localStorage.getItem('sgsm.sonidoAvisos')).toBe('si');
  });
});
