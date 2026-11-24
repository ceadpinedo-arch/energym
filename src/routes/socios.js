import { marcarVencidos } from '../vencidos.js';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

async function gimnasioDelAdmin(req) {
  const a = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { gimnasioId: true } });
  return a ? a.gimnasioId : null;
}

async function socioEsDelGimnasio(req, id) {
  const gid = await gimnasioDelAdmin(req);
  const x = await prisma.usuario.findUnique({ where: { id: id }, select: { gimnasioId: true } });
  return !!x && x.gimnasioId === gid;
}

// Listar socios con su estado de cuota (solo admin)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  await marcarVencidos();
  const socios = await prisma.usuario.findMany({
    where: { rol: 'SOCIO', gimnasioId: await gimnasioDelAdmin(req) },
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
  if (!adminAlta || !adminAlta.gimnasioId) return res.status(403).json({ error: 'Tu cuenta no tiene gimnasio asignado' });
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
  if (!(await socioEsDelGimnasio(req, req.params.id))) return res.status(404).json({ error: 'Socio no encontrado' });
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
  if (!(await socioEsDelGimnasio(req, req.params.id))) return res.status(404).json({ error: 'Socio no encontrado' });
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
  if (!(await socioEsDelGimnasio(req, req.params.id))) return res.status(404).json({ error: 'Socio no encontrado' });
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
  vencimiento: z.preprocess(textoOpc, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  ingreso: z.preprocess(textoOpc, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  plan: z.preprocess(textoOpc, z.string().max(80).optional()),
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
	if (!gimnasioId) return res.status(403).json({ error: 'Tu cuenta no tiene gimnasio asignado' });

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
      select: { id: true, dni: true, gimnasioId: true, rol: true, vencimiento: true, creadoEn: true, planId: true },
    });
    const yaExisten = new Set(existentes.map((e) => e.dni));
const nrm = (t) => String(t || '').normalize('NFD').split('').filter((c) => c < '\u0300' || c > '\u036f').join('').toLowerCase().trim();
const fechaDe = (s) => (s ? new Date(s + 'T12:00:00-03:00') : undefined);
const vencDe = (s) => (s ? new Date(s + 'T23:59:59-03:00') : undefined);
const estadoDe = (s) => (s && vencDe(s).getTime() < Date.now() ? 'VENCIDO' : 'AL_DIA');
const mapaPlan = {};
if (gimnasioId) {
  const planesDb = await prisma.planCuota.findMany({ where: { gimnasioId }, select: { id: true, nombre: true } });
  planesDb.forEach((p) => { mapaPlan[nrm(p.nombre)] = p.id; });
  const faltan = {};
  validas.forEach((v) => { const k = nrm(v.plan); if (k && !mapaPlan[k]) faltan[k] = v.plan; });
  for (const k of Object.keys(faltan)) {
    const np = await prisma.planCuota.create({ data: { gimnasioId, nombre: faltan[k], precio: 0 } });
    mapaPlan[k] = np.id;
  }
}
const planIdDe = (n) => mapaPlan[nrm(n)];
const porDni = {};
validas.forEach((v) => { porDni[v.dni] = v; });
const propios = existentes.filter((e) => e.rol === 'SOCIO' && e.gimnasioId === gimnasioId);
let actualizados = 0;
for (let i = 0; i < propios.length; i += 10) {
  await Promise.all(propios.slice(i, i + 10).map(async (e) => {
    const f = porDni[e.dni];
    const data = {};
    if (f.vencimiento && !e.vencimiento) { data.vencimiento = vencDe(f.vencimiento); data.estadoPago = estadoDe(f.vencimiento); }
    if (f.ingreso && fechaDe(f.ingreso) < e.creadoEn) data.creadoEn = fechaDe(f.ingreso);
    if (f.plan && !e.planId && planIdDe(f.plan)) data.planId = planIdDe(f.plan);
    if (Object.keys(data).length) { await prisma.usuario.update({ where: { id: e.id }, data }); actualizados++; }
  }));
}

    const nuevas = validas.filter((v) => !yaExisten.has(v.dni));

    const filas = [];
    for (let i = 0; i < nuevas.length; i += 10) {
      const tanda = nuevas.slice(i, i + 10);
      const hashes = await Promise.all(tanda.map((f) => bcrypt.hash(f.password || base || f.dni, 10)));
      tanda.forEach((f, j) => filas.push({
        dni: f.dni, nombre: f.nombre, email: f.email, telefono: f.telefono, vencimiento: vencDe(f.vencimiento), creadoEn: fechaDe(f.ingreso), estadoPago: estadoDe(f.vencimiento), planId: planIdDe(f.plan),
        passwordHash: hashes[j], rol: 'SOCIO', gimnasioId,
      }));
    }
    const resultado = filas.length
      ? await prisma.usuario.createMany({ data: filas, skipDuplicates: true })
      : { count: 0 };
    res.status(201).json({ creados: resultado.count, yaExistian: yaExisten.size, actualizados, errores });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo importar el archivo' });
  }
});

export default router;
