import { Router } from 'express';
import { z } from 'zod';
import pkg from '@prisma/client';
import prismaModule from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { esSuper } from '../middleware/super.js';

const { GrupoMuscular } = pkg;
const router = Router();
const prisma = prismaModule.prisma || prismaModule;
router.use(requireAuth, requireAdmin);

async function gimnasioDe(req) {
  const u = await prisma.usuario.findUnique({
    where: { id: req.usuario.id },
    select: { gimnasioId: true },
  });
  return u ? u.gimnasioId : null;
}

const ejSchema = z.object({
  nombre: z.string().min(1).max(80),
  grupoMuscular: z.nativeEnum(GrupoMuscular),
  descripcion: z.string().max(300).nullable().optional(),
  imagenUrl: z.string().max(600000).nullable().optional(),
  videoUrl: z.string().max(300).regex(/^https?:\/\//i, 'Enlace invalido').nullable().optional(),
});

const itemsSchema = z.array(z.object({
  ejercicioId: z.string().min(1),
  dia: z.string().max(40).nullable().optional(),
  series: z.number().int().min(0).max(50).optional().default(4),
  repeticiones: z.string().max(20).optional().default('10-12'),
})).max(100);

const plantillaSchema = z.object({
  nombre: z.string().min(1).max(80),
  items: itemsSchema,
});

const incluirItems = {
  items: {
    orderBy: { orden: 'asc' },
    include: { ejercicio: { select: { id: true, nombre: true, grupoMuscular: true, imagenUrl: true } } },
  },
};

function itemsData(items) {
  return items.map((it, idx) => ({
    ejercicioId: it.ejercicioId,
    dia: it.dia || null,
    series: it.series,
    repeticiones: it.repeticiones,
    orden: idx,
  }));
}

// ---------- Ejercicios ----------
async function puedeEditar(req, e) {
  if (!e) return false;
  const gid = await gimnasioDe(req);
  if (e.gimnasioId) return e.gimnasioId === gid;
  return esSuper(req);
}

router.get('/grupos', (req, res) => {
  res.json(Object.values(GrupoMuscular));
});

router.get('/ejercicios', async (req, res) => {
  const gid = await gimnasioDe(req);
  const sup = await esSuper(req);
  const lista = await prisma.ejercicio.findMany({
    where: { OR: [{ gimnasioId: null }, { gimnasioId: gid }] },
    orderBy: [{ grupoMuscular: 'asc' }, { nombre: 'asc' }],
  });
  res.json(lista.map((e) => ({ ...e, editable: e.gimnasioId ? e.gimnasioId === gid : sup })));
});

router.post('/ejercicios', async (req, res) => {
  const p = ejSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos' });
  const gid = await gimnasioDe(req);
  const base = req.body.base === true && (await esSuper(req));
  const nuevo = await prisma.ejercicio.create({ data: { ...p.data, gimnasioId: base ? null : gid } });
  res.json(nuevo);
});

router.put('/ejercicios/:id', async (req, res) => {
  const p = ejSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos' });
  const e = await prisma.ejercicio.findUnique({ where: { id: req.params.id } });
  if (!e) return res.status(404).json({ error: 'Ejercicio no encontrado' });
  if (!(await puedeEditar(req, e))) return res.status(403).json({ error: 'No podés editar este ejercicio' });
  const act = await prisma.ejercicio.update({ where: { id: e.id }, data: p.data });
  res.json(act);
});

router.delete('/ejercicios/:id', async (req, res) => {
  const e = await prisma.ejercicio.findUnique({ where: { id: req.params.id } });
  if (!e) return res.status(404).json({ error: 'Ejercicio no encontrado' });
  if (!(await puedeEditar(req, e))) return res.status(403).json({ error: 'No podés borrar este ejercicio' });
  await prisma.ejercicio.delete({ where: { id: e.id } });
  res.json({ success: true });
});

// ---------- Rutinas modelo ----------
router.get('/plantillas', async (req, res) => {
  const gid = await gimnasioDe(req);
  if (!gid) return res.status(404).json({ error: 'Sin gimnasio asignado' });
  const lista = await prisma.plantillaRutina.findMany({
    where: { gimnasioId: gid },
    orderBy: { creadoEn: 'desc' },
    include: incluirItems,
  });
  res.json(lista);
});

router.post('/plantillas', async (req, res) => {
  const p = plantillaSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos' });
  const gid = await gimnasioDe(req);
  if (!gid) return res.status(404).json({ error: 'Sin gimnasio asignado' });
  const nueva = await prisma.plantillaRutina.create({
    data: { gimnasioId: gid, nombre: p.data.nombre, items: { create: itemsData(p.data.items) } },
    include: incluirItems,
  });
  res.json(nueva);
});

router.put('/plantillas/:id', async (req, res) => {
  const p = plantillaSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos' });
  const gid = await gimnasioDe(req);
  const existe = await prisma.plantillaRutina.findFirst({ where: { id: req.params.id, gimnasioId: gid } });
  if (!existe) return res.status(404).json({ error: 'Rutina no encontrada' });
  await prisma.$transaction([
    prisma.plantillaItem.deleteMany({ where: { plantillaId: existe.id } }),
    prisma.plantillaRutina.update({ where: { id: existe.id }, data: { nombre: p.data.nombre } }),
    prisma.plantillaItem.createMany({
      data: itemsData(p.data.items).map((d) => ({ ...d, plantillaId: existe.id })),
    }),
  ]);
  const act = await prisma.plantillaRutina.findUnique({ where: { id: existe.id }, include: incluirItems });
  res.json(act);
});

router.delete('/plantillas/:id', async (req, res) => {
  const gid = await gimnasioDe(req);
  const existe = await prisma.plantillaRutina.findFirst({ where: { id: req.params.id, gimnasioId: gid } });
  if (!existe) return res.status(404).json({ error: 'Rutina no encontrada' });
  await prisma.plantillaRutina.delete({ where: { id: existe.id } });
  res.json({ success: true });
});

// ---------- Rutina de un socio ----------
async function guardarRutina(usuarioId, nombre, items) {
  const rutina = await prisma.rutina.upsert({
    where: { usuarioId },
    update: nombre ? { nombre } : {},
    create: { usuarioId, nombre: nombre || 'Mi Rutina' },
  });
  await prisma.rutinaEjercicio.deleteMany({ where: { rutinaId: rutina.id } });
  if (items.length > 0) {
    await prisma.rutinaEjercicio.createMany({
      data: itemsData(items).map((d) => ({ ...d, rutinaId: rutina.id })),
    });
  }
}

async function socioDelGimnasio(req) {
  const gid = await gimnasioDe(req);
  if (!gid) return null;
  return prisma.usuario.findFirst({ where: { id: req.params.id, gimnasioId: gid } });
}

router.post('/socios/:id/asignar-rutina', async (req, res) => {
  const p = z.object({ plantillaId: z.string().min(1) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos' });
  const socio = await socioDelGimnasio(req);
  if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
  const plantilla = await prisma.plantillaRutina.findFirst({
    where: { id: p.data.plantillaId, gimnasioId: socio.gimnasioId },
    include: { items: { orderBy: { orden: 'asc' } } },
  });
  if (!plantilla) return res.status(404).json({ error: 'Rutina no encontrada' });
  await guardarRutina(socio.id, plantilla.nombre, plantilla.items);
  res.json({ success: true });
});

router.put('/socios/:id/rutina', async (req, res) => {
  const p = z.object({ nombre: z.string().min(1).max(80).optional(), items: itemsSchema }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos' });
  const socio = await socioDelGimnasio(req);
  if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
  await guardarRutina(socio.id, p.data.nombre, p.data.items);
  res.json({ success: true });
});

// ---------- Planes de cuota ----------
const planSchema = z.object({
  nombre: z.string().min(1).max(60),
  precio: z.number().positive().max(100000000),
  meses: z.number().int().min(1).max(24),
});

router.get('/planes', async (req, res) => {
  const gid = await gimnasioDe(req);
  if (!gid) return res.status(404).json({ error: 'Sin gimnasio asignado' });
  const lista = await prisma.planCuota.findMany({
    where: { gimnasioId: gid },
    orderBy: [{ meses: 'asc' }, { precio: 'asc' }],
    include: { _count: { select: { usuarios: true } } },
  });
  res.json(lista);
});

router.post('/planes', async (req, res) => {
  const p = planSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos' });
  const gid = await gimnasioDe(req);
  if (!gid) return res.status(404).json({ error: 'Sin gimnasio asignado' });
  const nuevo = await prisma.planCuota.create({
    data: { gimnasioId: gid, nombre: p.data.nombre, precio: p.data.precio, meses: p.data.meses },
  });
  res.json(nuevo);
});

router.put('/planes/:id', async (req, res) => {
  const p = planSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos' });
  const gid = await gimnasioDe(req);
  if (!gid) return res.status(404).json({ error: 'Sin gimnasio asignado' });
  const existe = await prisma.planCuota.findFirst({ where: { id: req.params.id, gimnasioId: gid } });
  if (!existe) return res.status(404).json({ error: 'Plan no encontrado' });
  const act = await prisma.planCuota.update({ where: { id: existe.id }, data: p.data });
  res.json(act);
});

router.delete('/planes/:id', async (req, res) => {
  const gid = await gimnasioDe(req);
  if (!gid) return res.status(404).json({ error: 'Sin gimnasio asignado' });
  const existe = await prisma.planCuota.findFirst({ where: { id: req.params.id, gimnasioId: gid } });
  if (!existe) return res.status(404).json({ error: 'Plan no encontrado' });
  await prisma.planCuota.delete({ where: { id: existe.id } });
  res.json({ success: true });
});

router.put('/socios/:id/plan', async (req, res) => {
  const p = z.object({ planId: z.string().min(1).nullable() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Datos inválidos' });
  const socio = await socioDelGimnasio(req);
  if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
  if (p.data.planId) {
    const plan = await prisma.planCuota.findFirst({ where: { id: p.data.planId, gimnasioId: socio.gimnasioId } });
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  }
  await prisma.usuario.update({ where: { id: socio.id }, data: { planId: p.data.planId } });
  res.json({ success: true });
});

export default router;
