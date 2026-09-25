import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

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

  await prisma.asistencia.create({ data: { usuarioId: usuario.id } });
  res.json({ permitido: true, nombre: usuario.nombre });
});

export default router;
