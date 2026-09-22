// ---------------------------------------------------------------------------
// thoughtButton.js — the small "Thought" control on the left edge.
//
// For user testing, pressing it represents a new physical thought entering the
// collective. It is a real <button> (keyboard + screen-reader friendly) styled in
// index.html as a quiet half-ripple rising from the edge of the water, so it reads
// as part of the installation rather than a website control.
// Being a separate DOM element, presses never count as touches on the water.
// ---------------------------------------------------------------------------
import * as C from '../config/constants.js';

export function createThoughtButton({ onPress, label = C.THOUGHT_BUTTON_LABEL }) {
  const btn = document.createElement('button');
  btn.id = 'thought-button';
  btn.type = 'button';
  btn.setAttribute('aria-label', `${label}: add a new thought to the water`);
  btn.innerHTML = `<span class="tb-label">${label}</span><i class="tb-stream" aria-hidden="true"></i>`;
  document.body.appendChild(btn);

  btn.addEventListener('pointerdown', (e) => e.stopPropagation());   // never reaches the water
  btn.addEventListener('click', () => {
    const accepted = onPress();
    if (!accepted) return;
    btn.classList.remove('pressed');
    void btn.offsetWidth;                                             // restart the ring animation
    btn.classList.add('pressed');
  });
  btn.addEventListener('animationend', (e) => { if (e.animationName === 'tb-stream') btn.classList.remove('pressed'); });

  return { element: btn, press: () => btn.click() };
}
