(function () {
  const root = document.documentElement;

  function stored() {
    try {
      const t = localStorage.getItem('theme');
      return t === 'light' || t === 'dark' ? t : '';
    } catch {
      return '';
    }
  }

  function effective() {
    return root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function label() {
    const btn = document.getElementById('btn-theme');
    if (btn) btn.textContent = effective() === 'dark' ? 'Tema claro' : 'Tema oscuro';
  }

  const saved = stored();
  if (saved) root.dataset.theme = saved;

  window.toggleTheme = function () {
    const next = effective() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* sin almacenamiento: el cambio vale solo para esta sesión */
    }
    label();
  };

  window.addEventListener('DOMContentLoaded', () => {
    label();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', label);
  });
})();
