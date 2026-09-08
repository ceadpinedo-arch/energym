import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

const GRUPOS_VALIDOS = ['PECHO', 'ESPALDA', 'PIERNAS', 'HOMBRO', 'BICEPS', 'TRICEPS', 'ABDOMINALES'];

// Listar ejercicios, opcionalmente filtrados por grupo muscular
router.get('/', requireAuth, async (req, res) => {
  try {
    const { grupo } = req.query;
    let whereClause = undefined;

    // Si envían un grupo específico (y no es 'TODOS'), aplicamos el filtro
    if (grupo && String(grupo).toUpperCase() !== 'TODOS' && String(grupo).trim() !== '') {
      const grupoUpper = String(grupo).toUpperCase();
      if (GRUPOS_VALIDOS.includes(grupoUpper)) {
        whereClause = { grupoMuscular: grupoUpper };
      }
    }

    const ejercicios = await prisma.ejercicio.findMany({
      where: whereClause,
      orderBy: { nombre: 'asc' },
    });

    res.json(ejercicios);
  } catch (error) {
    console.error('Error al obtener ejercicios:', error);
    res.status(500).json({ error: 'Error al obtener ejercicios' });
  }
});

const ejercicioSchema = z.object({
  nombre: z.string().min(2),
  grupoMuscular: z.enum(['PECHO', 'ESPALDA', 'PIERNAS', 'HOMBRO', 'BICEPS', 'TRICEPS', 'ABDOMINALES']),
  descripcion: z.string().optional(),
  imagenUrl: z.string().optional(),
});

// Admin: agregar un ejercicio a la biblioteca
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const parsed = ejercicioSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos de ejercicio inválidos', detalles: parsed.error.issues });
    }

    const ejercicio = await prisma.ejercicio.create({ data: parsed.data });
    res.status(201).json(ejercicio);
  } catch (error) {
    console.error('Error al crear ejercicio:', error);
    res.status(500).json({ error: 'Error interno al crear ejercicio' });
  }
});

export default router;
