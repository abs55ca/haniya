'use strict';

// “You’ve got mail”: a pigeon flies in, drops an envelope, and the letter opens.
// The Lottie player is only downloaded when the notification is clicked.
(() => {
  const mail = document.querySelector('[data-pigeon-mail]');
  const overlay = document.querySelector('[data-mail-overlay]');
  if (!mail || !overlay) return;

  // All durations are in milliseconds.
  const TIMING = {
    tooltipDelay: 1500, // “You’ve got mail!” appears after page load
    backdropIn: 350,
    flyIn: 2000,        // off-screen left to the centre
    hover: 550,         // pause at the centre before letting go
    drop: 950,          // envelope fall, including the bounce
    flyOut: 1500,       // centre to off-screen top right
    envelopeGrow: 380,
    envelopeWiggle: 520,
    sealPop: 260,
    flapOpen: 640,
    paperSlide: 650,
    letterGrow: 560,
    letterFold: 650,
    backdropOut: 420
  };
  const PIGEON = {
    src: 'animations/pigeon.lottie',
    flapSpeed: 0.8,     // 1 = the original speed, one wing beat every 0.45s
    hoverFlapSpeed: 1.15,
    exitFlapSpeed: 1.3,
    carryWidth: 0.3,    // carried envelope width, as a fraction of the pigeon’s width
    bob: 9              // px of up-and-down bob while flying in
  };
  const PLAYER_URL = 'vendor/dotlottie-web/dotlottie-web.js';
  const WASM_URL = 'vendor/dotlottie-web/dotlottie-player.wasm';

  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const button = mail.querySelector('.mail-button');
  const badge = mail.querySelector('.mail-badge');
  const tooltip = mail.querySelector('.mail-tooltip');
  const backdrop = overlay.querySelector('.mail-backdrop');
  const carrier = overlay.querySelector('.mail-carrier');
  const spot = overlay.querySelector('.mail-envelope-spot');
  const envelope = overlay.querySelector('.mail-envelope');
  const paper = envelope.querySelector('.env-paper');
  const flap = envelope.querySelector('.env-flap');
  const seal = envelope.querySelector('.env-seal');
  const letterWrap = overlay.querySelector('.mail-letter-wrap');
  const letter = overlay.querySelector('.mail-letter');
  const letterParts = letter.querySelectorAll(':scope > *');

  const heading = letter.querySelector('.mail-letter-body :is(h1, h2, h3)');
  if (heading) {
    heading.id ||= 'mail-letter-title';
    letter.removeAttribute('aria-label');
    letter.setAttribute('aria-labelledby', heading.id);
  }

  let state = 'idle'; // idle → opening → letter → closing → idle
  let run = 0;        // bumped whenever a sequence is abandoned
  let sceneAnimations = [];
  let player = null;
  let playerModule = null;
  let inertElements = [];

  const tooltipTimer = setTimeout(() => tooltip.classList.add('is-visible'), TIMING.tooltipDelay);

  function animate(element, keyframes, options) {
    const animation = element.animate(keyframes, { fill: 'forwards', ...options });
    sceneAnimations.push(animation);
    return animation;
  }
  // A cancellable pause that also stops while the tab is hidden.
  const wait = (duration) => animate(overlay, null, { duration }).finished;

  function loadPlayer() {
    playerModule ??= import(new URL(PLAYER_URL, document.baseURI).href).then((module) => {
      module.DotLottie.setWasmUrl(new URL(WASM_URL, document.baseURI).href);
      return module;
    }).catch((error) => { playerModule = null; throw error; });
    return playerModule;
  }

  async function createPigeon() {
    const { DotLottie } = await loadPlayer();
    const canvas = document.createElement('canvas');
    canvas.className = 'mail-pigeon';
    carrier.prepend(canvas);
    const pigeon = new DotLottie({
      canvas,
      src: new URL(PIGEON.src, document.baseURI).href,
      autoplay: true,
      loop: true,
      speed: PIGEON.flapSpeed,
      renderConfig: { autoResize: true, freezeOnOffscreen: false, devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2) }
    });
    pigeon.mailCanvas = canvas;
    return new Promise((resolve, reject) => {
      const fail = (error) => { clearTimeout(timer); destroyPigeon(pigeon); reject(error); };
      const timer = setTimeout(() => fail(new Error('The pigeon took too long to load.')), 8000);
      pigeon.addEventListener('load', () => { clearTimeout(timer); resolve(pigeon); });
      pigeon.addEventListener('loadError', (event) => fail(event.error || new Error('The pigeon could not be loaded.')));
    });
  }

  function destroyPigeon(pigeon = player) {
    if (!pigeon) return;
    pigeon.destroy();
    pigeon.mailCanvas.remove();
    if (pigeon === player) player = null;
  }

  function resetScene() {
    sceneAnimations.forEach((animation) => animation.cancel());
    sceneAnimations = [];
    destroyPigeon();
    carrier.append(envelope);
    flap.classList.remove('is-behind');
    letter.hidden = true;
  }

  function lockPage() {
    const scrollbar = window.innerWidth - root.clientWidth;
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;
    root.classList.add('mail-is-open');
    inertElements = [...document.body.children].filter((element) => element !== overlay && !element.inert && element.tagName !== 'SCRIPT');
    inertElements.forEach((element) => { element.inert = true; });
  }

  function unlockPage() {
    root.classList.remove('mail-is-open');
    root.style.paddingRight = '';
    inertElements.forEach((element) => { element.inert = false; });
    inertElements = [];
  }

  // The flight path is sampled into keyframes so the curve, bob and tilt stay in sync.
  function flightKeyframes(steps, point) {
    const frames = [];
    let previous = point(0);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const current = point(t);
      const next = point(Math.min(1, t + 1 / steps));
      const tilt = Math.max(-14, Math.min(14, Math.atan2(next.y - previous.y, Math.max(next.x - previous.x, 2)) * 180 / Math.PI * 0.55)) * (current.tiltScale ?? 1);
      frames.push({ ...current, tilt });
      previous = current;
    }
    return frames;
  }

  async function flyIn(id) {
    const pigeon = await createPigeon();
    if (id !== run) { destroyPigeon(pigeon); return false; }
    player = pigeon;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const pigeonWidth = carrier.offsetWidth;
    const carryScale = (pigeonWidth * PIGEON.carryWidth) / envelope.offsetWidth;
    const hoverY = -Math.min(230, Math.max(110, viewportHeight * 0.26));
    const startX = -(viewportWidth / 2 + pigeonWidth);
    const startY = hoverY - viewportHeight * 0.14;
    const easeOut = (t) => 1 - (1 - t) ** 1.6;
    const smooth = (t) => t * t * (3 - 2 * t);

    const path = flightKeyframes(36, (t) => {
      const p = easeOut(t);
      return {
        x: startX * (1 - p),
        // Swoop down from the upper left in a gentle curve, then level out.
        y: startY + (hoverY - startY) * smooth(p) + Math.sin(p * Math.PI) * viewportHeight * 0.07 + Math.sin(t * Math.PI * 2 * 2.4) * PIGEON.bob * (1 - p),
        tiltScale: 1 - t ** 3
      };
    });
    animate(carrier, path.map(({ x, y, tilt }) => ({ transform: `translate(${x}px, ${y}px) rotate(${tilt}deg)` })), { duration: TIMING.flyIn });
    // The envelope hangs under gravity: it counter-rotates the pigeon’s tilt and swings a little.
    const flight = animate(envelope, path.map(({ tilt }, i) => {
      const t = i / (path.length - 1);
      return { transform: `scale(${carryScale}) rotate(${-tilt * 0.8 + Math.sin(t * Math.PI * 2 * 1.6) * 6 * (1 - t)}deg)` };
    }), { duration: TIMING.flyIn });
    await flight.finished;

    player.setSpeed(PIGEON.hoverFlapSpeed);
    await animate(carrier, [
      { transform: `translate(0px, ${hoverY}px)` },
      { transform: `translate(0px, ${hoverY - 7}px)`, offset: 0.45 },
      { transform: `translate(0px, ${hoverY + 2}px)`, offset: 0.8 },
      { transform: `translate(0px, ${hoverY}px)` }
    ], { duration: TIMING.hover, easing: 'ease-in-out' }).finished;

    dropEnvelope();
    flyOut(hoverY, viewportWidth, viewportHeight, pigeonWidth);
    await wait(TIMING.drop);
    return true;
  }

  function dropEnvelope() {
    // FLIP: measure the carried envelope, move it to the centre spot, then animate the difference.
    const from = envelope.getBoundingClientRect();
    envelope.getAnimations().forEach((animation) => animation.cancel());
    spot.append(envelope);
    const to = envelope.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scale = from.width / to.width;
    animate(envelope, [
      { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(0deg)`, easing: 'cubic-bezier(.5, 0, .9, .45)' },
      { transform: 'translate(0px, 0px) scale(.8) rotate(-7deg)', offset: 0.6, easing: 'cubic-bezier(.2, .7, .4, 1)' },
      { transform: 'translate(0px, -18px) scale(.8) rotate(-2deg)', offset: 0.78, easing: 'cubic-bezier(.6, 0, .9, .5)' },
      { transform: 'translate(0px, 0px) scale(.8) rotate(1.5deg)', offset: 0.9, easing: 'ease-out' },
      { transform: 'translate(0px, -4px) scale(.8) rotate(0deg)', offset: 0.95, easing: 'ease-in' },
      { transform: 'translate(0px, 0px) scale(.8) rotate(0deg)' }
    ], { duration: TIMING.drop });
  }

  function flyOut(hoverY, viewportWidth, viewportHeight, pigeonWidth) {
    player.setSpeed(PIGEON.exitFlapSpeed);
    const endX = viewportWidth / 2 + pigeonWidth;
    const endY = hoverY - viewportHeight * 0.42 - pigeonWidth;
    const path = flightKeyframes(24, (t) => {
      const p = t ** 1.7;
      return { x: endX * p, y: hoverY + (endY - hoverY) * p ** 1.3 };
    });
    const exit = animate(carrier, path.map(({ x, y, tilt }, i) => ({ transform: `translate(${x}px, ${y}px) rotate(${Math.min(0, tilt) * Math.min(1, i / 6)}deg)` })), { duration: TIMING.flyOut });
    const pigeon = player;
    exit.finished.then(() => destroyPigeon(pigeon), () => {});
  }

  async function openEnvelope() {
    await animate(envelope, [
      { transform: 'scale(.8)' },
      { transform: 'scale(1.03)', offset: 0.7 },
      { transform: 'scale(1)' }
    ], { duration: TIMING.envelopeGrow, easing: 'ease-out' }).finished;
    animate(envelope, [
      { transform: 'scale(1) rotate(0deg)' },
      { transform: 'scale(1) rotate(-4deg)', offset: 0.25 },
      { transform: 'scale(1) rotate(3.5deg)', offset: 0.55 },
      { transform: 'scale(1) rotate(-1.5deg)', offset: 0.8 },
      { transform: 'scale(1) rotate(0deg)' }
    ], { duration: TIMING.envelopeWiggle, easing: 'ease-in-out' });
    await wait(TIMING.envelopeWiggle * 0.75);

    await animate(seal, [
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(1.25)', opacity: 1, offset: 0.35 },
      { transform: 'scale(.2)', opacity: 0 }
    ], { duration: TIMING.sealPop, easing: 'ease-in' }).finished;

    // The flap swings past 90°, then tucks behind the letter paper.
    await animate(flap, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(90deg)' }], { duration: TIMING.flapOpen / 2, easing: 'ease-in' }).finished;
    flap.classList.add('is-behind');
    animate(flap, [{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(180deg)' }], { duration: TIMING.flapOpen / 2, easing: 'ease-out' });
    await wait(TIMING.flapOpen / 4);

    await animate(paper, [{ transform: 'translateY(0)' }, { transform: 'translateY(-62%)' }], { duration: TIMING.paperSlide, easing: 'cubic-bezier(.3, .7, .3, 1)' }).finished;
    await growLetter();
  }

  async function growLetter() {
    const from = paper.getBoundingClientRect();
    letter.hidden = false;
    const to = letter.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    animate(paper, [{ opacity: 0 }], { duration: 0 });
    animate(envelope, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'translateY(36px) scale(.92)', opacity: 0 }], { duration: TIMING.letterGrow * 0.6, easing: 'ease-in' });
    letterParts.forEach((part) => animate(part, [{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { duration: TIMING.letterGrow }));
    await animate(letter, [
      { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})` },
      { transform: 'none' }
    ], { duration: TIMING.letterGrow, easing: 'cubic-bezier(.22, 1, .36, 1)' }).finished;
  }

  async function simpleArrival() {
    spot.append(envelope);
    await animate(envelope, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' }).finished;
    await wait(450);
    letter.hidden = false;
    animate(envelope, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease' });
    await animate(letter, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' }).finished;
  }

  function showLetter() {
    state = 'letter';
    badge?.remove();
    mail.classList.add('is-read');
    letter.focus({ preventScroll: true });
  }

  async function open() {
    if (state !== 'idle') return;
    state = 'opening';
    const id = ++run;
    clearTimeout(tooltipTimer);
    tooltip.classList.remove('is-visible');
    mail.classList.add('is-away');
    overlay.hidden = false;
    resetScene();
    lockPage();
    document.addEventListener('keydown', onKeydown);
    const simple = reducedMotion.matches;
    animate(backdrop, [{ opacity: 0 }, { opacity: 1 }], { duration: simple ? 200 : TIMING.backdropIn, easing: 'ease' });

    try {
      let flew = false;
      if (!simple) {
        try { flew = await flyIn(id); } catch (error) {
          if (error.name === 'AbortError') throw error;
          console.warn('Pigeon mail: showing the letter without the pigeon.', error);
        }
        if (id !== run) return;
      }
      if (flew) await openEnvelope();
      else await simpleArrival();
      if (id === run) showLetter();
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
    }
  }

  async function close() {
    if (state === 'idle' || state === 'closing') return;
    const interrupted = state === 'opening';
    state = 'closing';
    const id = ++run;
    const simple = reducedMotion.matches;

    if (interrupted) {
      sceneAnimations.forEach((animation) => animation.pause());
      await overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: 'ease', fill: 'forwards' }).finished;
    } else if (simple) {
      animate(letter, [{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: 'ease' });
      await animate(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease' }).finished;
    } else {
      // Fold the letter into a strip, then tuck it back toward the mail button.
      const target = button.getBoundingClientRect();
      const card = letter.getBoundingClientRect();
      const tx = target.left + target.width / 2 - (card.left + card.width / 2);
      const ty = target.top + target.height / 2 - (card.top + card.height / 2);
      letterParts.forEach((part) => animate(part, [{ opacity: 1 }, { opacity: 0 }], { duration: TIMING.letterFold * 0.3 }));
      animate(letter, [
        { transform: 'none', opacity: 1 },
        { transform: 'perspective(1000px) rotateX(-18deg) scale(.86, .3)', opacity: 1, offset: 0.4, easing: 'cubic-bezier(.5, 0, .75, 0)' },
        { transform: `translate(${tx}px, ${ty}px) scale(.08, .04)`, opacity: 0 }
      ], { duration: TIMING.letterFold, easing: 'ease-in-out' });
      await wait(TIMING.letterFold * 0.35);
      await animate(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: TIMING.backdropOut, easing: 'ease' }).finished;
    }
    if (id === run) finish();
  }

  function finish() {
    document.removeEventListener('keydown', onKeydown);
    resetScene();
    overlay.getAnimations().forEach((animation) => animation.cancel());
    overlay.hidden = true;
    unlockPage();
    mail.classList.remove('is-away');
    state = 'idle';
    button.focus({ preventScroll: true });
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    if (state !== 'letter') { event.preventDefault(); return; }
    const focusable = [...letter.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (!letter.contains(active)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && (active === first || active === letter)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }

  button.addEventListener('click', open);
  tooltip.addEventListener('click', open);
  letter.querySelectorAll('[data-mail-close]').forEach((closeButton) => closeButton.addEventListener('click', close));
  letterWrap.addEventListener('click', (event) => { if (event.target === letterWrap && state === 'letter') close(); });

  // script.js pauses page animations in background tabs; make sure the mail scene always resumes.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    sceneAnimations.forEach((animation) => { if (animation.playState === 'paused' && state !== 'closing') animation.play(); });
  });
})();
