/**
 * Cliente HTTP mínimo para medir la API como la usa la tablet (T702): `fetch` de Node con la
 * cookie de sesión, que se renueva con cada respuesta (sesión deslizante).
 */
export class SesionHttp {
  private cookie = '';

  constructor(private readonly base: string) {}

  async iniciar(nombreUsuario: string, contrasena: string) {
    this.cookie = '';
    await this.pedir('POST', '/api/auth/login', { nombreUsuario, contrasena });
  }

  /** Hace el pedido, lee la respuesta entera y falla si no es 2xx. */
  async pedir(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<unknown> {
    const res = await fetch(this.base + ruta, {
      method: metodo,
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    for (const c of res.headers.getSetCookie()) {
      const [par] = c.split(';');
      if (par?.startsWith('sgsm_sesion=')) this.cookie = par;
    }
    const tipo = res.headers.get('content-type') ?? '';
    const datos = tipo.includes('json') ? await res.json() : await res.arrayBuffer();
    if (!res.ok) {
      throw new Error(
        `${metodo} ${ruta} respondió ${res.status}: ${JSON.stringify(datos).slice(0, 300)}`,
      );
    }
    return datos;
  }
}
