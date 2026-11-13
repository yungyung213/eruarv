const svgNamespace = 'http://www.w3.org/2000/svg';

for (const field of document.querySelectorAll('input[data-password-toggle]')) {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'password-toggle';
  control.setAttribute('aria-controls', field.id);
  const icon = document.createElementNS(svgNamespace, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.6');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');

  const outline = document.createElementNS(svgNamespace, 'path');
  outline.setAttribute('d', 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z');
  const pupil = document.createElementNS(svgNamespace, 'circle');
  pupil.setAttribute('cx', '12');
  pupil.setAttribute('cy', '12');
  pupil.setAttribute('r', '2.5');
  const slash = document.createElementNS(svgNamespace, 'path');
  slash.setAttribute('d', 'M4 4l16 16');
  icon.append(outline, pupil, slash);

  function update(visible) {
    field.type = visible ? 'text' : 'password';
    control.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    control.title = control.getAttribute('aria-label');
    slash.setAttribute('visibility', visible ? 'visible' : 'hidden');
  }

  control.append(icon);
  field.after(control);
  update(false);
  control.addEventListener('click', () => update(field.type === 'password'));
  field.form.addEventListener('submit', () => update(false));
  field.form.addEventListener('reset', () => update(false));
}
