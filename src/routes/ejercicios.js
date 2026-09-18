import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { grupo, grupoM } = req.query;
    const targetGrupo = grupo || grupoM;

    const where = {};

    if (targetGrupo && targetGrupo.toLowerCase() !== 'todos') {
      where.grupoM = {
        equals: targetGrupo,
        mode: 'insensitive'
      };
    }

    const ejercicios = await prisma.ejercicio.findMany({ where });
    res.json(ejercicios);
  } catch (error) {
    console.error('Error al obtener ejercicios:', error);
    res.status(500).json({ error: 'Error interno al obtener ejercicios' });
  }
});

export default router;
