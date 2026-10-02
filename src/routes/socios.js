import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Listar socios con su estado de cuota (solo admin)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const socios = await prisma.usuario.findMany({
    where: { rol: 'SOCIO' },
    select: { id: true, dni: true, nombre: true, estadoPago: true, vencimiento: true },
    orderBy: { nombre: 'asc' },
  });
  res.json(socios);
});

const altaSchema = z.object({
  dni: z.string().min(6),
  nombre: z.string().min(2),
  password: z.string().min(4),
  email: z.preprocess(v => (v === '' ? undefined : v), z.string().email().optional()),
  telefono: z.preprocess(v => (v === '' ? undefined : v), z.string().max(25).optional()),
});

// Dar de alta un socio nuevo (solo admin)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const parsed = altaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos incompletos' });

  const { dni, nombre, password, email, telefono } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  const existente = await prisma.usuario.findUnique({ where: { dni } });
  if (existente) return res.status(409).json({ error: 'Ya existe un socio con ese DNI' });

  const adminAlta = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { gimnasioId: true } });
  const socio = await prisma.usuario.create({
    data: { dni, nombre, email, telefono, passwordHash, rol: 'SOCIO', gimnasioId: adminAlta?.gimnasioId || null },
  });

  res.status(201).json({ id: socio.id, dni: socio.dni, nombre: socio.nombre });
});

// Estado de cuota propio (socio)
router.get('/me', requireAuth, async (req, res) => {
  const socio = await prisma.usuario.findUnique({
    where: { id: req.usuario.id },
    select: { id: true, dni: true, nombre: true, estadoPago: true, vencimiento: true },
  });
  res.json(socio);
});


// Detalle de un socio para el admin: pagos, rutina y asistencia
router.get('/:id/detalle', requireAuth, requireAdmin, async (req, res) => {
  try {
    const socio = await prisma.usuario.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, dni: true, nombre: true, email: true, telefono: true,
        estadoPago: true, vencimiento: true, creadoEn: true,
        planId: true, plan: { select: { id: true, nombre: true, precio: true, meses: true } },
        pagos: {
          orderBy: { pagadoEn: 'desc' },
          take: 12,
          select: { id: true, monto: true, periodo: true, metodo: true, pagadoEn: true },
        },
        rutina: {
          include: {
            ejercicios: {
              orderBy: { orden: 'asc' },
              include: { ejercicio: { select: { id: true, nombre: true, grupoMuscular: true, imagenUrl: true } } },
            },
          },
        },
      },
    });

    if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });

    const totalAsistencias = await prisma.asistencia.count({ where: { usuarioId: req.params.id } });

    res.json({ ...socio, totalAsistencias });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el detalle del socio' });
  }
});

const editarSchema = z.object({
  nombre: z.string().min(2).optional(),
  email: z.string().email().optional().or(z.literal('')),
  telefono: z.string().max(25).optional(),
});

// Editar datos de un socio (solo admin)
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });

  const data = {};
  if (parsed.data.nombre) data.nombre = parsed.data.nombre;
  if (parsed.data.email !== undefined) data.email = parsed.data.email || null;
  if (parsed.data.telefono !== undefined) data.telefono = parsed.data.telefono.trim() || null;

  try {
    const socio = await prisma.usuario.update({
      where: { id: req.params.id },
      data,
      select: { id: true, dni: true, nombre: true, email: true, telefono: true, estadoPago: true },
    });
    res.json(socio);
  } catch (error) {
    res.status(404).json({ error: 'Socio no encontrado' });
  }
});

// Dar de baja (eliminar) un socio (solo admin)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.usuario.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    res.status(404).json({ error: 'Socio no encontrado' });
  }
});

// Importar socios en lote desde CSV (solo admin)
const textoOpc = (v) => (v === '' || v === null || v === undefined ? undefined : v);
const filaImportSchema = z.object({
  dni: z.string().refine((v) => !/\D/.test(v) && v.length >= 6 && v.length <= 9, 'dni'),
  nombre: z.string().trim().min(2).max(80),
  email: z.preprocess(textoOpc, z.string().email().optional()),
  telefono: z.preprocess(textoOpc, z.string().refine((v) => !/\D/.test(v) && v.length >= 6 && v.length <= 15, 'telefono').optional()),
  password: z.preprocess(textoOpc, z.string().min(4).max(72).optional()),
});
const importarSchema = z.object({
  socios: z.array(z.any()).min(1).max(300),
  passwordInicial: z.string().max(72).optional(),
});

router.post('/importar', requireAuth, requireAdmin, async (req, res) => {
  const parsed = importarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Archivo inválido (máximo 300 filas por envío)' });
  const base = (parsed.data.passwordInicial || '').trim();
  if (base && base.length < 4) return res.status(400).json({ error: 'La contraseña inicial necesita al menos 4 caracteres' });

  try {
    const admin = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { gimnasioId: true } });
    const gimnasioId = admin?.gimnasioId || null;

    const errores = [];
    const validas = [];
    const vistos = new Set();
    parsed.data.socios.forEach((fila, i) => {
      const r = filaImportSchema.safeParse(fila);
      if (!r.success) {
        errores.push({ fila: i + 1, motivo: 'campo inválido: ' + (r.error.issues[0]?.path?.[0] || 'fila') });
        return;
      }
      if (vistos.has(r.data.dni)) {
        errores.push({ fila: i + 1, motivo: 'DNI repetido' });
        return;
      }
      vistos.add(r.data.dni);
      validas.push(r.data);
    });

    const existentes = await prisma.usuario.findMany({
      where: { dni: { in: validas.map((v) => v.dni) } },
      select: { dni: true },
    });
    const yaExisten = new Set(existentes.map((e) => e.dni));
    const nuevas = validas.filter((v) => !yaExisten.has(v.dni));

    const filas = [];
    for (let i = 0; i < nuevas.length; i += 10) {
      const tanda = nuevas.slice(i, i + 10);
      const hashes = await Promise.all(tanda.map((f) => bcrypt.hash(f.password || base || f.dni, 10)));
      tanda.forEach((f, j) => filas.push({
        dni: f.dni, nombre: f.nombre, email: f.email, telefono: f.telefono,
        passwordHash: hashes[j], rol: 'SOCIO', gimnasioId,
      }));
    }
    const resultado = filas.length
      ? await prisma.usuario.createMany({ data: filas, skipDuplicates: true })
      : { count: 0 };
    res.status(201).json({ creados: resultado.count, yaExistian: yaExisten.size, errores });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo importar el archivo' });
  }
});

export default router;
