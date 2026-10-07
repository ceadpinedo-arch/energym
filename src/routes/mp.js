import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { pedirToken, datosToken } from '../lib/mpgym.js';

const router = Router();

function firmar(txt) {
  return crypto.createHmac('sha256', String(process.env.MP_CLIENT_SECRET || '')).update(txt).digest('base64url');
}

function crearState(gid) {
  const cuerpo = Buffer.from(JSON.stringify({ g: gid, t: Date.now() })).toString('base64url');
  return cuerpo + '.' + firmar(cuerpo);
}

function leerState(s) {
  const p = String(s || '').split('.');
  if (p.length !== 2) return null;
  const a = Buffer.from(p[1]);
  const b = Buffer.from(firmar(p[0]));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(p[0], 'base64url').toString('utf8'));
    if (Date.now() - d.t > 15 * 60 * 1000) return null;
    return d.g;
  } catch (e) {
    return null;
  }
}

async function gimnasioDe(req) {
  const u = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { gimnasioId: true } });
  return u ? u.gimnasioId : null;
}

router.get('/estado', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gid = await gimnasioDe(req);
    if (!gid) return res.status(404).json({ error: 'Sin gimnasio' });
    const g = await prisma.gimnasio.findUnique({ where: { id: gid }, select: { mpAccessToken: true, mpUserId: true } });
    res.json({ conectado: !!(g && g.mpAccessToken), cuenta: g ? g.mpUserId : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error' });
  }
});

router.post('/conectar', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!process.env.MP_CLIENT_ID || !process.env.MP_CLIENT_SECRET || !process.env.BACKEND_URL) {
      return res.status(500).json({ error: 'Falta configurar la aplicación de Mercado Pago en el servidor' });
    }
    const gid = await gimnasioDe(req);
    if (!gid) return res.status(404).json({ error: 'Sin gimnasio' });
    const url = 'https://auth.mercadopago.com.ar/authorization?client_id=' + encodeURIComponent(process.env.MP_CLIENT_ID)
      + '&response_type=code&platform_id=mp&state=' + encodeURIComponent(crearState(gid))
      + '&redirect_uri=' + encodeURIComponent(process.env.BACKEND_URL + '/api/mp/callback');
    res.json({ url: url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error' });
  }
});

router.get('/callback', async (req, res) => {
  const panel = process.env.PANEL_URL || 'https://app.tuaccesogym.com.ar';
  try {
    const gid = leerState(req.query.state);
    const code = String(req.query.code || '');
    if (!gid || !code) return res.redirect(panel + '/?mp=error');
    const r = await pedirToken({ grant_type: 'authorization_code', code: code, redirect_uri: process.env.BACKEND_URL + '/api/mp/callback' });
    await prisma.gimnasio.update({ where: { id: gid }, data: datosToken(r) });
    res.redirect(panel + '/?mp=ok');
  } catch (e) {
    console.error(e);
    res.redirect(panel + '/?mp=error');
  }
});

router.post('/desconectar', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gid = await gimnasioDe(req);
    if (!gid) return res.status(404).json({ error: 'Sin gimnasio' });
    await prisma.gimnasio.update({ where: { id: gid }, data: { mpAccessToken: null, mpRefreshToken: null, mpUserId: null, mpExpira: null } });
    res.json({ conectado: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error' });
  }
});

router.get('/disponible', requireAuth, async (req, res) => {
  try {
    const gid = await gimnasioDe(req);
    if (!gid) return res.json({ conectado: false });
    const g = await prisma.gimnasio.findUnique({ where: { id: gid }, select: { mpAccessToken: true } });
    res.json({ conectado: !!(g && g.mpAccessToken) });
  } catch (e) {
    console.error(e);
    res.json({ conectado: false });
  }
});

export default router;
