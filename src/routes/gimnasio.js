import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.usuario.id },
    include: { gimnasio: true },
  });
  if (!usuario?.gimnasio) return res.status(404).json({ error: 'Sin gimnasio asignado' });
  res.json(usuario.gimnasio);
});

const limpiarWhatsapp = (v) => String(v).replace(/\D/g, '');
const limpiarInstagram = (v) => {
  const s = String(v).trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
  return s.split(/[/?#]/)[0].replace(/^@/, '');
};

const updateSchema = z.object({
  nombre: z.string().min(1).max(60).optional(),
  logoBase64: z.string().optional(),
  cuota: z.number().positive().max(100000000).optional(),
  whatsapp: z.string().max(200).optional(),
  instagram: z.string().max(200).optional(),
});

router.patch('/me', requireAuth, requireAdmin, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });

  const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
  if (!usuario?.gimnasioId) return res.status(404).json({ error: 'Sin gimnasio asignado' });

  const data = {};
  if (parsed.data.nombre) data.nombre = parsed.data.nombre;
  if (parsed.data.logoBase64) data.logoUrl = parsed.data.logoBase64;
  if (parsed.data.cuota) data.cuota = parsed.data.cuota;
  if (parsed.data.whatsapp !== undefined) data.whatsapp = limpiarWhatsapp(parsed.data.whatsapp) || null;
  if (parsed.data.instagram !== undefined) data.instagram = limpiarInstagram(parsed.data.instagram) || null;

  const gimnasio = await prisma.gimnasio.update({
    where: { id: usuario.gimnasioId },
    data,
  });
  res.json(gimnasio);
});

export default router;
