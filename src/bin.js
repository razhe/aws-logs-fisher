const fs = require('node:fs');
const path = require('node:path');

const WINDOWS_EXTENSIONS = ['.exe', '.com'];
const resolved = new Map();

/**
 * Ruta absoluta del ejecutable buscando solo en los directorios absolutos del PATH.
 * En Windows, lanzar un programa por nombre lo busca primero en la carpeta actual, lo que permitiría
 * ejecutar un aws.exe plantado junto a la app (por ejemplo en Descargas).
 */
function resolveBin(name, { env = process.env, platform = process.platform } = {}) {
  if (platform !== 'win32') return name;
  if (resolved.has(name)) return resolved.get(name);
  const dirs = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter((dir) => path.win32.isAbsolute(dir));
  for (const dir of dirs) {
    for (const ext of WINDOWS_EXTENSIONS) {
      const candidate = path.win32.join(dir, name + ext);
      if (fs.existsSync(candidate)) {
        resolved.set(name, candidate);
        return candidate;
      }
    }
  }
  const e = new Error(`${name} no está instalado o no está en el PATH`);
  e.code = 'NOT_INSTALLED';
  throw e;
}

function systemBin(name) {
  return path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', `${name}.exe`);
}

module.exports = { resolveBin, systemBin };
