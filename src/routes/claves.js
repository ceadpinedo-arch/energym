import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
const LETRAS = 'abcdefghjkmnpqrstuvwxyz23456789';

function temporal() {
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += LETRAS[b[i] % LETRAS.length];
  return s;
}

// Admin: restablecer la contraseña de un socio de su gimnasio
router.post('/socio/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { gimnasioId: true } });
    const socio = await prisma.usuario.findUnique({ where: { id: req.params.id }, select: { id: true, rol: true, gimnasioId: true } });
    if (!admin || !admin.gimnasioId || !socio || socio.rol !== 'SOCIO' || socio.gimnasioId !== admin.gimnasioId) {
      return res.status(404).json({ error: 'Socio no encontrado' });
    }
    const pedida = req.body && typeof req.body.password === 'string' ? req.body.password : '';
    if (pedida && pedida.length < 8) return res.status(400).json({ error: 'La contraseña tiene que tener al menos 8 caracteres' });
    const password = pedida || temporal();
    await prisma.usuario.update({ where: { id: socio.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    res.json({ password: password });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo restablecer la contraseña' });
  }
});

// Cualquier usuario: cambiar su propia contraseña
router.post('/mia', requireAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const actual = typeof b.actual === 'string' ? b.actual : '';
    const nueva = typeof b.nueva === 'string' ? b.nueva : '';
    if (nueva.length < 8) return res.status(400).json({ error: 'La contraseña nueva tiene que tener al menos 8 caracteres' });
    const u = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { id: true, passwordHash: true } });
    if (!u || !(await bcrypt.compare(actual, u.passwordHash))) {
      return res.status(400).json({ error: 'La contraseña actual no es correcta' });
    }
    await prisma.usuario.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(nueva, 10) } });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo cambiar la contraseña' });
  }
});

export default router;
