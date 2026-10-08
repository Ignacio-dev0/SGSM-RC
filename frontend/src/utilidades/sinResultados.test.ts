import { oracionDe, pasosParaProbar } from './sinResultados';

describe('pasosParaProbar', () => {
  it('sin pasos no dice nada', () => {
    expect(pasosParaProbar([])).toBe('');
  });

  it('un solo paso es una oración con la inicial en mayúscula', () => {
    expect(pasosParaProbar(['cambie Estado a Todos'])).toBe('Cambie Estado a Todos.');
  });

  it('con dos pasos, el último va con "o"', () => {
    expect(pasosParaProbar(['pruebe con otro apellido, DNI o cama', 'cambie Estado a Todos'])).toBe(
      'Pruebe con otro apellido, DNI o cama, o cambie Estado a Todos.',
    );
  });

  it('con más pasos, los separa con comas y el último va con "o"', () => {
    expect(
      pasosParaProbar(['pruebe con otro apellido', 'elija otra sala', 'cambie Estado a Todos']),
    ).toBe('Pruebe con otro apellido, elija otra sala, o cambie Estado a Todos.');
  });

  it('se queda solo con los pasos que corresponden (los demás vienen vacíos o en falso)', () => {
    expect(
      pasosParaProbar(['', 'elija otra sala', false, undefined, 'cambie Estado a Todos']),
    ).toBe('Elija otra sala, o cambie Estado a Todos.');
  });
});

describe('oracionDe', () => {
  it('une las partes con espacios y cierra con punto', () => {
    expect(oracionDe(['No hay', 'pacientes internados', 'que coincidan con «Pérez»'])).toBe(
      'No hay pacientes internados que coincidan con «Pérez».',
    );
  });

  it('salta las partes que no corresponden', () => {
    expect(oracionDe(['No hay', 'pacientes', '', false, undefined])).toBe('No hay pacientes.');
  });
});
