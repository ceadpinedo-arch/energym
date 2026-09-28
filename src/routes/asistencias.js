import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();
const diaAR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

// POST /api/asistencias/checkin — el socio se identifica en la puerta y se registra su entrada
router.post('/checkin', async (req, res) => {
  const { dni, password } = req.body || {};
  if (!dni || !password) {
    return res.status(400).json({ permitido: false, motivo: 'Faltan datos' });
  }

  const usuario = await prisma.usuario.findUnique({ where: { dni } });
  if (!usuario) {
    return res.status(401).json({ permitido: false, motivo: 'DNI o contraseña incorrectos' });
  }

  const passwordOk = await bcrypt.compare(password, usuario.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ permitido: false, motivo: 'DNI o contraseña incorrectos' });
  }

  if (usuario.estadoPago !== 'AL_DIA') {
    return res.json({ permitido: false, motivo: 'Cuota vencida', nombre: usuario.nombre });
  }

  const dia = diaAR();
  await prisma.asistencia.upsert({ where: { usuarioId_dia: { usuarioId: usuario.id, dia } }, update: {}, create: { usuarioId: usuario.id, dia } });
  res.json({ permitido: true, nombre: usuario.nombre });
});

export default router;
