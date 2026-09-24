import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const ZONA = 'America/Argentina/Buenos_Aires';
const hoyStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: ZONA });
const uid = (req) => req.usuario.id ?? req.usuario.sub ?? req.usuario.usuarioId;

const schema = z.object({
  registros: z
    .array(
      z.object({
        ejercicioId: z.string().min(1),
        peso: z.number().min(0).max(1000),
        series: z.number().int().min(0).max(50).default(0),
        repeticiones: z.number().int().min(0).max(1000).default(0),
      })
    )
    .min(1)
    .max(50),
});

router.post('/', requireAuth, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });
  try {
    const usuarioId = uid(req);
    const dia = hoyStr();
    for (const r of parsed.data.registros) {
      await prisma.registro.upsert({
        where: { usuarioId_ejercicioId_dia: { usuarioId, ejercicioId: r.ejercicioId, dia } },
        update: { peso: r.peso, series: r.series, repeticiones: r.repeticiones },
        create: { usuarioId, ejercicioId: r.ejercicioId, dia, peso: r.peso, series: r.series, repeticiones: r.repeticiones },
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar entrenamiento' });
  }
});

router.get('/ultimos', requireAuth, async (req, res) => {
  try {
    const filas = await prisma.registro.findMany({
      where: { usuarioId: uid(req) },
      orderBy: [{ dia: 'desc' }, { creadoEn: 'desc' }],
      take: 500,
    });
    const out = {};
    for (const f of filas) {
      if (!out[f.ejercicioId]) {
        out[f.ejercicioId] = { peso: f.peso, series: f.series, repeticiones: f.repeticiones, dia: f.dia };
      }
    }
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al obtener entrenamientos' });
  }
});

export default router;
