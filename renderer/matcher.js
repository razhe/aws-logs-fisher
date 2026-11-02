(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Matcher = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const TIME_RE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/;

  function compile(pattern, { regex = false, caseSensitive = false } = {}) {
    if (!pattern) throw new Error('Patrón vacío');
    if (regex) {
      const re = new RegExp(pattern, caseSensitive ? '' : 'i');
      return (line) => re.test(line);
    }
    if (caseSensitive) return (line) => line.includes(pattern);
    const needle = pattern.toLowerCase();
    return (line) => line.toLowerCase().includes(needle);
  }

  function extractTime(line) {
    const m = TIME_RE.exec(line);
    return m ? m[1].replace('T', ' ') : '';
  }

  function stripTime(line) {
    return line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?\s+/, '');
  }

  return { compile, extractTime, stripTime };
});
