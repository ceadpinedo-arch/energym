import { prisma } from './prisma.js';
let ultimo = 0;
export async function marcarVencidos() {
  try {
    const ahora = Date.now();
    if (ahora - ultimo < 60000) return;
    ultimo = ahora;
    await prisma.usuario.updateMany({ where: { rol: 'SOCIO', estadoPago: 'AL_DIA', vencimiento: { lt: new Date(ahora) } }, data: { estadoPago: 'VENCIDO' } });
  } catch (e) { console.error('marcarVencidos', e); }
}
marcarVencidos();
setInterval(marcarVencidos, 10 * 60 * 1000);
