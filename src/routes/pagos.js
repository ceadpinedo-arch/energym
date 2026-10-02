import { Router } from 'express';
import { z } from 'zod';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN });

async function mesesDelSocio(usuarioId) {
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { plan: { select: { meses: true } } } });
  return (u && u.plan && u.plan.meses) || 1;
}

function proximoVencimiento(desde = new Date(), meses = 1) {
  const d = new Date(desde);
  d.setMonth(d.getMonth() + meses);
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
    data: { estadoPago: 'AL_DIA', vencimiento: proximoVencimiento(new Date(), await mesesDelSocio(usuarioId)) },
  });

  res.status(201).json(pago);
});

// Crear link de pago único para un socio (Checkout Pro)
const crearPreferenciaSchema = z.object({
  usuarioId: z.string().uuid(),
  monto: z.number().positive().optional(),
});

router.post('/crear-preferencia', requireAuth, async (req, res) => {
  const parsed = crearPreferenciaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });

  const { usuarioId } = parsed.data;
    const socioMP = await prisma.usuario.findUnique({ where: { id: usuarioId }, include: { gimnasio: true, plan: true } });
    const monto = (socioMP && socioMP.plan ? socioMP.plan.precio : null) ?? socioMP?.gimnasio?.cuota ?? parsed.data.monto;
    if (!monto) return res.status(400).json({ error: 'Cuota no configurada' });

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
        external_reference: usuarioId + '|' + periodo + '|' + monto,
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
      data: { estadoPago: 'AL_DIA', vencimiento: proximoVencimiento(new Date(), await mesesDelSocio(usuarioId)) },
    });

    res.status(200).end();
  } catch (error) {
    console.error('Error en webhook Mercado Pago:', error);
    res.status(200).end();
  }
});

const ZONA_AR = 'America/Argentina/Buenos_Aires';
const fechaAR = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: ZONA_AR });
const inicioMesAR = (anio, mes) => new Date(anio + '-' + String(mes).padStart(2, '0') + '-01T00:00:00-03:00');

// Admin: resumen del gimnasio (tarjetas, vencimientos, asistencia y cobros)
router.get('/resumen', requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { gimnasioId: true } });
    const gimnasioId = admin?.gimnasioId || null;
    const delGimnasio = gimnasioId ? { gimnasioId } : {};
    const pagoWhere = gimnasioId ? { usuario: { gimnasioId } } : {};

    const ahora = new Date();
    const hoy = fechaAR(ahora);
    const [anio, mes] = hoy.split('-').map(Number);
    const inicioMes = inicioMesAR(anio, mes);
    const inicioMesPrev = mes === 1 ? inicioMesAR(anio - 1, 12) : inicioMesAR(anio, mes - 1);
    const dias = Array.from({ length: 7 }, (_, i) => fechaAR(new Date(ahora.getTime() - (6 - i) * 86400000)));
    const en7 = new Date(ahora.getTime() + 7 * 86400000);
    const socio = { ...delGimnasio, rol: 'SOCIO' };

    const [pagosMes, pagosPrev, sociosActivos, vencidos, nuevosMes, entradasHoy,
      porVencer, vencidosLista, asistSemana, porMetodo, ultimosPagos] = await Promise.all([
      prisma.pago.aggregate({ where: { ...pagoWhere, pagadoEn: { gte: inicioMes } }, _sum: { monto: true }, _count: { _all: true } }),
      prisma.pago.aggregate({ where: { ...pagoWhere, pagadoEn: { gte: inicioMesPrev, lt: inicioMes } }, _sum: { monto: true } }),
      prisma.usuario.count({ where: socio }),
      prisma.usuario.count({ where: { ...socio, estadoPago: 'VENCIDO' } }),
      prisma.usuario.count({ where: { ...socio, creadoEn: { gte: inicioMes } } }),
      prisma.asistencia.count({ where: { dia: hoy, usuario: delGimnasio } }),
      prisma.usuario.findMany({
        where: { ...socio, estadoPago: { not: 'VENCIDO' }, vencimiento: { gte: ahora, lte: en7 } },
        orderBy: { vencimiento: 'asc' }, take: 10,
        select: { id: true, nombre: true, dni: true, vencimiento: true },
      }),
      prisma.usuario.findMany({
        where: { ...socio, estadoPago: 'VENCIDO' },
        orderBy: { vencimiento: 'asc' }, take: 10,
        select: { id: true, nombre: true, dni: true, vencimiento: true },
      }),
      prisma.asistencia.groupBy({ by: ['dia'], where: { dia: { gte: dias[0] }, usuario: delGimnasio }, _count: { _all: true } }),
      prisma.pago.groupBy({ by: ['metodo'], where: { ...pagoWhere, pagadoEn: { gte: inicioMes } }, _sum: { monto: true }, _count: { _all: true } }),
      prisma.pago.findMany({
        where: pagoWhere, orderBy: { pagadoEn: 'desc' }, take: 5,
        select: { id: true, monto: true, metodo: true, pagadoEn: true, usuario: { select: { nombre: true } } },
      }),
    ]);

    const conteoPorDia = Object.fromEntries(asistSemana.map((a) => [a.dia, a._count._all]));
    res.json({
      totalMes: pagosMes._sum.monto || 0,
      cantidadPagos: pagosMes._count._all,
      totalMesAnterior: pagosPrev._sum.monto || 0,
      sociosActivos, vencidos, nuevosMes, entradasHoy,
      porVencer, vencidosLista,
      asistenciaSemana: dias.map((dia) => ({ dia, cantidad: conteoPorDia[dia] || 0 })),
      porMetodo: porMetodo.map((m) => ({ metodo: m.metodo, total: m._sum.monto || 0, cantidad: m._count._all })),
      ultimosPagos,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el resumen' });
  }
});

