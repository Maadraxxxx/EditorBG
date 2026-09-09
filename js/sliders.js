/**
 * Sliders com preenchimento em degradê.
 *
 * O CSS sozinho não sabe até onde pintar o trilho, então guardamos a posição
 * atual (0..1) na variável --fill de cada input e o CSS desenha a partir dela.
 */

export function paintSlider(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max === '' ? 100 : input.max);
  const span = max - min;
  const p = span === 0 ? 0 : (Number(input.value) - min) / span;
  input.style.setProperty('--fill', String(Math.min(1, Math.max(0, p))));
}

/** Repinta todos os sliders — use depois de mudar `value` por código. */
export function refreshSliders(root = document) {
  root.querySelectorAll('input[type="range"]').forEach(paintSlider);
}

// Arrastar dispara `input`, que borbulha: um único ouvinte cobre a página toda.
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t instanceof HTMLInputElement && t.type === 'range') paintSlider(t);
});
