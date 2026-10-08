/**
 * Fuente única de la hora actual. Las pruebas la reemplazan con jest.spyOn(reloj, 'ahora')
 * para simular el paso del tiempo (inactividad, bloqueos, plazo de 24 h, horarios).
 */
export const reloj = {
  ahora: (): Date => new Date(),
};
