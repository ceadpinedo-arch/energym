import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Ver mi rutina con series y repeticiones
router.get('/me', requireAuth, async (req, res) => {
  const rutina = await prisma.rutina.findUnique({
    where: { usuarioId: req.usuario.id },
    include: { ejercicios: { include: { ejercicio: true }, orderBy: { orden: 'asc' } } },
  });
  res.json(rutina ?? { ejercicios: [] });
});

const itemSchema = z.object({
  ejercicioId: z.string().uuid(),
  series: z.number().int().positive().default(3),
  repeticiones: z.number().int().positive().default(12),
});

const rutinaSchema = z.object({
  items: z.array(itemSchema).min(1),
});

// Guardar/reemplazar la rutina completa del socio logueado
router.put('/me', requireAuth, async (req, res) => {
  const parsed = rutinaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Rutina inválida' });

  const rutina = await prisma.rutina.upsert({
    where: { usuarioId: req.usuario.id },
    update: {},
    create: { usuarioId: req.usuario.id },
  });

  await prisma.rutinaEjercicio.deleteMany({ where: { rutinaId: rutina.id } });
  await prisma.rutinaEjercicio.createMany({
    data: parsed.data.items.map((item, i) => ({
      rutinaId: rutina.id,
      ejercicioId: item.ejercicioId,
      series: item.series,
      repeticiones: item.repeticiones,
      orden: i,
    })),
  });

  res.json({ ok: true });
});

export default router;
