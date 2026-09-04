import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

function proximoVencimiento(desde = new Date()) {
  const d = new Date(desde);
  d.setMonth(d.getMonth() + 1);
  return d;
}

// Historial de pagos del socio logueado
router.get('/me', requireAuth, async (req, res) => {
  const pagos = await prisma.pago.findMany({
    where: { usuarioId: req.usuario.id },
    orderBy: { pagadoEn: 'desc' },
  });
  res.json(pagos);
});

// Admin: registrar un pago en efectivo y actualizar estado de cuota
const efectivoSchema = z.object({
  usuarioId: z.string().uuid(),
  monto: z.number().positive(),
  periodo: z.string(), // "2026-09"
});

router.post('/efectivo', requireAuth, requireAdmin, async (req, res) => {
  const parsed = efectivoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos de pago inválidos' });

  const { usuarioId, monto, periodo } = parsed.data;

  const pago = await prisma.pago.create({
    data: { usuarioId, monto, periodo, metodo: 'EFECTIVO', registradoPor: req.usuario.id },
  });

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { estadoPago: 'AL_DIA', vencimiento: proximoVencimiento() },
  });

  res.status(201).json(pago);
});

// Webhook de Mercado Pago: se llama cuando se acredita un cobro automático
router.post('/webhook/mercadopago', async (req, res) => {
  // Acá se valida la notificación contra la API de Mercado Pago y se
  // recupera el usuarioId asociado a la suscripción (guardado al crearla).
  const { usuarioId, monto, periodo } = req.body;
  if (!usuarioId) return res.status(400).end();

  await prisma.pago.create({
    data: { usuarioId, monto, periodo, metodo: 'MERCADO_PAGO' },
  });

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { estadoPago: 'AL_DIA', vencimiento: proximoVencimiento() },
  });

  res.status(200).end();
});

export default router;
