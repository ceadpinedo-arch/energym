import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.usuario.id },
    include: { gimnasio: true },
  });
  if (!usuario?.gimnasio) return res.status(404).json({ error: 'Sin gimnasio asignado' });
  res.json(publico(usuario.gimnasio, usuario.rol === 'ADMIN'));
});

const limpiarWhatsapp = (v) => String(v).replace(/\D/g, '');
const limpiarInstagram = (v) => {
  const s = String(v).trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
  return s.split(/[/?#]/)[0].replace(/^@/, '');
};

const limpiarAlias = (v) => String(v).trim().replace(/\s+/g, '');
const limpiarCbu = (v) => String(v).replace(/\D/g, '');
const SECRETOS = ['mpAccessToken', 'mpRefreshToken', 'mpUserId', 'mpExpira'];
const publico = (g, esAdmin) => {
  const o = Object.assign({}, g);
  o.mpConectado = !!g.mpAccessToken;
  SECRETOS.forEach((k) => { delete o[k]; });
  if (!esAdmin) delete o.kioscoToken;
  return o;
};
const limpiarRed = (v, dom) => {
  const s = String(v).trim().replace(new RegExp('^https?://(www\\.)?(' + dom + ')/@?', 'i'), '');
  return s.split(/[/?#]/)[0].replace(/^@/, '');
};
const limpiarHashtag = (v) => String(v).replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 30);

const updateSchema = z.object({
  nombre: z.string().min(1).max(60).optional(),
  logoBase64: z.string().optional(),
  cuota: z.number().positive().max(100000000).optional(),
  whatsapp: z.string().max(200).optional(),
  instagram: z.string().max(200).optional(),
  facebook: z.string().max(200).optional(),
  tiktok: z.string().max(200).optional(),
  redX: z.string().max(200).optional(),
  hashtag: z.string().max(60).optional(),
  alias: z.string().max(80).optional(),
  cbu: z.string().max(60).optional(),
  linkApp: z.string().max(300).optional(),
  mensajeBienvenida: z.string().max(1000).optional(),
  spotifyUrl: z.string().max(300).optional(),
});

router.patch('/me', requireAuth, requireAdmin, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });

  const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
  if (!usuario?.gimnasioId) return res.status(404).json({ error: 'Sin gimnasio asignado' });

  const data = {};
  if (parsed.data.nombre) data.nombre = parsed.data.nombre;
  if (parsed.data.logoBase64) data.logoUrl = parsed.data.logoBase64;
  if (parsed.data.cuota) data.cuota = parsed.data.cuota;
  if (parsed.data.whatsapp !== undefined) data.whatsapp = limpiarWhatsapp(parsed.data.whatsapp) || null;
  if (parsed.data.instagram !== undefined) data.instagram = limpiarInstagram(parsed.data.instagram) || null;
  if (parsed.data.facebook !== undefined) data.facebook = limpiarRed(parsed.data.facebook, 'facebook\\.com|fb\\.com') || null;
  if (parsed.data.tiktok !== undefined) data.tiktok = limpiarRed(parsed.data.tiktok, 'tiktok\\.com') || null;
  if (parsed.data.redX !== undefined) data.redX = limpiarRed(parsed.data.redX, 'x\\.com|twitter\\.com') || null;
  if (parsed.data.hashtag !== undefined) data.hashtag = limpiarHashtag(parsed.data.hashtag) || null;
  if (parsed.data.alias !== undefined) data.alias = limpiarAlias(parsed.data.alias) || null;
  if (parsed.data.linkApp !== undefined) {
    const enlace = String(parsed.data.linkApp).trim();
    if (enlace && !/^https?:\/\//i.test(enlace)) return res.status(400).json({ error: 'El enlace debe empezar con https://' });
    data.linkApp = enlace || null;
  }
  if (parsed.data.mensajeBienvenida !== undefined) data.mensajeBienvenida = parsed.data.mensajeBienvenida.trim() || null;
  if (parsed.data.spotifyUrl !== undefined) {
    const sp = String(parsed.data.spotifyUrl).trim();
    if (sp && !/^https:\/\/(open\.spotify\.com|spotify\.link)\//i.test(sp)) return res.status(400).json({ error: 'El enlace debe ser de Spotify (https://open.spotify.com/...)' });
    data.spotifyUrl = sp || null;
  }
  if (parsed.data.cbu !== undefined) {
    const cbuLimpio = limpiarCbu(parsed.data.cbu);
    if (cbuLimpio && cbuLimpio.length !== 22) return res.status(400).json({ error: 'El CBU debe tener 22 dígitos' });
    data.cbu = cbuLimpio || null;
  }

  const gimnasio = await prisma.gimnasio.update({
    where: { id: usuario.gimnasioId },
    data,
  });
  res.json(publico(gimnasio, true));
});

// Socio: ver y guardar su propio WhatsApp (se refleja en el panel del administrador)
function normalizarTelefonoAR(t) {
  let n = String(t || '').replace(/\D/g, '');
  if (n.indexOf('00') === 0) n = n.slice(2);
  if (n.indexOf('549') === 0) n = n.slice(3);
  else if (n.indexOf('54') === 0) n = n.slice(2);
  while (n.indexOf('0') === 0) n = n.slice(1);
  if (n.length === 11 && n.indexOf('9') === 0) n = n.slice(1);
  if (n.length === 12) {
    const areas = [4, 3, 2];
    for (let i = 0; i < areas.length; i++) {
      if (n.slice(areas[i], areas[i] + 2) === '15') { n = n.slice(0, areas[i]) + n.slice(areas[i] + 2); break; }
    }
  }
  return n.length === 10 ? n : '';
}

router.get('/mi-telefono', requireAuth, async (req, res) => {
  try {
    const u = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { telefono: true, rol: true } });
    res.json({ telefono: u && u.telefono ? u.telefono : '', rol: u ? u.rol : null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo obtener el teléfono' });
  }
});

router.patch('/mi-telefono', requireAuth, async (req, res) => {
  const tel = normalizarTelefonoAR(req.body && req.body.telefono);
  if (!tel) return res.status(400).json({ error: 'Escribí tu número con código de área, sin 0 ni 15. Ejemplo: 3731456789' });
  try {
    await prisma.usuario.update({ where: { id: req.usuario.id }, data: { telefono: tel } });
    res.json({ ok: true, telefono: tel });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo guardar el teléfono' });
  }
});

export default router;
