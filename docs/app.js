// app.js — game loop for "Did Mom Say This?"
// Loaded as a non-module script so it works over file:// without a server.
// Depends on `TEXTS` declared in texts.js (loaded before this file in index.html)
// and `tsParticles` (window global from the tsparticles@3 bundle).

// ---------- config ----------
const ROUNDS_PER_GAME = 8;

// Score tiers — cutoffs are inclusive lower bounds expressed as a fraction.
// Order matters: highest tier first, fall through.
// `effect` keys into PARTICLE_CONFIGS; `heroSvg` is the centered illustration.
// `variants` is an array of {headline, message}; one is chosen at random on
// each end-screen reveal so replays don't always read the same.
const TIERS = [
  {
    min: 0.86,
    heroSvg: 'assets/bouquet.svg',
    effect: 'top',
    variants: [
      {
        headline: "Huh — you might actually BE 羅家家.",
        message: "Either you've been paying attention your whole life, or you're hiding something.",
      },
      {
        headline: "Suspicious. Did you study?",
        message: "You either grew up there or you've been paying very close attention.",
      },
    ],
  },
  {
    min: 0.61,
    heroSvg: 'assets/potted_plant.svg',
    effect: 'mid',
    variants: [
      {
        headline: "Pretty solid.",
        message: "You've been listening. Mom would be proud.",
      },
      {
        headline: "You know the version of Mom who texts.",
        message: "You've been listening. Mom would be proud.",
      },
    ],
  },
  {
    min: 0.21,
    heroSvg: 'assets/seedling.svg',
    effect: 'low-mid',
    variants: [
      {
        headline: "Nice try.",
        message: "You got a few — call her this week, you'll do better next year.",
      },
      {
        headline: "Half there.",
        message: "You know the highlights, not the deep cuts. Call her — she'll fill you in.",
      },
    ],
  },
  {
    min: 0,
    heroSvg: 'assets/wilted.svg',
    effect: 'bottom',
    variants: [
      {
        headline: "You really don't know Mom at all.",
        message: "Have you... met her? She's right there. Go say hi.",
      },
      {
        headline: "Mom: 1. You: 0.",
        message: "She would've told you. Did you... ask?",
      },
    ],
  },
];

function pickVariant(tier) {
  const v = tier.variants;
  return v[Math.floor(Math.random() * v.length)];
}

// ---------- state ----------
const state = {
  questions: [],
  roundIndex: 0,
  score: 0,
  guessedThisRound: false,
  streak: 0,
  bestStreak: 0,
  playerName: '',
};

// localStorage — just the last-selected player chip. No score persistence.
const LS_PLAYER = 'mday:player';
function loadPlayer() { return localStorage.getItem(LS_PLAYER) ?? ''; }
function savePlayer(name) { localStorage.setItem(LS_PLAYER, name); }

// ---------- helpers ----------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick ROUNDS_PER_GAME texts for a session.
//   - Aim for a 50/50 mix of Mom and not-Mom so guessing one side blind doesn't
//     reliably win.
//   - If a bucket is short, top up from the other bucket so the game still
//     fills to ROUNDS_PER_GAME (or runs as long as data allows).
//   - Final order is shuffled so Mom and not-Mom items interleave randomly —
//     no "all Moms first" patterns.
function pickQuestions() {
  const target = ROUNDS_PER_GAME;
  const mom = shuffle(TEXTS.filter(t => t.isMom));
  const not = shuffle(TEXTS.filter(t => !t.isMom));

  const half = Math.floor(target / 2);
  const momTake = Math.min(half, mom.length);
  const notTake = Math.min(target - momTake, not.length);

  let picks = [...mom.slice(0, momTake), ...not.slice(0, notTake)];

  // Bucket fell short — top up from leftover items in either bucket.
  if (picks.length < target) {
    const leftover = [...mom.slice(momTake), ...not.slice(notTake)];
    picks = picks.concat(shuffle(leftover).slice(0, target - picks.length));
  }
  return shuffle(picks);
}

function tierFor(scoreFraction) {
  return TIERS.find(t => scoreFraction >= t.min) ?? TIERS[TIERS.length - 1];
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);

const screens = {
  start: $('screen-start'),
  round: $('screen-round'),
  end:   $('screen-end'),
};

