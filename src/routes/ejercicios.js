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

      const img = e.imagenUrl || e.imagen || '';

      return {
        ...e,
        // Compatibilidad de IDs para handlers de clic y selección de rutina
        id: e.id,
        _id: e.id,

        // Compatibilidad de textos
        nombre: e.nombre,
        title: e.nombre,
        name: e.nombre,
        descripcion: e.descripcion,
        description: e.descripcion,

        // Compatibilidad de grupos musculares
        grupo: grupoFormateado,
        grupoM: grupoFormateado,
        grupoMuscular: grupoFormateado,
        category: grupoFormateado,

        // Compatibilidad de imágenes
        imagen: img,
        imagenUrl: img,
        url: img,
        foto: img,
        image: img,
        src: img
      };
    });

    res.json(respuestaFormateada);
  } catch (error) {
    console.error('Error al obtener ejercicios:', error);
    res.status(500).json({ error: 'Error interno al obtener ejercicios' });
  }
});

export default router;
