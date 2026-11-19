(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JsonView = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const MAX_ATTEMPTS = 3;
  const CLOSERS = { '{': '}', '[': ']' };
  const TOKEN_RE = /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

  const isStructured = (value) => Array.isArray(value)
    ? value.some((item) => item !== null && typeof item === 'object')
    : value !== null && typeof value === 'object';

  /** Devuelve el primer objeto JSON embebido en la línea (tras prefijos como hora o nivel), o un arreglo que contenga objetos; si no hay, null. */
  function parse(text) {
    let start = text.search(/[{[]/);
    for (let attempt = 0; start !== -1 && attempt < MAX_ATTEMPTS; attempt++) {
      const end = text.lastIndexOf(CLOSERS[text[start]]);
      if (end > start) {
        try {
          const value = JSON.parse(text.slice(start, end + 1));
          if (isStructured(value)) return value;
        } catch {
          /* no es JSON desde esta posición: se prueba la siguiente llave */
        }
      }
      const next = text.slice(start + 1).search(/[{[]/);
      start = next === -1 ? -1 : start + 1 + next;
    }
    return null;
  }

  function tokens(value) {
    const pretty = JSON.stringify(value, null, 2);
    const out = [];
    let last = 0;
    for (const m of pretty.matchAll(TOKEN_RE)) {
      if (m.index > last) out.push({ type: 'plain', text: pretty.slice(last, m.index) });
      if (m[1]) {
        out.push({ type: m[2] ? 'key' : 'string', text: m[1] });
        if (m[2]) out.push({ type: 'plain', text: m[2] });
      } else {
        out.push({ type: /^[-\d]/.test(m[0]) ? 'number' : 'literal', text: m[0] });
      }
      last = m.index + m[0].length;
    }
    if (last < pretty.length) out.push({ type: 'plain', text: pretty.slice(last) });
    return out;
  }

  return { parse, tokens };
});
