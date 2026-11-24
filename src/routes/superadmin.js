import { limpiarCache } from '../middleware/activo.js';
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { esSuper, requireSuper } from '../middleware/super.js';

const router = Router();

router.get('/yo', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json({ super: await esSuper(req) });
  } catch (e) {
    res.json({ super: false });
  }
});

router.get('/gimnasios', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  try {
    const [gimnasios, socios, admins] = await Promise.all([
      prisma.gimnasio.findMany({ orderBy: { creadoEn: 'desc' }, select: { id: true, nombre: true, cuota: true, creadoEn: true, activo: true } }),
      prisma.usuario.groupBy({ by: ['gimnasioId'], where: { rol: 'SOCIO' }, _count: { _all: true } }),
      prisma.usuario.findMany({ where: { rol: 'ADMIN' }, orderBy: { creadoEn: 'asc' }, select: { id: true, gimnasioId: true, nombre: true, dni: true } }),
    ]);
    const lista = gimnasios.map((g) => {
      const c = socios.find((s) => s.gimnasioId === g.id);
      return {
        ...g,
        socios: c ? c._count._all : 0,
        admins: admins.filter((a) => a.gimnasioId === g.id).map((a) => ({ id: a.id, nombre: a.nombre, dni: a.dni })),
      };
    });
    res.json(lista);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar los gimnasios' });
  }
});

const nuevoSchema = z.object({
  nombre: z.string().min(1).max(60),
  cuota: z.number().positive().max(100000000).optional(),
  adminNombre: z.string().min(1).max(80),
  adminDni: z.string().regex(/^[0-9]{6,9}$/),
  adminPassword: z.string().min(8).max(100),
});

router.post('/gimnasios', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  const p = nuevoSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos: el DNI son 6 a 9 números y la contraseña al menos 8 caracteres.' });
  const d = p.data;
  try {
    const yaExiste = await prisma.usuario.findUnique({ where: { dni: d.adminDni } });
    if (yaExiste) return res.status(409).json({ error: 'Ya existe un usuario con ese DNI' });
    const hash = await bcrypt.hash(d.adminPassword, 10);
    const r = await prisma.$transaction(async (tx) => {
      const g = await tx.gimnasio.create({ data: { nombre: d.nombre, cuota: d.cuota || 15000 } });
      const a = await tx.usuario.create({
        data: { dni: d.adminDni, nombre: d.adminNombre, passwordHash: hash, rol: 'ADMIN', gimnasioId: g.id },
      });
      return { g, a };
    });
    res.json({ id: r.g.id, nombre: r.g.nombre, admin: { nombre: r.a.nombre, dni: r.a.dni } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo crear el gimnasio' });
  }
});

router.patch('/gimnasios/:id/activo', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  try {
    const activo = !!(req.body && req.body.activo === true);
    const g = await prisma.gimnasio.findUnique({ where: { id: req.params.id } });
    if (!g) return res.status(404).json({ error: 'Gimnasio no encontrado' });
    if (!activo) {
      const yo = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { gimnasioId: true } });
      if (yo && yo.gimnasioId === g.id) return res.status(400).json({ error: 'No pod\u00e9s desactivar el gimnasio de tu propia cuenta' });
    }
    await prisma.gimnasio.update({ where: { id: g.id }, data: { activo } });
    limpiarCache();
    res.json({ id: g.id, activo });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo cambiar el estado' });
  }
});

const editSchema = z.object({
  nombre: z.string().min(1).max(60).optional(),
  cuota: z.number().positive().max(100000000).optional(),
  adminId: z.string().optional(),
  adminNombre: z.string().min(1).max(80).optional(),
  adminDni: z.string().regex(/^[0-9]{6,9}$/).optional(),
  adminPassword: z.string().min(8).max(100).optional(),
});

router.patch('/gimnasios/:id', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  const p = editSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inv\u00e1lidos: el DNI son 6 a 9 n\u00fameros y la contrase\u00f1a al menos 8 caracteres.' });
  const d = p.data;
  try {
    const g = await prisma.gimnasio.findUnique({ where: { id: req.params.id } });
    if (!g) return res.status(404).json({ error: 'Gimnasio no encontrado' });
    const tocaAdmin = !!(d.adminNombre || d.adminDni || d.adminPassword);
    let admin = null;
    if (tocaAdmin) {
      admin = d.adminId
        ? await prisma.usuario.findFirst({ where: { id: d.adminId, gimnasioId: g.id, rol: 'ADMIN' } })
        : await prisma.usuario.findFirst({ where: { gimnasioId: g.id, rol: 'ADMIN' }, orderBy: { creadoEn: 'asc' } });
      if (!admin) return res.status(404).json({ error: 'Ese gimnasio no tiene administrador' });
      if (admin.id === req.usuario.id) return res.status(400).json({ error: 'Tu propia cuenta no se edita desde ac\u00e1' });
      if (d.adminDni && d.adminDni !== admin.dni) {
        const ya = await prisma.usuario.findUnique({ where: { dni: d.adminDni } });
        if (ya) return res.status(409).json({ error: 'Ya existe un usuario con ese DNI' });
      }
    }
    const dataG = {};
    if (d.nombre) dataG.nombre = d.nombre.trim();
    if (d.cuota) dataG.cuota = d.cuota;
    const dataA = {};
    if (d.adminNombre) dataA.nombre = d.adminNombre.trim();
    if (d.adminDni) dataA.dni = d.adminDni;
    if (d.adminPassword) dataA.passwordHash = await bcrypt.hash(d.adminPassword, 10);
    const ops = [];
    if (Object.keys(dataG).length > 0) ops.push(prisma.gimnasio.update({ where: { id: g.id }, data: dataG }));
    if (admin && Object.keys(dataA).length > 0) ops.push(prisma.usuario.update({ where: { id: admin.id }, data: dataA }));
    if (ops.length > 0) await prisma.$transaction(ops);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo guardar' });
  }
});