function showScreen(name) {
  for (const [k, el] of Object.entries(screens)) {
    if (k === name) {
      el.classList.remove('hidden');
      el.classList.add('flex', 'fade-in');
      // re-trigger fade-in
      // eslint-disable-next-line no-unused-expressions
      el.offsetHeight;
    } else {
      el.classList.add('hidden');
      el.classList.remove('flex', 'fade-in');
    }
  }
  // Surface current screen on <body> so CSS can react (watermark hides on round)
  document.body.dataset.screen = name;
  // Maracas-meter only visible during play
  const meter = $('maracas-meter');
  if (name === 'round') {
    meter.classList.remove('hidden');
  } else {
    meter.classList.add('hidden');
  }
  // Clear any active particles when leaving end screen
  if (name !== 'end') clearParticles();
}

// ---------- streak / maracas-meter ----------
// 3 tiers, escalating with the user's streak. Blue lands at streak 5.
function streakTier(n) {
  if (n >= 5) return 'blue';
  if (n >= 3) return 'red';
  if (n >= 1) return 'orange';
  return null;
}

function renderMaracasMeter() {
  const meter = $('maracas-meter');
  const tier = streakTier(state.streak);
  if (tier) {
    meter.dataset.tier = tier;
  } else {
    delete meter.dataset.tier;
  }
}

// ---------- round rendering ----------
function renderRound() {
  const q = state.questions[state.roundIndex];

  // Reset the iMessage card to its mystery state, then load the text.
  const avatar = $('msg-avatar');
  avatar.innerHTML = '?';
  avatar.classList.remove('avatar-mom', 'avatar-other');
  $('msg-sender').textContent = 'unknown';

  const bubble = $('msg-bubble');
  bubble.textContent = q.text;
  bubble.setAttribute('lang', q.lang === 'zh' ? 'zh-Hant' : 'en');

  $('round-progress').textContent = `${state.roundIndex + 1} / ${state.questions.length}`;

  // Reset guess button state from the previous round
  for (const btn of document.querySelectorAll('.guess-btn')) {
    btn.disabled = false;
    btn.classList.remove('indicator-correct', 'indicator-wrong', 'btn-shake-only');
  }
  // Next is visible but unclickable until a guess is locked in
  $('btn-next').disabled = true;
  state.guessedThisRound = false;
}

// Reveal the actual sender in the iMessage bubble after a guess locks in.
// For Mom: always shows the bouquet + "Mom · 家家".
// For decoys: reads optional `q.sender` + `q.icon` from the data so each
// non-Mom text can have its own identity (e.g. "Ajito" + 🍜, "boba" + 🧋).
// `q.icon` can be an emoji string or an "assets/..." path to an SVG/PNG.
function revealSender(q) {
  const avatar = $('msg-avatar');
  const sender = $('msg-sender');
  if (q.isMom) {
    avatar.innerHTML = '<img src="assets/mom.jpg" alt="Mom">';
    avatar.classList.remove('avatar-other');
    avatar.classList.add('avatar-mom');
    sender.textContent = 'Mom · 家家';
    return;
  }
  // Decoy reveal: per-text sender + icon, with sensible fallbacks.
  const icon = q.icon ?? '';
  if (icon.startsWith('assets/') || icon.startsWith('/') || icon.startsWith('http')) {
    avatar.innerHTML = `<img src="${icon}" alt="">`;
  } else {
    avatar.innerHTML = icon; // emoji or empty
  }
  avatar.classList.remove('avatar-mom');
  avatar.classList.add('avatar-other');
  sender.textContent = q.sender || 'not Mom';
}

function handleGuess(guess) {
  if (state.guessedThisRound) return;
  state.guessedThisRound = true;

  const q = state.questions[state.roundIndex];
  const correct = (guess === 'mom') === q.isMom;
  if (correct) state.score += 1;

  // Streak update. The maracas-meter celebrates on right (shake + flame stays
  // lit + count increments) and goes dark on wrong (streak resets, flame fades).
  if (correct) {
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
  } else {
    state.streak = 0;
  }
  renderMaracasMeter();

  // The button with the correct answer always gets the green check.
  const correctGuess = q.isMom ? 'mom' : 'not';
  const correctBtn = document.querySelector(`.guess-btn[data-guess="${correctGuess}"]`);
  const tappedBtn  = document.querySelector(`.guess-btn[data-guess="${guess}"]`);

  for (const btn of document.querySelectorAll('.guess-btn')) {
    btn.disabled = true;
  }

  correctBtn.classList.remove('indicator-correct', 'indicator-wrong', 'btn-shake-only');
  // eslint-disable-next-line no-unused-expressions
  correctBtn.offsetHeight;
  correctBtn.classList.add('indicator-correct');

  if (correct) {
    fireMiniBurst(tappedBtn);
    // Maracas celebrates on right answers — shake + (if streak hot enough) embers
    const m = $('maracas-img');
    m.classList.remove('celebrate');
    // eslint-disable-next-line no-unused-expressions
    m.offsetHeight;
    m.classList.add('celebrate');
    fireMaracasFlame();
  } else {
    // User's wrong tap also gets a red ✕ + shake.
    tappedBtn.classList.add('indicator-wrong', 'btn-shake-only');
  }

  // Reveal the sender in the iMessage card (mystery → Mom · 家家 or per-decoy)
  revealSender(q);

  // Next is now clickable
  $('btn-next').disabled = false;
}

