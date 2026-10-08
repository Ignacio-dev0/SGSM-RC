// Genera los PNG del ícono (acceso directo en la tablet) a partir de los SVG de public/.
// Uso, desde frontend/: node scripts/generar-iconos.mjs
// Necesita Playwright con Chromium (está en el package.json de la raíz, para los e2e).
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const publico = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Cada PNG: de qué SVG sale y de qué lado (cuadrado). */
const PNG = [
  { svg: 'icono.svg', png: 'icono-192.png', lado: 192 },
  { svg: 'icono.svg', png: 'icono-512.png', lado: 512 },
  { svg: 'icono-maskable.svg', png: 'icono-maskable-512.png', lado: 512 },
  // iOS redondea las esquinas solo: va de borde a borde.
  { svg: 'icono-maskable.svg', png: 'apple-touch-icon.png', lado: 180 },
];

const navegador = await chromium.launch();
try {
  for (const { svg, png, lado } of PNG) {
    const contenido = await readFile(join(publico, svg), 'utf8');
    const pagina = await navegador.newPage({ viewport: { width: lado, height: lado } });
    await pagina.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${lado}px;height:${lado}px}</style>${contenido}`,
    );
    await pagina.screenshot({ path: join(publico, png), omitBackground: true });
    await pagina.close();
    console.info(`public/${png} (${lado}×${lado})`);
  }
} finally {
  await navegador.close();
}
