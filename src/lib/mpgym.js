import crypto from 'crypto';
import { MercadoPagoConfig } from 'mercadopago';
import { prisma } from '../prisma.js';

function clave() {
  return crypto.createHash('sha256').update(String(process.env.MP_CLIENT_SECRET || '')).digest();
}

export function cifrar(txt) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const datos = Buffer.concat([c.update(String(txt), 'utf8'), c.final()]);
  return iv.toString('base64') + ':' + c.getAuthTag().toString('base64') + ':' + datos.toString('base64');
}

export function descifrar(txt) {
  try {
    const p = String(txt).split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', clave(), Buffer.from(p[0], 'base64'));
    d.setAuthTag(Buffer.from(p[1], 'base64'));
    return Buffer.concat([d.update(Buffer.from(p[2], 'base64')), d.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}

export async function pedirToken(extra) {
  const r = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ client_id: process.env.MP_CLIENT_ID, client_secret: process.env.MP_CLIENT_SECRET }, extra)),
  });
  if (!r.ok) throw new Error('Mercado Pago OAuth ' + r.status);
  return r.json();
}

export function datosToken(r) {
  return {
    mpAccessToken: cifrar(r.access_token),
    mpRefreshToken: r.refresh_token ? cifrar(r.refresh_token) : undefined,
    mpUserId: r.user_id ? String(r.user_id) : undefined,
    mpExpira: new Date(Date.now() + (r.expires_in || 15552000) * 1000),
  };
}

export async function clienteDelGimnasio(g) {
  if (!g || !g.mpAccessToken) return null;
  let token = descifrar(g.mpAccessToken);
  if (!token) return null;
  const faltan = g.mpExpira ? new Date(g.mpExpira).getTime() - Date.now() : null;
  if (g.mpRefreshToken && faltan !== null && faltan < 7 * 86400000) {
    try {
      const r = await pedirToken({ grant_type: 'refresh_token', refresh_token: descifrar(g.mpRefreshToken) });
      await prisma.gimnasio.update({ where: { id: g.id }, data: datosToken(r) });
      token = r.access_token;
    } catch (e) {
      console.error('No se pudo renovar el token de Mercado Pago', e);
      if (faltan <= 0) return null;
    }
  }
  return new MercadoPagoConfig({ accessToken: token });
}