// Flame spill from the maracas on a hot streak. Each particle is a flame-shaped
// SVG (assets/flame.svg) with the outer fill tinted by tier; inner highlight is
// always white. Bursts outward, gravity pulls them down, opacity fades. Self-cleans.
const FLAME_TIERS = {
  orange: { count: 12, colors: ['#ff8a3d', '#ffb347', '#ff5520'] },
  red:    { count: 18, colors: ['#ff3a1a', '#ff5520', '#d62020'] },
  blue:   { count: 24, colors: ['#3a7bff', '#7e3df0', '#9b6dff'] },
};

async function fireMaracasFlame() {
  if (typeof tsParticles === 'undefined' || reducedMotion()) return;
  const tier = streakTier(state.streak);
  if (!tier) return;
  const config = FLAME_TIERS[tier];

  const m = $('maracas-img');
  const rect = m.getBoundingClientRect();
  const xPct = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
  const yPct = ((rect.top + rect.height / 2) / window.innerHeight) * 100;

  const layerId = 'flame-' + Math.random().toString(36).slice(2, 9);
  const layer = document.createElement('div');
  layer.id = layerId;
  layer.className = 'flame-layer';
  Object.assign(layer.style, {
    position: 'fixed', inset: '0', zIndex: '21', pointerEvents: 'none',
  });
  document.body.appendChild(layer);

  await tsParticles.load({
    id: layerId,
    options: {
      fullScreen: { enable: false },
      detectRetina: true,
      fpsLimit: 60,
      particles: {
        number: { value: 0 },
        color: { value: config.colors },
        shape: {
          type: 'image',
          options: {
            image: [{ src: 'assets/flame.svg', width: 32, height: 40, replaceColor: true }],
          },
        },
        size: { value: { min: 10, max: 22 } },
        opacity: {
          value: { min: 0.85, max: 1 },
          animation: { enable: true, speed: 0.7, startValue: 'max', destroy: 'min' },
        },
        rotate: {
          value: { min: -25, max: 25 },
          animation: { enable: true, speed: 8 },
        },
        move: {
          enable: true,
          direction: 'top',
          speed: { min: 4, max: 12 },
          gravity: { enable: true, acceleration: 5 },
          straight: false,
          outModes: { default: 'destroy' },
        },
      },
      emitters: [{
        direction: 'top',
        rate: { delay: 0, quantity: config.count },
        position: { x: xPct, y: yPct },
        size: { width: 30, height: 0, mode: 'percent' },
        life: { duration: 0.05, count: 1 },
      }],
    },
  });

  setTimeout(() => {
    const c = tsParticles.dom().find(c => c.id === layerId);
    if (c) c.destroy();
    layer.remove();
  }, 3500);
}

