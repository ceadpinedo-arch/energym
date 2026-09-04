import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../prisma.js';

const router = Router();

const loginSchema = z.object({
  dni: z.string().min(3),
  password: z.string().min(4),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'DNI o contraseña inválidos' });

  const { dni, password } = parsed.data;
  const usuario = await prisma.usuario.findUnique({ where: { dni } });
  if (!usuario) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

  const valido = await bcrypt.compare(password, usuario.passwordHash);
  if (!valido) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

  const token = jwt.sign(
    { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      estadoPago: usuario.estadoPago,
      vencimiento: usuario.vencimiento,
    },
  });
});

export default router;
