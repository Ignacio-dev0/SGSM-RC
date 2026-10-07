/**
 * Error esperado del instalador (datos inválidos, falta el administrador…): se muestra cada línea
 * tal cual y el instalador termina con código 1 sin haber cargado nada.
 */
export class ErrorInstalacion extends Error {
  constructor(public readonly lineas: string[]) {
    super(lineas.join('\n'));
    this.name = 'ErrorInstalacion';
  }
}
