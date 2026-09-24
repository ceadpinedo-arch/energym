import { Router } from 'express';
import { z } from 'zod';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

function proximoVencimiento(desde = new Date()) {
  const d = new Date(desde);
  d.setMonth(d.getMonth() + 1);
  return d;
}

function periodoActual() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
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
  periodo: z.string(),
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

// Crear link de pago único para un socio (Checkout Pro)
const crearPreferenciaSchema = z.object({
  usuarioId: z.string().uuid(),
  monto: z.number().positive(),
});

router.post('/crear-preferencia', requireAuth, async (req, res) => {
  const parsed = crearPreferenciaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });

  const { usuarioId, monto } = parsed.data;

  if (req.usuario.rol !== 'ADMIN' && req.usuario.id !== usuarioId) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const socio = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });

  const periodo = periodoActual();

  try {
    const preference = new Preference(mpClient);
    const result = await preference.create({
      body: {
        items: [
          {
            title: `Cuota Energym - ${periodo}`,
            quantity: 1,
            unit_price: monto,
            currency_id: 'ARS',
          },
        ],
        external_reference: `${usuarioId}|${periodo}|${monto}`,
        notification_url: `${process.env.BACKEND_URL}/api/pagos/webhook/mercadopago`,
      },
    });

    res.json({ initPoint: result.init_point, preferenceId: result.id });
  } catch (error) {
    console.error('Error creando preferencia MP:', error);
    res.status(500).json({ error: 'No se pudo crear el link de pago' });
  }
});

// Webhook de Mercado Pago: consulta el pago real en la API antes de registrar nada
router.post('/webhook/mercadopago', async (req, res) => {
  try {
    const paymentId = req.query['data.id'] || req.body?.data?.id;
    const type = req.query.type || req.body?.type;

    if (type !== 'payment' || !paymentId) {
      return res.status(200).end();
    }

    const paymentClient = new Payment(mpClient);
    const payment = await paymentClient.get({ id: paymentId });

    if (payment.status !== 'approved') {
      return res.status(200).end();
    }

    const [usuarioId, periodo, montoStr] = (payment.external_reference || '').split('|');
    if (!usuarioId || !periodo) return res.status(200).end();

    const monto = Number(montoStr) || payment.transaction_amount;

    const yaRegistrado = await prisma.pago.findFirst({
      where: { usuarioId, periodo, metodo: 'MERCADO_PAGO' },
    });
    if (yaRegistrado) return res.status(200).end();

    await prisma.pago.create({
      data: { usuarioId, monto, periodo, metodo: 'MERCADO_PAGO' },
    });

    await prisma.usuario.update({
      where: { id: usuarioId },
      data: { estadoPago: 'AL_DIA', vencimiento: proximoVencimiento() },
    });

    res.status(200).end();
  } catch (error) {
    console.error('Error en webhook Mercado Pago:', error);
    res.status(200).end();
  }
});

// Admin: resumen de ingresos del mes
router.get('/resumen', requireAuth, requireAdmin, async (req, res) => {
  try {
    const hoy = new Date();
    const inicioMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
    const pagos = await prisma.pago.findMany({
      where: { pagadoEn: { gte: inicioMes } },
      select: { monto: true },
    });
    const totalMes = pagos.reduce((acc, p) => acc + p.monto, 0);
    res.json({ totalMes, cantidadPagos: pagos.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el resumen' });
  }
});

export default router;
