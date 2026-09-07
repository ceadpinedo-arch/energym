const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const passAdmin = await bcrypt.hash('admin1234', 10);
  const passSocio = await bcrypt.hash('socio1234', 10);

  // 1. Admin
  const admin = await prisma.usuario.upsert({
    where: { dni: '99999999' },
    update: { passwordHash: passAdmin, rol: 'ADMIN' },
    create: {
      dni: '99999999',
      nombre: 'Admin Energym',
      email: 'admin@energym.com',
      passwordHash: passAdmin,
      rol: 'ADMIN',
      estadoPago: 'AL_DIA'
    }
  });

  // 2. Socio / Cliente
  const socio = await prisma.usuario.upsert({
    where: { dni: '12345678' },
    update: { passwordHash: passSocio, rol: 'SOCIO' },
    create: {
      dni: '12345678',
      nombre: 'Socio Ejercicio',
      email: 'socio@energym.com',
      passwordHash: passSocio,
      rol: 'SOCIO',
      estadoPago: 'AL_DIA'
    }
  });

  console.log('✅ Usuarios creados correctamente:');
  console.log(' - ADMIN: DNI 99999999 / Clave: admin1234');
  console.log(' - SOCIO: DNI 12345678 / Clave: socio1234');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
