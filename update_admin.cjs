const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admin1234', 10);
  const admin = await prisma.usuario.upsert({
    where: { dni: '99999999' },
    update: { passwordHash: hash, rol: 'ADMIN' },
    create: {
      dni: '99999999',
      nombre: 'Admin Energym',
      email: 'admin@energym.com',
      passwordHash: hash,
      rol: 'ADMIN',
      estadoPago: 'AL_DIA'
    }
  });
  console.log('✅ Admin creado/actualizado correctamente con DNI:', admin.dni);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
