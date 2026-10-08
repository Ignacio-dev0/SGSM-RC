// Historial del paciente, pestaña Modificaciones: las palabras de la auditoría (F2).
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { HistorialPaciente } from '../../api/tipos';
import { ENFERMERO } from '../../pruebas/datos';
import { HISTORIAL, paciente, simularCatalogosDePacientes } from '../../pruebas/datosPacientes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';
import { accionSobre } from '../auditoria/palabras';

type Modificacion = HistorialPaciente['modificaciones'][number];

const NBSP = String.fromCharCode(160);

const modificacion = (extra: Partial<Modificacion>): Modificacion => ({
  id: 1,
  fechaHora: '2026-10-03T14:00:00.000Z',
  accion: 'MODIFICAR',
  entidad: 'Paciente',
  usuario: 'Ferreyra, Martín',
  valorAnterior: null,
  valorNuevo: null,
  detalle: null,
  ...extra,
});

/** Lo que hizo una persona y los avisos que el sistema generó y venció solo. */
const MODIFICACIONES: Modificacion[] = [
  modificacion({
    id: 40,
    fechaHora: '2026-10-04T15:00:00.000Z',
    accion: 'SUSPENDER',
    entidad: 'Prescripcion',
    valorAnterior: { estado: 'VIGENTE', frecuenciaHoras: 8 },
    valorNuevo: { estado: 'SUSPENDIDA', frecuenciaHoras: 8, motivoCambioEstado: 'Náuseas' },
  }),
  modificacion({
    id: 39,
    fechaHora: '2026-10-04T14:00:00.000Z',
    accion: 'VENCER',
    entidad: 'Recordatorio',
    usuario: null,
    valorAnterior: { estado: 'PENDIENTE' },
    valorNuevo: { estado: 'VENCIDO' },
  }),
  modificacion({
    id: 38,
    fechaHora: '2026-10-04T13:00:00.000Z',
    accion: 'GENERAR',
    entidad: 'Recordatorio',
    usuario: null,
    valorNuevo: { tipo: 'MEDICAMENTO', prescripcionId: 40, prioridad: 'MEDIA' },
  }),
  modificacion({
    id: 30,
    valorAnterior: { obraSocial: 'IOMA' },
    valorNuevo: { obraSocial: 'PAMI' },
  }),
];

function conModificaciones(modificaciones: Modificacion[]) {
  servidor.use(
    http.get('*/api/pacientes/7/historial', () =>
      HttpResponse.json({ data: { ...HISTORIAL, modificaciones } }),
    ),
  );
}

async function abrirModificaciones() {
  renderizarApp('/pacientes/7?pestana=historial', ENFERMERO);
  await userEvent.click(await screen.findByRole('tab', { name: /^Modificaciones/ }));
  return screen.findByRole('table', { name: 'Modificaciones' });
}

beforeEach(() => {
  simularCatalogosDePacientes();
  servidor.use(
    http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
  );
});

describe('modificaciones del paciente con las palabras de la auditoría (F2)', () => {
  it('internar a un paciente se dice "Internó" (glosario), también en la auditoría', () => {
    expect(accionSobre('CREAR', 'Paciente')).toBe('Internó');
    expect(accionSobre('CREAR', 'Prescripcion')).toBe('Creó');
    expect(accionSobre('SUSPENDER', 'Prescripcion')).toBe('Suspendió');
  });

  it('acción, sobre qué, campos y valores como en la auditoría; quién lo hizo en su columna', async () => {
    conModificaciones(MODIFICACIONES);
    const tabla = await abrirModificaciones();

    const cabecera = within(tabla)
      .getAllByRole('columnheader')
      .map((c) => c.textContent);
    expect(cabecera).toEqual(['Fecha y hora', 'Acción', 'Sobre qué', 'Detalle', 'Quién lo hizo']);
    const [suspension, ficha] = within(tabla).getAllByRole('row').slice(1);
    expect(suspension).toHaveTextContent(/Suspendió.*Prescripción/);
    // Los códigos con las palabras de los chips y los campos con su nombre.
    expect(suspension).toHaveTextContent('Estado: Vigente → Suspendida');
    expect(suspension).toHaveTextContent('Motivo del cambio de estado: Náuseas');
    // Lo que no cambió no se repite.
    expect(suspension).not.toHaveTextContent(`Frecuencia: cada 8${NBSP}h`);
    expect(suspension).toHaveTextContent('Ferreyra, Martín');
    expect(ficha).toHaveTextContent(/Modificó.*Paciente.*Obra social: IOMA → PAMI/);
  });

  it('con dos prescripciones, "Sobre qué" dice cuál, con el nombre que manda el servidor (C2)', async () => {
    conModificaciones([
      modificacion({
        id: 41,
        accion: 'SUSPENDER',
        entidad: 'Prescripcion',
        entidadId: '40',
        entidadEtiqueta: 'Paracetamol · Benítez, Rosa',
        valorAnterior: { estado: 'VIGENTE' },
        valorNuevo: { estado: 'SUSPENDIDA' },
      }),
      modificacion({
        id: 42,
        accion: 'SUSPENDER',
        entidad: 'Prescripcion',
        entidadId: '41',
        entidadEtiqueta: 'Enalapril · Benítez, Rosa',
        valorAnterior: { estado: 'VIGENTE' },
        valorNuevo: { estado: 'SUSPENDIDA' },
      }),
      // Sin nombre (un servidor que todavía no lo manda): el número, como en la auditoría.
      modificacion({ id: 43, entidad: 'Prescripcion', entidadId: '39' }),
    ]);
    const tabla = await abrirModificaciones();

    const sobreQue = within(tabla)
      .getAllByRole('row')
      .slice(1)
      .map((fila) => within(fila).getAllByRole('cell')[2]!.textContent);
    expect(sobreQue).toEqual([
      'Prescripción: Paracetamol · Benítez, Rosa',
      'Prescripción: Enalapril · Benítez, Rosa',
      'Prescripción n.º 39',
    ]);
  });

  it('oculta por defecto los avisos que el sistema genera y vence solo, y se pueden mostrar', async () => {
    conModificaciones(MODIFICACIONES);
    const tabla = await abrirModificaciones();

    // La pestaña cuenta lo que se ve.
    expect(screen.getByRole('tab', { name: 'Modificaciones (2)' })).toBeInTheDocument();
    expect(within(tabla).queryByText('Generó')).not.toBeInTheDocument();
    expect(within(tabla).queryByText('Marcó como vencido')).not.toBeInTheDocument();

    const interruptor = screen.getByRole('switch', { name: 'Mostrar los avisos automáticos' });
    expect(interruptor).not.toBeChecked();
    await userEvent.click(interruptor);

    expect(await within(tabla).findByText('Generó')).toBeInTheDocument();
    expect(within(tabla).getByText('Marcó como vencido')).toBeInTheDocument();
    expect(within(tabla).getAllByText('Sistema')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Modificaciones (4)' })).toBeInTheDocument();
  });

  it('sin avisos automáticos no ofrece el interruptor', async () => {
    conModificaciones([MODIFICACIONES[0]!]);
    await abrirModificaciones();

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('si solo hay avisos automáticos, el vacío dice cómo verlos', async () => {
    conModificaciones(MODIFICACIONES.filter((m) => m.usuario === null));
    await abrirModificaciones();

    expect(
      await screen.findByText(
        'No hay modificaciones hechas por personas. Los 2 avisos automáticos de recordatorios están ocultos: active «Mostrar los avisos automáticos» para verlos.',
      ),
    ).toBeInTheDocument();
  });
});
