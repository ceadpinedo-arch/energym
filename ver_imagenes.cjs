const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const ejercicios = await prisma.ejercicio.findMany();
    console.log("=== REVISIÓN DE IMÁGENES EN LA BASE DE DATOS ===");
    ejercicios.forEach(e => {
        console.log(`💪 Ejercicio: ${e.nombre}`);
        // Imprime todas las propiedades del ejercicio para encontrar cómo se llama la columna (imagen, url, gifUrl, etc.)
        console.log(e); 
        console.log("-------------------------------------------------");
    });
}
main().finally(() => prisma.$disconnect());
