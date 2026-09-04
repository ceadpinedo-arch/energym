import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Listar socios con su estado de cuota (solo admin)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const socios = await prisma.usuario.findMany({
    where: { rol: 'SOCIO' },
    select: { id: true, dni: true, nombre: true, estadoPago: true, vencimiento: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(socios);
});

const altaSchema = z.object({
  dni: z.string().min(6),
  nombre: z.string().min(2),
  password: z.string().min(4),
  email: z.string().email().optional(),
});

// Dar de alta un socio nuevo (solo admin)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const parsed = altaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos incompletos' });

  const { dni, nombre, password, email } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  const existente = await prisma.usuario.findUnique({ where: { dni } });
  if (existente) return res.status(409).json({ error: 'Ya existe un socio con ese DNI' });

  const socio = await prisma.usuario.create({
    data: { dni, nombre, email, passwordHash, rol: 'SOCIO' },
  });

  res.status(201).json({ id: socio.id, dni: socio.dni, nombre: socio.nombre });
});

// Estado de cuota propio (socio)
router.get('/me', requireAuth, async (req, res) => {
  const socio = await prisma.usuario.findUnique({
    where: { id: req.usuario.id },
    select: { id: true, dni: true, nombre: true, estadoPago: true, vencimiento: true },
  });
  res.json(socio);
});

export default router;