// Admin: historial de pagos del mes, con filtro por método
router.get('/historial', requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { gimnasioId: true } });
    const gimnasioId = admin?.gimnasioId || null;
    const pedido = typeof req.query.mes === 'string' ? req.query.mes : '';
    const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : fechaAR().slice(0, 7);
    const [anio, m] = mes.split('-').map(Number);
    const desde = inicioMesAR(anio, m);
    const hasta = m === 12 ? inicioMesAR(anio + 1, 1) : inicioMesAR(anio, m + 1);
    const where = { pagadoEn: { gte: desde, lt: hasta } };
    if (gimnasioId) where.usuario = { gimnasioId };
    if (['EFECTIVO', 'MERCADO_PAGO'].includes(req.query.metodo)) where.metodo = req.query.metodo;
    const pagos = await prisma.pago.findMany({
      where, orderBy: { pagadoEn: 'desc' }, take: 500,
      select: { id: true, monto: true, periodo: true, metodo: true, pagadoEn: true, usuario: { select: { nombre: true, dni: true } } },
    });
    res.json({ mes, pagos, total: pagos.reduce((a, p) => a + p.monto, 0), cantidad: pagos.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el historial' });
  }
});

// Admin: socios con la cuota vencida, para recordatorios
router.get('/morosos', requireAuth, requireAdmin, async (req, res) => {
  try {
    const admin = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { gimnasioId: true } });
    const gimnasioId = admin?.gimnasioId || null;
    const [socios, gimnasio] = await Promise.all([
      prisma.usuario.findMany({
        where: { rol: 'SOCIO', estadoPago: 'VENCIDO', ...(gimnasioId ? { gimnasioId } : {}) },
        orderBy: { vencimiento: 'asc' },
        select: { id: true, nombre: true, dni: true, telefono: true, vencimiento: true, plan: { select: { nombre: true, precio: true, meses: true } } },
      }),
      gimnasioId ? prisma.gimnasio.findUnique({ where: { id: gimnasioId }, select: { nombre: true, cuota: true } }) : null,
    ]);
    res.json({ socios, gimnasio });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los morosos' });
  }
});

export default router;
