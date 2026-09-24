import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { grupo, grupoM, grupoMuscular, ids, id } = req.query;
    const targetGrupo = grupo || grupoM || grupoMuscular;

    const where = {};

    const rawIds = ids || id;
    if (rawIds) {
      const idArray = Array.isArray(rawIds) 
        ? rawIds 
        : String(rawIds).split(',').map(s => s.trim());
      where.id = { in: idArray };
    } else if (targetGrupo && targetGrupo.toLowerCase() !== 'todos') {
      where.grupoMuscular = targetGrupo.toUpperCase();
    }

    const ejercicios = await prisma.ejercicio.findMany({ where });

    const respuestaFormateada = ejercicios.map(e => {
      const rawGrupo = e.grupoMuscular || '';
      const grupoFormateado = rawGrupo
        ? rawGrupo.charAt(0).toUpperCase() + rawGrupo.slice(1).toLowerCase()
        : rawGrupo;

      const imgUrl = e.imagenUrl || e.imagen || '';
      const idString = String(e.id);
      const imgObject = imgUrl ? { uri: imgUrl } : null;

      return {
        ...e,
        // Identificadores
        id: idString,
        _id: idString,
        key: idString,
        id_ejercicio: idString,

        // Textos
        nombre: e.nombre,
        title: e.nombre,
        name: e.nombre,
        descripcion: e.descripcion,
        description: e.descripcion,

        // Categorías
        grupo: grupoFormateado,
        grupoM: grupoFormateado,
        grupoMuscular: grupoFormateado,

        // Imágenes en formato Texto (String)
        imagen: imgUrl,
        imagenUrl: imgUrl,
        url: imgUrl,
        foto: imgUrl,
        src: imgUrl,
        uri: imgUrl,

        // Imágenes en formato Objeto React Native ({ uri: '...' })
        source: imgObject,
        image: imgObject,
        cover: imgObject,
        avatar: imgObject
      };
    });

    res.json(respuestaFormateada);
  } catch (error) {
    console.error('Error al obtener ejercicios:', error);
    res.status(500).json({ error: 'Error interno al obtener ejercicios' });
  }
});

export default router;