// Mini celebration burst on right answer — petals + sparkles fountain from the
// tapped button's center, gravity brings them back down. Self-cleans after 3.5s.
async function fireMiniBurst(button) {
  if (typeof tsParticles === 'undefined' || reducedMotion()) return;

  const rect = button.getBoundingClientRect();
  const xPct = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
  const yPct = ((rect.top + rect.height / 2) / window.innerHeight) * 100;

  const layerId = 'mini-' + Math.random().toString(36).slice(2, 9);
  const layer = document.createElement('div');
  layer.id = layerId;
  Object.assign(layer.style, {
    position: 'fixed', inset: '0', zIndex: '60', pointerEvents: 'none',
  });
  document.body.appendChild(layer);

  await tsParticles.load({
    id: layerId,
    options: {
      fullScreen: { enable: false },
      detectRetina: true,
      fpsLimit: 60,
      particles: {
        number: { value: 0 },
        shape: {
          type: 'image',
          options: {
            image: [
              { src: 'assets/cherry_blossom.svg', width: 24, height: 24 },
              { src: 'assets/rose.svg',           width: 24, height: 24 },
              { src: 'assets/tulip.svg',          width: 24, height: 24 },
              { src: 'assets/sparkles.svg',       width: 24, height: 24 },
            ],
          },
        },
        size:    { value: { min: 10, max: 20 } },
        opacity: { value: { min: 0.85, max: 1 } },
        rotate:  { value: { min: 0, max: 360 }, animation: { enable: true, speed: 30 } },
        move: {
          enable: true,
          direction: 'top',
          speed: { min: 4, max: 9 },
          gravity: { enable: true, acceleration: 7 },
          straight: false,
          outModes: { default: 'destroy' },
        },
      },
      emitters: [{
        direction: 'top',
        rate: { delay: 0.02, quantity: 5 },
        position: { x: xPct, y: yPct },
        size: { width: 0, height: 0, mode: 'percent' },
        life: { duration: 0.5, count: 1 },
      }],
    },
  });

  setTimeout(() => {
    const c = tsParticles.dom().find(c => c.id === layerId);
    if (c) c.destroy();
    layer.remove();
  }, 3500);
}

function nextRound() {
  state.roundIndex += 1;
  if (state.roundIndex >= state.questions.length) {
    showEnd();
  } else {
    renderRound();
  }
}

// ---------- end screen ----------
function showEnd() {
  const total = state.questions.length;
  const fraction = total === 0 ? 0 : state.score / total;
  const tier = tierFor(fraction);

  // Hero SVG with bloom animation re-trigger
  const hero = $('end-hero');
  hero.src = tier.heroSvg;
  hero.classList.remove('hero-bloom');
  // eslint-disable-next-line no-unused-expressions
  hero.offsetHeight;
  hero.classList.add('hero-bloom');

  const variant = pickVariant(tier);
  $('end-headline').textContent = variant.headline;
  $('end-score').textContent = `${state.score} / ${total}`;
  $('end-message').textContent = variant.message;

  // Player greeting (3A) — italic line above the headline if a name is set
  const greeting = $('player-greeting');
  if (state.playerName) {
    greeting.textContent = `${state.playerName},`;
    greeting.classList.remove('hidden');
  } else {
    greeting.textContent = '';
    greeting.classList.add('hidden');
  }

  showScreen('end');
  fireParticles(tier.effect);
}

// ---------- particles (tsParticles) ----------
async function clearParticles() {
  if (typeof tsParticles === 'undefined') return;
  tsParticles.dom().forEach(c => c.destroy());
}

async function fireParticles(kind) {
  if (typeof tsParticles === 'undefined') return;
  if (reducedMotion()) return;

  await clearParticles();

  const config = PARTICLE_CONFIGS[kind];
  if (!config) return;

  // Big multi-shape confetti pop from center, on top of the sustained tier rain.
  setTimeout(() => fireConfettiBurst(kind), 280);

  await tsParticles.load({ id: 'celebration', options: config.primary });

  if (config.secondary) {
    setTimeout(async () => {
      // create a sibling layer for the heart wave so we don't kill the petals
      let layer = document.getElementById('celebration-2');
      if (!layer) {
        layer = document.createElement('div');
        layer.id = 'celebration-2';
        Object.assign(layer.style, {
          position: 'fixed', inset: '0', zIndex: '51', pointerEvents: 'none',
        });
        document.body.appendChild(layer);
      }
      await tsParticles.load({ id: 'celebration-2', options: config.secondary });
    }, config.secondaryDelay ?? 450);
  }
}

// Final-screen confetti pop. Implemented with canvas-confetti (window.confetti)
// because tsParticles emitters were not firing reliably with compound directions.
// Two bursts from center-bottom angled up-left and up-right → popper effect.
const CONFETTI_TIERS = {
  top: {
    count: 90,
    shapes: ['🌸', '🌹', '🌷', '🌺', '✨', '💖'],
    colors: ['#fda4af', '#f9a8d4', '#fbcfe8', '#fde047', '#b73e2e'],
  },
  mid: {
    count: 60,
    shapes: ['🌸', '🌹', '🌷', '✨'],
    colors: ['#fda4af', '#f9a8d4', '#fbcfe8'],
  },
  'low-mid': {
    count: 30,
    shapes: ['✨', '🌸'],
    colors: ['#fde047', '#ffffff', '#fda4af'],
  },
  bottom: null, // no pop for the bottom tier — keep it deadpan
};

