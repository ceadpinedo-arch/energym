import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const ZONA = 'America/Argentina/Buenos_Aires';

const hoyStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: ZONA });
const diaAnterior = (d) =>
  new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
const uid = (req) => req.usuario.id ?? req.usuario.sub ?? req.usuario.usuarioId;

async function calcularStats(usuarioId) {
  const hoy = hoyStr();
  const filas = await prisma.asistencia.findMany({
    where: { usuarioId },
    select: { dia: true },
    orderBy: { dia: 'desc' },
    take: 400,
  });
  const dias = new Set(filas.map((f) => f.dia));
  const mes = hoy.slice(0, 7);
  const visitasMes = filas.filter((f) => f.dia.startsWith(mes)).length;

  let cursor = dias.has(hoy) ? hoy : diaAnterior(hoy);
  let racha = 0;
  while (dias.has(cursor)) {
    racha++;
    cursor = diaAnterior(cursor);
  }
  return { visitasMes, racha, entroHoy: dias.has(hoy) };
}

router.get('/me', requireAuth, async (req, res) => {
  try {
    res.json(await calcularStats(uid(req)));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al obtener asistencia' });
  }
});

router.post('/hoy', requireAuth, async (req, res) => {
  try {
    const usuarioId = uid(req);
    const dia = hoyStr();
    await prisma.asistencia.upsert({
      where: { usuarioId_dia: { usuarioId, dia } },
      update: {},
      create: { usuarioId, dia },
    });
    res.json(await calcularStats(usuarioId));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al registrar asistencia' });
  }
});

export default router;
