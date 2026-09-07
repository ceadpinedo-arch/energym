require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.ejercicio.findMany().then(e => {
  console.log(e.map(x => ({ id: x.id, nombre: x.nombre })));
  process.exit(0);
});
