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
  email: z.string().email().optional(),
});

// Dar de alta un socio nuevo (solo admin)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const parsed = altaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos incompletos' });

  const { dni, nombre, password, email } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  const existente = await prisma.usuario.findUnique({ where: { dni } });
  if (existente) return res.status(409).json({ error: 'Ya existe un socio con ese DNI' });

  const socio = await prisma.usuario.create({
    data: { dni, nombre, email, passwordHash, rol: 'SOCIO' },
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
        id: true, dni: true, nombre: true, email: true,
        estadoPago: true, vencimiento: true, creadoEn: true,
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
});

// Editar datos de un socio (solo admin)
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });

  const data = {};
  if (parsed.data.nombre) data.nombre = parsed.data.nombre;
  if (parsed.data.email !== undefined) data.email = parsed.data.email || null;

  try {
    const socio = await prisma.usuario.update({
      where: { id: req.params.id },
      data,
      select: { id: true, dni: true, nombre: true, email: true, estadoPago: true },
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

export default router;
