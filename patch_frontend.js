import fs from 'fs';

const filePath = '/home/kiyan/Desktop/energym/app/src/screens/BibliotecaScreen.js';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Asegurar importaciones requeridas
if (!code.includes('Image') || !code.includes('Alert')) {
  code = code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]react-native['"]/, (match, imports) => {
    const list = imports.split(',').map(s => s.trim());
    if (!list.includes('Image')) list.push('Image');
    if (!list.includes('Alert')) list.push('Alert');
    return `import { ${list.join(', ')} } from 'react-native'`;
  });
}

// 2. Reemplazar la función guardarRutina por sintaxis JS limpia
const guardarRutinaLimpia = `async function guardarRutina() {
    try {
      const items = Array.from(seleccionados).map((ejercicioId) => ({ ejercicioId }));
      const res = await fetch(\`\${API_URL}/api/rutinas/me\`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: \`Bearer \${token}\` 
        },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        Alert.alert('¡Rutina Guardada!', \`Se guardaron \${items.length} ejercicios en tu rutina.\`);
      } else {
        Alert.alert('Atención', 'No se pudo registrar la rutina en el servidor.');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }`;

code = code.replace(/async\s+function\s+guardarRutina[\s\S]*?\}\n\s*\}/g, guardarRutinaLimpia);
code = code.replace(/async\s+function\s+guardarRutina[\s\S]*?\}\s*;/g, guardarRutinaLimpia);

// 3. Reemplazar el contenedor de miniatura por el componente <Image />
const renderImageCode = `<View style={[styles.thumb, { backgroundColor: t.primaryBg, overflow: 'hidden' }]}>
            {(item.imagenUrl || item.imagen || item.uri || item.url) ? (
              <Image source={{ uri: item.imagenUrl || item.imagen || item.uri || item.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Text style={{ color: t.primary }}>></Text>
            )}
          </View>`;

code = code.replace(/<View\s+style=\{\[styles\.thumb[\s\S]*?<\/View>/g, renderImageCode);

fs.writeFileSync(filePath, code);
console.log('--- REPARACIÓN DE SINTAXIS COMPLETADA ---');
