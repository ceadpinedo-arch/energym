import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Listar ejercicios, opcionalmente filtrados por grupo muscular
router.get('/', requireAuth, async (req, res) => {
  const { grupo } = req.query;
  const ejercicios = await prisma.ejercicio.findMany({
    where: grupo ? { grupo: String(grupo).toUpperCase() } : undefined,
    orderBy: { nombre: 'asc' },
  });
  res.json(ejercicios);
});

const ejercicioSchema = z.object({
  nombre: z.string().min(2),
  grupo: z.enum(['PECHO', 'ESPALDA', 'PIERNAS', 'HOMBRO', 'BRAZO', 'CORE']),
  descripcion: z.string().min(5),
  videoUrl: z.string().url().optional(),
});

// Admin: agregar un ejercicio a la biblioteca
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const parsed = ejercicioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos de ejercicio inválidos' });

  const ejercicio = await prisma.ejercicio.create({ data: parsed.data });
  res.status(201).json(ejercicio);
});

export default router;
