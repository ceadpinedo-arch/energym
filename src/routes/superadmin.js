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

export default router;
