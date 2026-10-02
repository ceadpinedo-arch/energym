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
      prisma.gimnasio.findMany({ orderBy: { creadoEn: 'desc' }, select: { id: true, nombre: true, cuota: true, creadoEn: true } }),
      prisma.usuario.groupBy({ by: ['gimnasioId'], where: { rol: 'SOCIO' }, _count: { _all: true } }),
      prisma.usuario.findMany({ where: { rol: 'ADMIN' }, select: { gimnasioId: true, nombre: true, dni: true } }),
    ]);
    const lista = gimnasios.map((g) => {
      const c = socios.find((s) => s.gimnasioId === g.id);
      return {
        ...g,
        socios: c ? c._count._all : 0,
        admins: admins.filter((a) => a.gimnasioId === g.id).map((a) => ({ nombre: a.nombre, dni: a.dni })),
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

export default router;
