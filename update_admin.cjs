const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.usuario.findUnique({ where: { dni: 'admin' } });
  console.log('Usuario:', user);

  const match = await bcrypt.compare('admin1234', user.passwordHash);
  console.log('Coincide con admin1234:', match);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

