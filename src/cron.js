import cron from 'node-cron';
import { prisma } from './prisma.js';

const ZONA = 'America/Argentina/Buenos_Aires';
const LINK_PAGO = 'https://link.mercadopago.com.ar/muro.acanto.nave.mp';

function diaEnNDias(n) {
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: ZONA });
  const base = new Date(hoy + 'T00:00:00Z');
  base.setUTCDate(base.getUTCDate() + n);
  return base.toISOString().slice(0, 10);
}

export async function enviarRecordatoriosCuota() {
  const objetivo = diaEnNDias(3);
  const inicio = new Date(objetivo + 'T00:00:00Z');
  const fin = new Date(objetivo + 'T23:59:59Z');

  const socios = await prisma.usuario.findMany({
    where: {
      rol: 'SOCIO',
      vencimiento: { gte: inicio, lte: fin },
    },
    include: { pushTokens: true },
  });

  const mensajes = [];
  for (const socio of socios) {
    for (const pt of socio.pushTokens) {
      mensajes.push({
        to: pt.token,
        sound: 'default',
        title: 'Tu cuota vence pronto',
        body: `Hola ${socio.nombre.split(' ')[0]}, tu cuota vence el ${objetivo}. Pagá acá: ${LINK_PAGO}`,
        data: { tipo: 'recordatorio_cuota', link: LINK_PAGO },
      });
    }
  }

  if (mensajes.length === 0) {
    console.log(`[cron] Sin recordatorios para enviar (${objetivo})`);
    return { enviados: 0 };
  }

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mensajes),
  });
  const data = await res.json();
  console.log(`[cron] Recordatorios enviados: ${mensajes.length}`, JSON.stringify(data).slice(0, 300));
  return { enviados: mensajes.length };
}

export function iniciarCron() {
  cron.schedule('0 10 * * *', () => {
    enviarRecordatoriosCuota().catch((e) => console.error('[cron] error', e));
  }, { timezone: ZONA });
  console.log('[cron] Recordatorios de cuota programados: todos los días 10:00 (AR)');
}
