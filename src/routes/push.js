import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
const uid = (req) => req.usuario.id ?? req.usuario.sub ?? req.usuario.usuarioId;

const schema = z.object({ token: z.string().min(10) });

router.post('/registrar', requireAuth, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Token inválido' });
  try {
    await prisma.pushToken.upsert({
      where: { token: parsed.data.token },
      update: { usuarioId: uid(req) },
      create: { usuarioId: uid(req), token: parsed.data.token },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al registrar token' });
  }
});

router.post('/enviar-recordatorios', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { enviarRecordatoriosCuota } = await import('../cron.js');
    const r = await enviarRecordatoriosCuota();
    res.json(r);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al enviar recordatorios' });
  }
});

export default router;