function fireConfettiBurst(tier) {
  if (typeof confetti !== 'function' || reducedMotion()) return;
  const c = CONFETTI_TIERS[tier];
  if (!c) return;

  // Build emoji shapes (canvas-confetti's shapeFromText renders any emoji)
  const shapes = c.shapes.map(text => confetti.shapeFromText({ text, scalar: 2 }));

  const common = {
    particleCount: Math.ceil(c.count / 2),
    spread: 80,
    startVelocity: 50,
    scalar: 2,
    ticks: 220,
    gravity: 1.2,
    shapes,
    colors: c.colors,
  };

  // Two bursts from center-bottom — angled outward for the popper-V effect
  confetti({ ...common, origin: { x: 0.5, y: 0.75 }, angle: 110 });  // up-left
  confetti({ ...common, origin: { x: 0.5, y: 0.75 }, angle: 70 });   // up-right

  // Top tier: delayed hearts wave for extra payoff
  if (tier === 'top') {
    setTimeout(() => {
      confetti({
        particleCount: 30,
        spread: 100,
        startVelocity: 40,
        scalar: 2,
        ticks: 200,
        gravity: 0.8,
        shapes: [confetti.shapeFromText({ text: '💖', scalar: 2 })],
        origin: { x: 0.5, y: 0.85 },
        angle: 90,
      });
    }, 450);
  }
}

// Common base — particles in our container, no full-screen takeover by tsParticles
const baseOptions = {
  fullScreen: { enable: false },
  detectRetina: true,
  fpsLimit: 60,
  particles: {
    number: { value: 0 },
    move: {
      enable: true,
      direction: 'bottom',
      outModes: { default: 'destroy' },
    },
  },
};

