import { Router } from 'express';
import { z } from 'zod';
import prismaModule from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const prisma = prismaModule.prisma || prismaModule;
const uid = (req) => req.usuario.id ?? req.usuario.sub ?? req.usuario.usuarioId;

const EJERCICIOS_DEFAULT = [
  { id: '1', nombre: 'Press de Banca', grupo: 'PECHO', descripcion: '3 series x 10 repeticiones', imagenUrl: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=500' },
  { id: '2', nombre: 'Sentadillas', grupo: 'PIERNAS', descripcion: '4 series x 8 repeticiones', imagenUrl: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=500' },
  { id: '3', nombre: 'Dominadas', grupo: 'ESPALDA', descripcion: '3 series al fallo', imagenUrl: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=500' },
  { id: '4', nombre: 'Curl de Biceps', grupo: 'BRAZOS', descripcion: '3 series x 12 repeticiones', imagenUrl: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=500' },
  { id: '5', nombre: 'Press Militar', grupo: 'HOMBROS', descripcion: '3 series x 10 repeticiones', imagenUrl: 'https://images.unsplash.com/photo-1532029837206-abbe2b7620e3?w=500' },
];

const formatearEjercicio = (e) => ({
  ...e,
  id: String(e.id),
  grupo: (e.grupo || e.grupoMuscular || 'TODOS').toUpperCase(),
  imagenUrl: e.imagenUrl || e.imagen || e.uri || e.url || '',
});

// GET /api/rutinas
router.get('/', async (req, res) => {
  try {
    let ejercicios = [];
    if (prisma && prisma.ejercicio) {
      ejercicios = await prisma.ejercicio.findMany();
    }
    if (!ejercicios || ejercicios.length === 0) {
      ejercicios = EJERCICIOS_DEFAULT;
    }
    res.json(ejercicios.map(formatearEjercicio));
  } catch (error) {
    res.json(EJERCICIOS_DEFAULT.map(formatearEjercicio));
  }
});

// GET /api/rutinas/me — trae la rutina guardada del socio
router.get('/me', requireAuth, async (req, res) => {
  try {
    const rutina = await prisma.rutina.findUnique({
      where: { usuarioId: uid(req) },
      include: { ejercicios: { orderBy: { orden: 'asc' } } },
    });
    if (!rutina) return res.json({ items: [] });
    res.json({
      items: rutina.ejercicios.map((re) => ({
        ejercicioId: re.ejercicioId,
        dia: re.dia || null,
        series: re.series,
        repeticiones: re.repeticiones,
        orden: re.orden,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener la rutina' });
  }
});

const itemSchema = z.object({
  ejercicioId: z.string().min(1),
  dia: z.string().max(40).nullable().optional(),
  series: z.number().int().min(0).max(50).optional().default(4),
  repeticiones: z.string().max(20).optional().default('10-12'),
});

const putSchema = z.object({
  items: z.array(itemSchema).max(100),
});

// PUT /api/rutinas/me — guarda la rutina del socio (reemplaza los ítems)
router.put('/me', requireAuth, async (req, res) => {
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });
  try {
    const usuarioId = uid(req);
    const rutina = await prisma.rutina.upsert({
      where: { usuarioId },
      update: {},
      create: { usuarioId },
    });
    await prisma.rutinaEjercicio.deleteMany({ where: { rutinaId: rutina.id } });
    const { items } = parsed.data;
    if (items.length > 0) {
      await prisma.rutinaEjercicio.createMany({
        data: items.map((it, idx) => ({
          rutinaId: rutina.id,
          ejercicioId: it.ejercicioId,
          dia: it.dia || null,
          series: it.series,
          repeticiones: it.repeticiones,
          orden: idx,
        })),
      });
    }
    res.json({ success: true, message: 'Rutina guardada correctamente', items });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al guardar rutina' });
  }
});

export default router;
