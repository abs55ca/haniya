'use strict';

// Replace [PLAYLIST_URL] with her Spotify, YouTube, or other playlist link.
// Until then, the cassette opens an 80s playlist search on YouTube.
const PLAYLIST_URL = '[PLAYLIST_URL]';
const DEFAULT_PLAYLIST_URL = 'https://www.youtube.com/results?search_query=80s+hits+playlist';

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const themeButtons = document.querySelectorAll('[data-theme]');
const themeNames = { calm: 'Calm', sunny: 'Sunny', soft: 'Soft', wild: 'Wild' };

function applyMood(mood) {
  if (!Object.hasOwn(themeNames, mood)) return;
  root.dataset.mood = mood;
  themeButtons.forEach((button) => {
    const active = button.dataset.theme === mood;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.getElementById('current-mood').textContent = themeNames[mood];
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue('--wash').trim();
  try { localStorage.setItem('haniya-mood', mood); } catch { /* Themes still work when storage is unavailable. */ }
}

themeButtons.forEach((button) => button.addEventListener('click', () => applyMood(button.dataset.theme)));
try {
  const savedMood = localStorage.getItem('haniya-mood');
  if (savedMood && Object.hasOwn(themeNames, savedMood)) applyMood(savedMood);
} catch { /* The default mood is calm. */ }

// Fallback illustrations are present before JS runs, so failed photos never flash.
document.querySelectorAll('.photo-slot img').forEach((image) => {
  const showPhoto = () => {
    if (!image.naturalWidth) return;
    image.classList.remove('is-missing');
    image.closest('.photo-slot').classList.add('is-loaded');
  };
  const showPlaceholder = () => {
    image.classList.add('is-missing');
    image.closest('.photo-slot').classList.remove('is-loaded');
  };
  image.addEventListener('load', showPhoto);
  image.addEventListener('error', showPlaceholder);
  if (image.complete) image.naturalWidth ? showPhoto() : showPlaceholder();
});

const bloomTimers = new WeakMap();
function bloomFlower(card) {
  clearTimeout(bloomTimers.get(card));
  card.classList.remove('is-blooming');
  if (reducedMotion.matches) return;
  // Restart the animation for repeated taps, including while a bloom is in progress.
  void card.offsetWidth;
  card.classList.add('is-blooming');
  bloomTimers.set(card, setTimeout(() => card.classList.remove('is-blooming'), 1000));
}
const flowerCards = document.querySelectorAll('.flower-card');
flowerCards.forEach((card) => card.addEventListener('click', () => bloomFlower(card)));
if ('IntersectionObserver' in window) {
  const flowersObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        bloomFlower(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  flowerCards.forEach((card) => flowersObserver.observe(card));
}

const flowerSection = document.getElementById('flowers');
flowerSection.addEventListener('click', (event) => {
  if (event.target.closest('button, a')) return;
  const sectionBox = flowerSection.getBoundingClientRect();
  const svgNS = 'http://www.w3.org/2000/svg';
  const flower = document.createElementNS(svgNS, 'svg');
  const use = document.createElementNS(svgNS, 'use');
  const flowerKinds = ['daisy', 'tulip', 'sunflower', 'wildflowers'];
  use.setAttribute('href', `#${flowerKinds[Math.floor(Math.random() * flowerKinds.length)]}`);
  flower.append(use);
  flower.classList.add('planted-flower');
  flower.setAttribute('aria-hidden', 'true');
  flower.style.left = `${event.clientX - sectionBox.left}px`;
  flower.style.top = `${event.clientY - sectionBox.top}px`;
  flowerSection.append(flower);
  // A brief lifetime and a cap keep enthusiastic tapping lightweight.
  const planted = flowerSection.querySelectorAll('.planted-flower');
  if (planted.length > 20) planted[0].remove();
  setTimeout(() => flower.remove(), 3200);
});

const spiceRange = document.getElementById('spice-range');
const spiceMeter = document.querySelector('.spice-meter');
const spiceLabels = ['Mild (disappointing)', 'Getting there', 'Spicy', 'She’s not even sweating', 'Call the fire department'];
const spiceNotes = [
  'Mild. Haniya has questions.',
  'Getting there. Keep going.',
  'Spicy. Now we’re talking.',
  'She’s not even sweating. Of course.',
  'Call the fire department. She’ll have seconds.'
];
function updateSpice() {
  const value = Math.max(0, Math.min(4, Number(spiceRange.value)));
  spiceMeter.style.setProperty('--spice-color', `var(--spice-${value})`);
  spiceMeter.style.setProperty('--spice-progress', `${value * 25}%`);
  document.getElementById('spice-flames').textContent = '🔥'.repeat(value + 1);
  document.getElementById('spice-output').textContent = spiceNotes[value];
  spiceRange.setAttribute('aria-valuetext', spiceLabels[value]);
}
spiceRange.addEventListener('input', updateSpice);
updateSpice();

const cakeButton = document.getElementById('cake-button');
const cakeZone = document.querySelector('.cake-zone');
const cakeStatus = document.getElementById('cake-status');
const mousePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
let cakeOnRight = false;
let cakeAttempts = 0;
cakeButton.addEventListener('pointerenter', (event) => {
  if (!mousePointer.matches || event.pointerType !== 'mouse' || reducedMotion.matches) return;
  // Do not dodge a keyboard-focused button. It remains operable by keyboard.
  if (document.activeElement === cakeButton) return;
  const available = Math.max(0, cakeZone.clientWidth - cakeButton.offsetWidth);
  cakeOnRight = !cakeOnRight;
  cakeButton.style.transform = `translate(${cakeOnRight ? available : 0}px, ${cakeOnRight ? 17 : 0}px)`;
  cakeAttempts += 1;
  if (cakeAttempts >= 3) cakeStatus.textContent = 'It’s a no from management.';
});
cakeButton.addEventListener('focus', () => { cakeButton.style.transform = 'none'; cakeOnRight = false; });
cakeButton.addEventListener('click', () => { cakeStatus.textContent = 'Request denied 🙅‍♀️'; });
window.addEventListener('resize', () => { cakeButton.style.transform = 'none'; cakeOnRight = false; });

const playlistButton = document.getElementById('playlist-button');
const cassetteScene = document.querySelector('.cassette-scene');
let reelTimer;
try {
  const playlist = new URL(PLAYLIST_URL);
  if (playlist.protocol === 'https:' || playlist.protocol === 'http:') playlistButton.href = playlist.href;
} catch { playlistButton.href = DEFAULT_PLAYLIST_URL; }
playlistButton.addEventListener('click', () => {
  cassetteScene.classList.add('is-playing');
  document.getElementById('music-status').textContent = 'The 80s called. Haniya picked up.';
  clearTimeout(reelTimer);
  reelTimer = setTimeout(() => cassetteScene.classList.remove('is-playing'), 30000);
});

// A quiet, user-controlled carousel: native touch scrolling, with no autoplay.
const placesCarousel = document.querySelector('.places-carousel');
if (placesCarousel) {
  const track = placesCarousel.querySelector('.places-track');
  const slides = [...track.querySelectorAll('.place-slide')];
  const dots = [...placesCarousel.querySelectorAll('.place-dot')];
  const counter = document.getElementById('place-current');
  const status = document.getElementById('place-status');
  let currentPlace = 0;
  let requestedPlace = null;
  let scrollFrame = 0;
  let scrollSettledTimer;
  let trackWidth = track.clientWidth;

  function updatePlace(index, announce = true) {
    currentPlace = index;
    counter.textContent = String(index + 1).padStart(2, '0');
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle('is-active', dotIndex === index);
      dot.setAttribute('aria-pressed', String(dotIndex === index));
    });
    slides.forEach((slide, slideIndex) => slide.setAttribute('aria-hidden', String(slideIndex !== index)));
    if (announce) status.textContent = `${slides[index].dataset.title}. Photo ${index + 1} of ${slides.length}.`;
  }

  function goToPlace(index) {
    requestedPlace = (index + slides.length) % slides.length;
    track.scrollTo({ left: requestedPlace * track.clientWidth, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }

  document.getElementById('place-previous').addEventListener('click', () => goToPlace((requestedPlace ?? currentPlace) - 1));
  document.getElementById('place-next').addEventListener('click', () => goToPlace((requestedPlace ?? currentPlace) + 1));
  dots.forEach((dot, index) => dot.addEventListener('click', () => goToPlace(index)));
  track.addEventListener('keydown', (event) => {
    if (event.target !== track) return;
    const position = requestedPlace ?? currentPlace;
    const destinations = { ArrowLeft: position - 1, ArrowRight: position + 1, Home: 0, End: slides.length - 1 };
    if (!Object.hasOwn(destinations, event.key)) return;
    event.preventDefault();
    goToPlace(destinations[event.key]);
  });
  const finishNavigation = () => {
    // An interrupted smooth scroll can emit a late scrollend event. Only clear
    // the requested destination once that particular photo is fully aligned.
    if (requestedPlace !== null && Math.abs(track.scrollLeft - requestedPlace * track.clientWidth) < 2) requestedPlace = null;
  };
  // Native swiping and trackpad scrolling share the same selection state.
  track.addEventListener('scroll', () => {
    clearTimeout(scrollSettledTimer);
    scrollSettledTimer = setTimeout(finishNavigation, 180);
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (!track.clientWidth) return;
      if (track.clientWidth !== trackWidth) { alignPlace(); return; }
      const index = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
      if (index !== currentPlace) updatePlace(index);
    });
  }, { passive: true });
  track.addEventListener('scrollend', finishNavigation);
  const beginManualScroll = () => { requestedPlace = null; };
  track.addEventListener('pointerdown', beginManualScroll, { passive: true });
  track.addEventListener('wheel', beginManualScroll, { passive: true });

  // Keep the selected photo aligned when rotating a phone or resizing the page.
  function alignPlace() {
    if (track.clientWidth === trackWidth) return;
    const index = requestedPlace ?? currentPlace;
    trackWidth = track.clientWidth;
    requestedPlace = null;
    track.scrollTo({ left: index * trackWidth, behavior: 'instant' });
    updatePlace(index, false);
  }
  if ('ResizeObserver' in window) new ResizeObserver(alignPlace).observe(track);
  else window.addEventListener('resize', alignPlace);

  slides.forEach((slide) => {
    const image = slide.querySelector('img');
    const showImage = () => {
      if (!image.naturalWidth) return;
      slide.classList.remove('is-missing');
      slide.classList.add('is-loaded');
    };
    const showIllustration = () => {
      slide.classList.remove('is-loaded');
      slide.classList.add('is-missing');
      slide.querySelector('.place-location').textContent = 'A LITTLE ROOM TO DREAM';
      slide.querySelector('.place-name').textContent = 'Somewhere peaceful.';
      slide.dataset.title = 'Somewhere peaceful';
      slide.setAttribute('aria-label', `${slides.indexOf(slide) + 1} of ${slides.length}: Somewhere peaceful`);
      image.alt = '';
    };
    image.addEventListener('load', showImage);
    image.addEventListener('error', showIllustration);
    if (image.complete) image.naturalWidth ? showImage() : showIllustration();
  });
  updatePlace(0, false);
  placesCarousel.querySelector('.place-controls').hidden = false;
}

// Stop decorative motion when this page is in the background.
document.addEventListener('visibilitychange', () => {
  document.getAnimations().forEach((animation) => {
    if (document.hidden) animation.pause();
    else if (!reducedMotion.matches && animation.playState === 'paused') animation.play();
  });
});