const nuevoAdminSchema = z.object({
  nombre: z.string().min(1).max(80),
  dni: z.string().regex(/^[0-9]{6,9}$/),
  password: z.string().min(8).max(100),
});

// Dueño: agregar un administrador a un gimnasio
router.post('/gimnasios/:id/admins', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  const p = nuevoAdminSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos: el DNI son 6 a 9 números y la contraseña al menos 8 caracteres.' });
  try {
    const g = await prisma.gimnasio.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!g) return res.status(404).json({ error: 'Gimnasio no encontrado' });
    const yaExiste = await prisma.usuario.findUnique({ where: { dni: p.data.dni } });
    if (yaExiste) return res.status(409).json({ error: 'Ya existe un usuario con ese DNI' });
    const hash = await bcrypt.hash(p.data.password, 10);
    const a = await prisma.usuario.create({
      data: { dni: p.data.dni, nombre: p.data.nombre, passwordHash: hash, rol: 'ADMIN', gimnasioId: g.id },
    });
    res.json({ id: a.id, nombre: a.nombre, dni: a.dni });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo agregar el administrador' });
  }
});

// Dueño: quitar un administrador de un gimnasio (el gimnasio siempre conserva al menos uno)
router.post('/gimnasios/:id/admins/:adminId/quitar', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  try {
    if (req.params.adminId === req.usuario.id) return res.status(400).json({ error: 'No podés quitar tu propia cuenta' });
    const admins = await prisma.usuario.findMany({ where: { rol: 'ADMIN', gimnasioId: req.params.id }, select: { id: true } });
    const objetivo = admins.filter((x) => x.id === req.params.adminId)[0];
    if (!objetivo) return res.status(404).json({ error: 'Ese administrador no pertenece a este gimnasio' });
    if (admins.length <= 1) return res.status(409).json({ error: 'El gimnasio necesita al menos un administrador. Agregá otro antes de quitar este.' });
    try {
      await prisma.usuario.delete({ where: { id: objetivo.id } });
      return res.json({ ok: true, accion: 'eliminado' });
    } catch (e) {
      await prisma.usuario.update({ where: { id: objetivo.id }, data: { rol: 'SOCIO' } });
      return res.json({ ok: true, accion: 'pasado a socio' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo quitar el administrador' });
  }
});

let columnasSuscripcionListas = false;
async function asegurarColumnasSuscripcion() {
  if (columnasSuscripcionListas) return;
  await prisma.$executeRawUnsafe('ALTER TABLE "Gimnasio" ADD COLUMN IF NOT EXISTS "suscripcionPrecio" DOUBLE PRECISION');
  await prisma.$executeRawUnsafe('ALTER TABLE "Gimnasio" ADD COLUMN IF NOT EXISTS "suscripcionVence" TIMESTAMP(3)');
  columnasSuscripcionListas = true;
}

function estadoSuscripcion(vence) {
  if (!vence) return { estado: 'sin_fecha', dias: null };
  const dias = Math.ceil((new Date(vence).getTime() - Date.now()) / 86400000);
  if (dias < 0) return { estado: 'vencida', dias: dias };
  if (dias <= 7) return { estado: 'por_vencer', dias: dias };
  return { estado: 'al_dia', dias: dias };
}

// Dueño: numeros de su negocio. Solo cantidades por gimnasio, nunca datos personales de los socios.
router.get('/panel', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  try {
    await asegurarColumnasSuscripcion();
    const [gimnasios, socios, sociosAl, admins, susc] = await Promise.all([
      prisma.gimnasio.findMany({ orderBy: { creadoEn: 'asc' }, select: { id: true, nombre: true, activo: true, creadoEn: true } }),
      prisma.usuario.groupBy({ by: ['gimnasioId'], where: { rol: 'SOCIO' }, _count: { _all: true } }),
      prisma.usuario.groupBy({ by: ['gimnasioId'], where: { rol: 'SOCIO', estadoPago: { not: 'VENCIDO' } }, _count: { _all: true } }),
      prisma.usuario.groupBy({ by: ['gimnasioId'], where: { rol: 'ADMIN' }, _count: { _all: true } }),
      prisma.$queryRaw`SELECT "id", "suscripcionPrecio", "suscripcionVence" FROM "Gimnasio"`,
    ]);
    const cuenta = (arr, id) => {
      const c = arr.filter((x) => x.gimnasioId === id)[0];
      return c ? c._count._all : 0;
    };
    const lista = gimnasios.map((g) => {
      const f = susc.filter((x) => x.id === g.id)[0];
      const vence = f && f.suscripcionVence ? new Date(f.suscripcionVence) : null;
      return {
        id: g.id,
        nombre: g.nombre,
        activo: g.activo !== false,
        creadoEn: g.creadoEn,
        socios: cuenta(socios, g.id),
        sociosActivos: cuenta(sociosAl, g.id),
        admins: cuenta(admins, g.id),
        precio: f && f.suscripcionPrecio !== null && f.suscripcionPrecio !== undefined ? Number(f.suscripcionPrecio) : null,
        vence: vence ? vence.toISOString() : null,
        ...estadoSuscripcion(vence),
      };
    });
    const ahora = new Date();
    const mesClave = (d) => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    const altasPorMes = [];
    for (let i = 5; i >= 0; i--) {
      const clave = mesClave(new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - i, 1)));
      altasPorMes.push({ mes: clave, cantidad: lista.filter((g) => mesClave(new Date(g.creadoEn)) === clave).length });
    }
    const activos = lista.filter((g) => g.activo);
    res.json({
      resumen: {
        gimnasios: lista.length,
        activos: activos.length,
        suspendidos: lista.length - activos.length,
        socios: lista.reduce((a, g) => a + g.socios, 0),
        sociosActivos: lista.reduce((a, g) => a + g.sociosActivos, 0),
        admins: lista.reduce((a, g) => a + g.admins, 0),
        nuevosMes: altasPorMes[altasPorMes.length - 1].cantidad,
        ingresoMensual: activos.reduce((a, g) => a + (g.precio || 0), 0),
        porVencer: lista.filter((g) => g.estado === 'por_vencer').length,
        vencidas: lista.filter((g) => g.estado === 'vencida').length,
        sinFecha: lista.filter((g) => g.estado === 'sin_fecha').length,
      },
      lista: lista,
      altasPorMes: altasPorMes,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo armar el panel' });
  }
});

const suscSchema = z.object({
  precio: z.number().min(0).max(1000000000).nullable().optional(),
  vence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

// Dueño: precio mensual y fecha de vencimiento de la suscripcion de un gimnasio
router.patch('/gimnasios/:id/suscripcion', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  const p = suscSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos: el precio es un número y la fecha va como AAAA-MM-DD.' });
  try {
    await asegurarColumnasSuscripcion();
    const id = req.params.id;
    const g = await prisma.gimnasio.findUnique({ where: { id: id }, select: { id: true } });
    if (!g) return res.status(404).json({ error: 'Gimnasio no encontrado' });
    if (p.data.precio === null) {
      await prisma.$executeRaw`UPDATE "Gimnasio" SET "suscripcionPrecio" = NULL WHERE "id" = ${id}`;
    } else if (typeof p.data.precio === 'number') {
      await prisma.$executeRaw`UPDATE "Gimnasio" SET "suscripcionPrecio" = ${p.data.precio} WHERE "id" = ${id}`;
    }
    if (p.data.vence === null) {
      await prisma.$executeRaw`UPDATE "Gimnasio" SET "suscripcionVence" = NULL WHERE "id" = ${id}`;
    } else if (typeof p.data.vence === 'string') {
      const f = new Date(p.data.vence + 'T12:00:00.000Z');
      if (isNaN(f.getTime())) return res.status(400).json({ error: 'Fecha inválida' });
      await prisma.$executeRaw`UPDATE "Gimnasio" SET "suscripcionVence" = ${f} WHERE "id" = ${id}`;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo guardar la suscripción' });
  }
});

// Dueño: sumar meses a la suscripcion (desde hoy si ya estaba vencida)
router.post('/gimnasios/:id/suscripcion/renovar', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  const meses = Math.max(1, Math.min(24, parseInt(req.body && req.body.meses, 10) || 1));
  try {
    await asegurarColumnasSuscripcion();
    const id = req.params.id;
    const filas = await prisma.$queryRaw`SELECT "suscripcionVence" FROM "Gimnasio" WHERE "id" = ${id}`;
    if (!filas.length) return res.status(404).json({ error: 'Gimnasio no encontrado' });
    const actual = filas[0].suscripcionVence ? new Date(filas[0].suscripcionVence) : null;
    const base = actual && actual.getTime() > Date.now() ? actual : new Date();
    const nueva = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + meses, base.getUTCDate(), 12, 0, 0));
    await prisma.$executeRaw`UPDATE "Gimnasio" SET "suscripcionVence" = ${nueva} WHERE "id" = ${id}`;
    res.json({ ok: true, vence: nueva.toISOString() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo renovar la suscripción' });
  }
});

export default router;
