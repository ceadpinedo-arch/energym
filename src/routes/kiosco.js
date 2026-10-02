import { Router } from 'express';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
const intentos = new Map();

let tieneDia = true;
try {
  tieneDia = Prisma.dmmf.datamodel.models.some((m) => m.name === 'Asistencia' && m.fields.some((f) => f.name === 'dia'));
} catch (e) {
  tieneDia = true;
}

function hoyAR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function limitado(clave, max) {
  const ahora = Date.now();
  if (intentos.size > 5000) intentos.clear();
  const lista = (intentos.get(clave) || []).filter((t) => ahora - t < 60000);
  lista.push(ahora);
  intentos.set(clave, lista);
  return lista.length > max;
}

function soloNum(v) {
  return String(v || '').split('').filter((c) => c >= '0' && c <= '9').join('');
}

async function gimnasioDe(req) {
  const u = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { gimnasioId: true } });
  return u ? u.gimnasioId : null;
}

router.get('/estado', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gid = await gimnasioDe(req);
    if (!gid) return res.status(404).json({ error: 'Sin gimnasio' });
    const g = await prisma.gimnasio.findUnique({ where: { id: gid }, select: { kioscoToken: true } });
    res.json({ activo: !!(g && g.kioscoToken), token: g ? g.kioscoToken : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error' });
  }
});

router.post('/activar', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gid = await gimnasioDe(req);
    if (!gid) return res.status(404).json({ error: 'Sin gimnasio' });
    const token = crypto.randomBytes(18).toString('hex');
    await prisma.gimnasio.update({ where: { id: gid }, data: { kioscoToken: token } });
    res.json({ activo: true, token: token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error' });
  }
});

router.post('/desactivar', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gid = await gimnasioDe(req);
    if (!gid) return res.status(404).json({ error: 'Sin gimnasio' });
    await prisma.gimnasio.update({ where: { id: gid }, data: { kioscoToken: null } });
    res.json({ activo: false, token: null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error' });
  }
});

router.post('/checkin', async (req, res) => {
  const b = req.body || {};
  const token = String(b.token || '');
  const dni = soloNum(b.dni);
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  if (limitado('ip:' + ip, 40) || limitado('t:' + token.slice(0, 12), 120)) {
    return res.status(429).json({ permitido: false, motivo: 'Demasiados intentos. Esper\u00e1 un minuto.' });
  }
  if (token.length < 20 || dni.length < 6 || dni.length > 9) {
    return res.status(400).json({ permitido: false, motivo: 'Escrib\u00ed tu DNI.' });
  }
  try {
    const g = await prisma.gimnasio.findUnique({ where: { kioscoToken: token } });
    if (!g) return res.status(403).json({ permitido: false, motivo: 'Este enlace ya no es v\u00e1lido. Pedile uno nuevo al gimnasio.' });
    const u = await prisma.usuario.findFirst({ where: { dni: dni, gimnasioId: g.id, rol: 'SOCIO' } });
    if (!u) return res.json({ permitido: false, motivo: 'No encontramos ese DNI en este gimnasio.' });
    const nombre = String(u.nombre || '').trim().split(' ')[0];
    if (u.estadoPago !== 'AL_DIA') return res.json({ permitido: false, motivo: 'Cuota vencida', nombre: nombre });
    try {
      await prisma.asistencia.create({ data: tieneDia ? { usuarioId: u.id, dia: hoyAR() } : { usuarioId: u.id } });
    } catch (e) {
      if (!(e && e.code === 'P2002')) throw e;
    }
    res.json({ permitido: true, nombre: nombre });
  } catch (e) {
    console.error(e);
    res.status(500).json({ permitido: false, motivo: 'Error del servidor. Prob\u00e1 de nuevo.' });
  }
});

export default router;
