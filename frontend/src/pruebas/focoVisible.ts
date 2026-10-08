// jsdom no resuelve `:focus-visible` de forma confiable (da verdadero una vez y luego falso), y
// MUI lo consulta para abrir una ayuda flotante con el foco. Esto lo simula como un navegador:
// el elemento enfocado es "visible" si la última interacción fue del teclado, no del puntero.

/** Activa la simulación; devuelve la función que la desactiva (usar en `afterEach`). */
export function simularFocoVisible(): () => void {
  const original = Element.prototype.matches;
  let teclado = false;
  const alTeclado = () => {
    teclado = true;
  };
  const alPuntero = () => {
    teclado = false;
  };
  document.addEventListener('keydown', alTeclado, true);
  document.addEventListener('pointerdown', alPuntero, true);
  document.addEventListener('mousedown', alPuntero, true);
  Element.prototype.matches = function (this: Element, selector: string) {
    return selector === ':focus-visible'
      ? this === document.activeElement && teclado
      : original.call(this, selector);
  };

  return () => {
    Element.prototype.matches = original;
    document.removeEventListener('keydown', alTeclado, true);
    document.removeEventListener('pointerdown', alPuntero, true);
    document.removeEventListener('mousedown', alPuntero, true);
  };
}
