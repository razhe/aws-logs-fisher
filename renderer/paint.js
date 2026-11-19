(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LogPaint = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const TOKEN_RE = new RegExp([
    String.raw`(?<time>\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)`,
    String.raw`\b(?<error>ERROR|ERR|FATAL|CRITICAL|SEVERE)\b`,
    String.raw`\b(?<warn>WARN|WARNING)\b`,
    String.raw`\b(?<info>INFO|NOTICE)\b`,
    String.raw`\b(?<debug>DEBUG|TRACE|VERBOSE)\b`,
    String.raw`\b(?<exception>[A-Z]\w*(?:Error|Exception))\b`,
    String.raw`\b(?<id>[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b`,
    String.raw`\b(?<method>GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b`
  ].join('|'), 'g');

  function segments(text) {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(TOKEN_RE)) {
      if (m.index > last) out.push({ type: 'plain', start: last, end: m.index });
      const type = Object.keys(m.groups).find((k) => m.groups[k] !== undefined);
      out.push({ type, start: m.index, end: m.index + m[0].length });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ type: 'plain', start: last, end: text.length });
    return out;
  }

  function findMarks(text, needle, ignoreCase) {
    const hay = ignoreCase ? text.toLowerCase() : text;
    const n = ignoreCase ? needle.toLowerCase() : needle;
    if (!n || hay.length !== text.length) return [];
    const marks = [];
    for (let at = hay.indexOf(n); at !== -1; at = hay.indexOf(n, at + n.length)) marks.push([at, at + n.length]);
    return marks;
  }

  /** Divide la línea en tramos con su tipo (hora, nivel, id, etc.) y si caen dentro de una coincidencia del término buscado. */
  function paint(text, { needle = '', ignoreCase = false } = {}) {
    const marks = findMarks(text, needle, ignoreCase);
    const out = [];
    let m = 0;
    for (const seg of segments(text)) {
      let pos = seg.start;
      while (pos < seg.end) {
        while (m < marks.length && marks[m][1] <= pos) m++;
        const mark = marks[m];
        const inside = Boolean(mark && mark[0] <= pos);
        const end = Math.min(seg.end, inside ? mark[1] : mark ? mark[0] : seg.end);
        out.push({ type: seg.type, text: text.slice(pos, end), mark: inside });
        pos = end;
      }
    }
    return out;
  }

  return { paint };
});
