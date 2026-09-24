import fs from 'fs';

const filePath = '/home/kiyan/Desktop/energym/app/src/screens/BibliotecaScreen.js';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Asegurar importación de Image y Alert
if (!code.includes('Image') || !code.includes('Alert')) {
  code = code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]react-native['"]/, (match, imports) => {
    const list = imports.split(',').map(s => s.trim());
    if (!list.includes('Image')) list.push('Image');
    if (!list.includes('Alert')) list.push('Alert');
    return `import { ${list.join(', ')} } from 'react-native'`;
  });
}

// 2. Reemplazar la renderización estática por el componente Image
code = code.replace(
  /<View\s+style=\{\[styles\.thumb[\s\S]*?<\/View>/g,
  `<View style={[styles.thumb, { backgroundColor: t.primaryBg, overflow: 'hidden' }]}>
            {(item.imagenUrl || item.imagen || item.uri || item.url) ? (
              <Image 
                source={{ uri: item.imagenUrl || item.imagen || item.uri || item.url }} 
                style={{ width: '100%', height: '100%' }} 
                resizeMode="cover" 
              />
            ) : (
              <Text style={{ color: t.primary }}>></Text>
            )}
          </View>`
);

// 3. Modificar guardarRutina para que muestre el desglose al hacer clic
const nuevaFuncionGuardar = `async function guardarRutina() {
    try {
      const items = Array.from(seleccionados).map((ejercicioId) => ({ ejercicioId }));
      const nombresSeleccionados = ejercicios
        .filter(e => seleccionados.has(String(e.id)))
        .map(e => e.nombre)
        .join('\\n• ');

      const res = await fetch(\`\${API_URL}/api/rutinas/me\`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${token}\` },
        body: JSON.stringify({ items }),
      });

      if (res.ok) {
        Alert.alert(
          'Rutina Seleccionada',
          \`Ejercicios guardados (\${items.length}):\\n\\n• \${nombresSeleccionados || 'Ninguno'}\`
        );
      } else {
        Alert.alert('Error', 'No se pudo guardar la selección.');
      }
    } catch (e) {
      Alert.alert('Error de conexión', e.message);
    }
  }`;

code = code.replace(/async\s+function\s+guardarRutina[\s\S]*?\n\s*\}/g, nuevaFuncionGuardar);

fs.writeFileSync(filePath, code);
console.log('--- BibliotecaScreen.js actualizado con éxito ---');
