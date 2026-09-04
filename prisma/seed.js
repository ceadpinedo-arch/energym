import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma.js';

async function main() {
  // Admin de prueba
  const adminPassword = await bcrypt.hash('admin1234', 10);
  const admin = await prisma.usuario.upsert({
    where: { dni: 'admin' },
    update: {},
    create: {
      dni: 'admin',
      nombre: 'Admin Energym',
      email: 'admin@energym.com',
      passwordHash: adminPassword,
      rol: 'ADMIN',
      estadoPago: 'AL_DIA',
    },
  });

  // Socio de prueba
  const socioPassword = await bcrypt.hash('socio1234', 10);
  const socio = await prisma.usuario.upsert({
    where: { dni: '30123456' },
    update: {},
    create: {
      dni: '30123456',
      nombre: 'Marcos Gómez',
      email: 'marcos@example.com',
      passwordHash: socioPassword,
      rol: 'SOCIO',
      estadoPago: 'AL_DIA',
      vencimiento: new Date(new Date().setMonth(new Date().getMonth() + 1)),
    },
  });

  // Ejercicios de ejemplo
  const ejercicios = [
    { nombre: 'Press de banca', grupo: 'PECHO', descripcion: 'Empuje horizontal con barra, activa pecho y tríceps.' },
    { nombre: 'Sentadilla', grupo: 'PIERNAS', descripcion: 'Flexión de rodillas con barra en espalda alta.' },
    { nombre: 'Remo con barra', grupo: 'ESPALDA', descripcion: 'Tracción horizontal, torso inclinado hacia adelante.' },
    { nombre: 'Press militar', grupo: 'HOMBRO', descripcion: 'Empuje vertical de barra desde los hombros.' },
    { nombre: 'Curl de bíceps', grupo: 'BRAZO', descripcion: 'Flexión de codo con mancuernas, control en la bajada.' },
    { nombre: 'Peso muerto', grupo: 'ESPALDA', descripcion: 'Bisagra de cadera levantando barra desde el piso.' },
    { nombre: 'Fondos en paralelas', grupo: 'PECHO', descripcion: 'Empuje vertical hacia abajo, tronco inclinado.' },
    { nombre: 'Extensión de tríceps', grupo: 'BRAZO', descripcion: 'Extensión de codo con polea o mancuerna.' },
    { nombre: 'Plancha abdominal', grupo: 'CORE', descripcion: 'Sostén isométrico en posición de plancha.' },
    { nombre: 'Zancadas', grupo: 'PIERNAS', descripcion: 'Paso al frente flexionando ambas rodillas, alterna piernas.' },
  ];

  for (const ej of ejercicios) {
    const existente = await prisma.ejercicio.findFirst({ where: { nombre: ej.nombre } });
    if (!existente) {
      await prisma.ejercicio.create({ data: ej });
    }
  }

  console.log('Seed completo:');
  console.log(`  Admin -> DNI: ${admin.dni} / contraseña: admin1234`);
  console.log(`  Socio -> DNI: ${socio.dni} / contraseña: socio1234`);
  console.log(`  ${ejercicios.length} ejercicios cargados (si no existían)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