const PARTICLE_CONFIGS = {
  // Top tier — petals storm + delayed sparkling-heart wave
  top: {
    primary: {
      ...baseOptions,
      particles: {
        ...baseOptions.particles,
        number: { value: 0 },
        shape: {
          type: 'image',
          options: {
            image: [
              { src: 'assets/cherry_blossom.svg', width: 32, height: 32 },
              { src: 'assets/rose.svg',           width: 32, height: 32 },
              { src: 'assets/tulip.svg',          width: 32, height: 32 },
              { src: 'assets/hibiscus.svg',       width: 32, height: 32 },
            ],
          },
        },
        size:    { value: { min: 14, max: 26 } },
        opacity: { value: { min: 0.75, max: 1 } },
        rotate:  { value: { min: 0, max: 360 }, animation: { enable: true, speed: 30 } },
        move: {
          enable: true,
          direction: 'bottom',
          speed: { min: 6, max: 12 },
          gravity: { enable: true, acceleration: 5 },
          outModes: { default: 'destroy' },
        },
      },
      emitters: [{
        direction: 'bottom',
        rate: { delay: 0.04, quantity: 4 },
        position: { x: 50, y: -5 },
        size: { width: 100, height: 0, mode: 'percent' },
        life: { duration: 2.4, count: 1 },
      }],
    },
    secondary: {
      ...baseOptions,
      particles: {
        ...baseOptions.particles,
        shape: {
          type: 'image',
          options: {
            image: [{ src: 'assets/sparkling_heart.svg', width: 32, height: 32 }],
          },
        },
        size:    { value: { min: 16, max: 28 } },
        opacity: { value: { min: 0.8, max: 1 } },
        rotate:  { value: { min: -20, max: 20 }, animation: { enable: true, speed: 12 } },
        move: {
          enable: true,
          direction: 'top',
          speed: { min: 5, max: 9 },
          gravity: { enable: true, acceleration: -2 },
          outModes: { default: 'destroy' },
        },
      },
      emitters: [{
        direction: 'top',
        rate: { delay: 0.05, quantity: 3 },
        position: { x: 50, y: 70 },
        size: { width: 60, height: 0, mode: 'percent' },
        life: { duration: 1.6, count: 1 },
      }],
    },
    secondaryDelay: 450,
  },

  // Mid tier — gentler petal wave, no heart followup
  mid: {
    primary: {
      ...baseOptions,
      particles: {
        ...baseOptions.particles,
        shape: {
          type: 'image',
          options: {
            image: [
              { src: 'assets/cherry_blossom.svg', width: 32, height: 32 },
              { src: 'assets/tulip.svg',          width: 32, height: 32 },
            ],
          },
        },
        size:    { value: { min: 12, max: 22 } },
        opacity: { value: { min: 0.7, max: 1 } },
        rotate:  { value: { min: 0, max: 360 }, animation: { enable: true, speed: 22 } },
        move: {
          enable: true,
          direction: 'bottom',
          speed: { min: 4, max: 9 },
          gravity: { enable: true, acceleration: 4 },
          outModes: { default: 'destroy' },
        },
      },
      emitters: [{
        direction: 'bottom',
        rate: { delay: 0.07, quantity: 2 },
        position: { x: 50, y: -5 },
        size: { width: 100, height: 0, mode: 'percent' },
        life: { duration: 2.2, count: 1 },
      }],
    },
  },

  // Low-mid — wry sparkles, single gentle puff
  'low-mid': {
    primary: {
      ...baseOptions,
      particles: {
        ...baseOptions.particles,
        shape: {
          type: 'image',
          options: {
            image: [{ src: 'assets/sparkles.svg', width: 32, height: 32 }],
          },
        },
        size:    { value: { min: 10, max: 18 } },
        opacity: { value: { min: 0.6, max: 0.95 } },
        rotate:  { value: { min: 0, max: 360 }, animation: { enable: true, speed: 18 } },
        move: {
          enable: true,
          direction: 'top',
          speed: { min: 3, max: 6 },
          gravity: { enable: true, acceleration: -1 },
          outModes: { default: 'destroy' },
        },
      },
      emitters: [{
        direction: 'top',
        rate: { delay: 0.07, quantity: 2 },
        position: { x: 50, y: 80 },
        size: { width: 50, height: 0, mode: 'percent' },
        life: { duration: 1.6, count: 1 },
      }],
    },
  },

  // Bottom tier — slow disappointed rainclouds drifting down
  bottom: {
    primary: {
      ...baseOptions,
      particles: {
        ...baseOptions.particles,
        shape: {
          type: 'image',
          options: {
            image: [{ src: 'assets/cloud_rain.svg', width: 32, height: 32 }],
          },
        },
        size:    { value: { min: 18, max: 28 } },
        opacity: { value: { min: 0.55, max: 0.85 } },
        rotate:  { value: 0 },
        move: {
          enable: true,
          direction: 'bottom',
          speed: { min: 1.5, max: 3.5 },
          gravity: { enable: true, acceleration: 1.5 },
          outModes: { default: 'destroy' },
        },
      },
      emitters: [{
        direction: 'bottom',
        rate: { delay: 0.18, quantity: 1 },
        position: { x: 50, y: -5 },
        size: { width: 100, height: 0, mode: 'percent' },
        life: { duration: 4, count: 1 },
      }],
    },
  },
};

// ---------- wiring ----------
function startGame() {
  state.questions = pickQuestions();
  state.roundIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  renderMaracasMeter();
  renderRound();
  showScreen('round');
}

$('btn-start').addEventListener('click', startGame);
$('btn-replay').addEventListener('click', startGame);
$('btn-next').addEventListener('click', nextRound);

for (const btn of document.querySelectorAll('.guess-btn')) {
  btn.addEventListener('click', (e) => {
    const guess = e.currentTarget.dataset.guess;
    handleGuess(guess);
  });
}

// ---------- player picker (3A) ----------
function selectPlayer(name) {
  state.playerName = name;
  savePlayer(name);
  for (const chip of document.querySelectorAll('.player-chip')) {
    chip.setAttribute('aria-pressed', chip.dataset.player === name ? 'true' : 'false');
  }
}

for (const chip of document.querySelectorAll('.player-chip')) {
  chip.addEventListener('click', (e) => selectPlayer(e.currentTarget.dataset.player));
}

// Restore previous selection
const previousPlayer = loadPlayer();
if (previousPlayer) selectPlayer(previousPlayer);

// Dev helper — append ?tier=top|mid|low-mid|bottom to jump straight to that
// tier's end screen. Synthetic scores scaled to 8-round games.
const _debugTier = new URLSearchParams(location.search).get('tier');
const _debugTierMap = { top: 8, mid: 6, 'low-mid': 3, bottom: 1 };
if (_debugTier && _debugTier in _debugTierMap) {
  state.questions = Array.from({ length: ROUNDS_PER_GAME },
    () => ({ text: '', isMom: true, lang: 'en' }));
  state.score = _debugTierMap[_debugTier];
  showEnd();
} else {
  showScreen('start');
}
