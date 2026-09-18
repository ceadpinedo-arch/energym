import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { grupo, grupoM, grupoMuscular } = req.query;
    const targetGrupo = grupo || grupoM || grupoMuscular;

    const where = {};

    if (targetGrupo && targetGrupo.toLowerCase() !== 'todos') {
      where.grupoMuscular = targetGrupo.toUpperCase();
    }

    const ejercicios = await prisma.ejercicio.findMany({ where });

    const respuestaFormateada = ejercicios.map(e => {
      const rawGrupo = e.grupoMuscular || '';
      const grupoFormateado = rawGrupo
        ? rawGrupo.charAt(0).toUpperCase() + rawGrupo.slice(1).toLowerCase()
        : rawGrupo;

      return {
        ...e,
        grupo: grupoFormateado,
        grupoM: grupoFormateado,
        grupoMuscular: grupoFormateado,
        imagen: e.imagenUrl,
        imagenUrl: e.imagenUrl,
        url: e.imagenUrl
      };
    });

    res.json(respuestaFormateada);
  } catch (error) {
    console.error('Error al obtener ejercicios:', error);
    res.status(500).json({ error: 'Error interno al obtener ejercicios' });
  }
});

export default router;
