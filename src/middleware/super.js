import { prisma } from '../prisma.js';

export async function esSuper(req) {
  const lista = String(process.env.SUPERADMIN_DNI || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (lista.length === 0) return false;
  const u = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { dni: true, rol: true } });
  return !!u && u.rol === 'ADMIN' && lista.indexOf(u.dni) >= 0;
}

export async function requireSuper(req, res, next) {
  try {
    if (await esSuper(req)) return next();
    return res.status(403).json({ error: 'Solo el administrador general' });
  } catch (e) {
    return res.status(500).json({ error: 'Error de permisos' });
  }
}
