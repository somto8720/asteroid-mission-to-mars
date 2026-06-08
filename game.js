/* ═══════════════════════════════════════════════════════════════
   ASTEROID: MISSION TO MARS — Complete Game Engine
   A tribute to Liv Perrotto and her Asteroid character ⭐
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─────────────── CONSTANTS ─────────────── */
  const GAME_W = 1280;
  const GAME_H = 720;
  const TOTAL_DISTANCE = 225000;          // display km
  const PARTICLE_POOL_SIZE = 500;
  const MAX_LIVES = 3;
  const INVINCIBILITY_TIME = 1.5;         // seconds
  const INTRO_DURATION = 8;
  const LAUNCH_DURATION = 6;

  /* ─────────────── DOM REFS ─────────────── */
  const canvas  = document.getElementById('gameCanvas');
  const ctx     = canvas.getContext('2d');

  const $start     = document.getElementById('startScreen');
  const $hud       = document.getElementById('hud');
  const $gameOver  = document.getElementById('gameOverScreen');
  const $victory   = document.getElementById('victoryScreen');

  const $loadFill  = document.getElementById('loadingFill');
  const $loadText  = document.getElementById('loadingText');
  const $playBtn   = document.getElementById('playBtn');
  const $retryBtn  = document.getElementById('retryBtn');
  const $replayBtn = document.getElementById('replayBtn');
  const $muteBtn   = document.getElementById('muteBtn');

  const $hudDist   = document.getElementById('hudDistance');
  const $hudScore  = document.getElementById('hudScore');
  const $hudLives  = document.getElementById('hudLives');
  const $hudMult   = document.getElementById('hudMultiplier');
  const $thrustFill = document.getElementById('thrustFill');
  const $hudThrust  = document.getElementById('hudThrust');

  const $goDistance  = document.getElementById('goDistance');
  const $goAsteroids = document.getElementById('goAsteroids');
  const $goScore     = document.getElementById('goScore');

  const $vicScore     = document.getElementById('vicScore');
  const $vicTime      = document.getElementById('vicTime');
  const $vicAsteroids = document.getElementById('vicAsteroids');

  /* ─────────────── STATE ─────────────── */
  const State = {
    LOADING: 0, MENU: 1, INTRO: 2, LAUNCH: 3,
    PLAYING: 4, GAME_OVER: 5, VICTORY: 6
  };

  let state = State.LOADING;
  let paused = false;
  let lastTime = 0;

  /* ─────────────── ASSET LOADER ─────────────── */
  const assets = {};
  const assetList = [
    { key: 'shiba',      src: 'assets/asteroid_shiba.png' },
    { key: 'mars',       src: 'assets/mars_planet.png' },
    { key: 'ship',       src: 'assets/spaceship_rocket.png' },
    { key: 'background', src: 'assets/game_background.png' }
  ];

  function loadAssets() {
    return new Promise((resolve) => {
      let loaded = 0;
      const total = assetList.length;
      assetList.forEach((a) => {
        const img = new Image();
        img.onload = () => {
          loaded++;
          const pct = Math.round((loaded / total) * 100);
          $loadFill.style.width = pct + '%';
          $loadText.textContent = 'Loading... ' + pct + '%';
          assets[a.key] = img;
          if (loaded === total) {
            $loadText.textContent = 'Ready!';
            resolve();
          }
        };
        img.onerror = () => {
          loaded++;
          const pct = Math.round((loaded / total) * 100);
          $loadFill.style.width = pct + '%';
          if (loaded === total) resolve();
        };
        img.src = a.src;
      });
    });
  }

  /* ─────────────── CANVAS SCALING ─────────────── */
  let scaleX = 1, scaleY = 1, offsetX = 0, offsetY = 0, scaleFactor = 1;

  function resizeCanvas() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    const sx = w / GAME_W;
    const sy = h / GAME_H;
    scaleFactor = Math.min(sx, sy);
    offsetX = (w - GAME_W * scaleFactor) / 2;
    offsetY = (h - GAME_H * scaleFactor) / 2;
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function applyCamera() {
    ctx.setTransform(scaleFactor, 0, 0, scaleFactor, offsetX + camera.shakeX * scaleFactor, offsetY + camera.shakeY * scaleFactor);
  }

  function resetTransform() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ─────────────── INPUT SYSTEM ─────────────── */
  const keys = {};
  let touchActive = false;
  let touchX = 0, touchY = 0;

  window.addEventListener('keydown', (e) => {
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code) || 
        ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }
    keys[e.code] = true;
    keys[e.key] = true;
    if (e.code === 'KeyM' || e.key === 'm' || e.key === 'M') toggleMute();
    if ((e.code === 'Space' || e.key === ' ' || e.code === 'Enter' || e.key === 'Enter') && state === State.MENU) startGame();
    if ((e.code === 'Space' || e.key === ' ' || e.code === 'Enter' || e.key === 'Enter') && state === State.GAME_OVER) restartGame();
    if ((e.code === 'Space' || e.key === ' ' || e.code === 'Enter' || e.key === 'Enter') && state === State.VICTORY) restartGame();
  }, { passive: false });

  window.addEventListener('keyup', (e) => { 
    keys[e.code] = false; 
    keys[e.key] = false; 
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchActive = true;
    const t = e.touches[0];
    touchX = (t.clientX - offsetX) / scaleFactor;
    touchY = (t.clientY - offsetY) / scaleFactor;
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    touchX = (t.clientX - offsetX) / scaleFactor;
    touchY = (t.clientY - offsetY) / scaleFactor;
  }, { passive: false });

  canvas.addEventListener('touchend', () => { touchActive = false; });

  /* Pause on blur */
  window.addEventListener('blur', () => { paused = true; });
  window.addEventListener('focus', () => { paused = false; lastTime = performance.now(); });

  /* ─────────────── AUDIO SYSTEM ─────────────── */
  let audioCtx = null;
  let masterGain = null;
  let muted = false;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(audioCtx.destination);
  }

  function toggleMute() {
    muted = !muted;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.3;
    $muteBtn.textContent = muted ? '🔇' : '🔊';
  }

  $muteBtn.addEventListener('click', toggleMute);

  function playTone(freq, duration, type, gainVal) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gainVal || 0.15, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(g);
    g.connect(masterGain);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function playNoise(duration, gainVal) {
    if (!audioCtx) return;
    const bufSize = audioCtx.sampleRate * duration;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(gainVal || 0.3, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    src.connect(g);
    g.connect(masterGain);
    src.start();
  }

  const sfx = {
    explosion() { playNoise(0.4, 0.35); playTone(80, 0.3, 'sawtooth', 0.15); },
    dodge()     { playTone(600, 0.08, 'sine', 0.06); playTone(900, 0.06, 'sine', 0.04); },
    launch()    { playNoise(1.5, 0.2); playTone(60, 1.5, 'sawtooth', 0.12); playTone(120, 1.0, 'triangle', 0.08); },
    hit()       { playNoise(0.25, 0.25); playTone(150, 0.15, 'square', 0.1); },
    victory() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((n, i) => setTimeout(() => playTone(n, 0.35, 'sine', 0.12), i * 150));
    },
    countdown() { playTone(440, 0.15, 'square', 0.1); },
    countdownGo() { playTone(880, 0.3, 'square', 0.15); }
  };

  /* Engine hum */
  let engineOsc = null, engineGain = null;
  function startEngine() {
    if (!audioCtx || engineOsc) return;
    engineOsc = audioCtx.createOscillator();
    engineGain = audioCtx.createGain();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain.gain.value = 0.04;
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.frequency.value = 3;
    lfoGain.gain.value = 5;
    lfo.connect(lfoGain);
    lfoGain.connect(engineOsc.frequency);
    lfo.start();
    engineOsc.connect(engineGain);
    engineGain.connect(masterGain);
    engineOsc.start();
  }
  function stopEngine() {
    if (engineOsc) { try { engineOsc.stop(); } catch(e){} engineOsc = null; }
    engineGain = null;
  }

  /* ─────────────── CAMERA / SHAKE ─────────────── */
  const camera = { shakeX: 0, shakeY: 0, intensity: 0, duration: 0, timer: 0 };

  function shakeCamera(intensity, duration) {
    camera.intensity = intensity;
    camera.duration = duration;
    camera.timer = 0;
  }

  function updateCamera(dt) {
    if (camera.timer < camera.duration) {
      camera.timer += dt;
      const progress = camera.timer / camera.duration;
      const dampen = 1 - progress;
      camera.shakeX = (Math.random() * 2 - 1) * camera.intensity * dampen;
      camera.shakeY = (Math.random() * 2 - 1) * camera.intensity * dampen;
    } else {
      camera.shakeX = 0;
      camera.shakeY = 0;
    }
  }

  /* ─────────────── PARTICLE SYSTEM ─────────────── */
  const particles = [];
  for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 1, size: 2, color: '#fff', alpha: 1, shape: 'circle' });
  }

  function spawnParticle(x, y, vx, vy, life, size, color, shape) {
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x; p.y = y; p.vx = vx; p.vy = vy;
        p.life = life; p.maxLife = life;
        p.size = size; p.color = color;
        p.alpha = 1; p.shape = shape || 'circle';
        return p;
      }
    }
    return null;
  }

  function updateParticles(dt) {
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
    }
  }

  function drawParticles() {
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = particles[i];
      if (!p.active) continue;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'line') {
        ctx.fillRect(p.x, p.y, p.size * 4, p.size * 0.5);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* Particle presets */
  function emitExhaust(x, y, count) {
    for (let i = 0; i < count; i++) {
      const colors = ['#ff6600', '#ff9944', '#ffcc66', '#00ccff', '#00f5ff'];
      const c = colors[Math.floor(Math.random() * colors.length)];
      spawnParticle(
        x + Math.random() * 8 - 4,
        y + Math.random() * 10 - 5,
        -150 - Math.random() * 200,
        (Math.random() - 0.5) * 80,
        0.3 + Math.random() * 0.4,
        1 + Math.random() * 3,
        c
      );
    }
  }

  function emitExplosion(x, y, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 250;
      const colors = ['#ff2200', '#ff6600', '#ffaa00', '#ffdd44', '#ffffff'];
      const c = colors[Math.floor(Math.random() * colors.length)];
      spawnParticle(x, y,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        0.4 + Math.random() * 0.8,
        2 + Math.random() * 5, c
      );
    }
  }

  function emitSpeedLines(count) {
    for (let i = 0; i < count; i++) {
      spawnParticle(
        GAME_W + 10,
        Math.random() * GAME_H,
        -800 - Math.random() * 600, 0,
        0.3 + Math.random() * 0.3,
        1 + Math.random() * 2,
        'rgba(150,200,255,0.5)', 'line'
      );
    }
  }

  function emitConfetti(x, y, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 200;
      const colors = ['#ffd700', '#00f5ff', '#ff66cc', '#66ff66', '#ff9944', '#ffffff'];
      const c = colors[Math.floor(Math.random() * colors.length)];
      spawnParticle(x + Math.random() * 200 - 100, y + Math.random() * 100 - 50,
        Math.cos(angle) * speed, Math.sin(angle) * speed - 50,
        1 + Math.random() * 2,
        2 + Math.random() * 4, c
      );
    }
  }

  /* ─────────────── STARFIELD ─────────────── */
  const starLayers = [[], [], []];
  const starSpeeds = [20, 50, 100];
  const starSizes  = [0.5, 1, 1.8];
  const starAlphas = [0.3, 0.5, 0.8];

  function initStarfield() {
    for (let layer = 0; layer < 3; layer++) {
      starLayers[layer] = [];
      const count = 60 + layer * 30;
      for (let i = 0; i < count; i++) {
        starLayers[layer].push({
          x: Math.random() * GAME_W,
          y: Math.random() * GAME_H,
          twinkle: Math.random() * Math.PI * 2
        });
      }
    }
  }

  function updateStarfield(dt, speedMul) {
    for (let layer = 0; layer < 3; layer++) {
      const stars = starLayers[layer];
      const spd = starSpeeds[layer] * (speedMul || 1);
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.x -= spd * dt;
        s.twinkle += dt * (1 + layer * 0.5);
        if (s.x < -5) { s.x = GAME_W + 5; s.y = Math.random() * GAME_H; }
      }
    }
  }

  function drawStarfield() {
    for (let layer = 0; layer < 3; layer++) {
      const stars = starLayers[layer];
      const sz = starSizes[layer];
      const baseAlpha = starAlphas[layer];
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const twk = 0.5 + 0.5 * Math.sin(s.twinkle);
        ctx.globalAlpha = baseAlpha * (0.5 + 0.5 * twk);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, sz, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ─────────────── NEBULA BACKGROUND ─────────────── */
  let nebulaHue = 240;

  function drawBackground(dt) {
    /* Base background image */
    if (assets.background) {
      ctx.globalAlpha = 0.6;
      ctx.drawImage(assets.background, 0, 0, GAME_W, GAME_H);
      ctx.globalAlpha = 1;
    }

    /* Nebula colour wash */
    nebulaHue += dt * 3;
    if (nebulaHue > 360) nebulaHue -= 360;
    const grad = ctx.createRadialGradient(GAME_W * 0.7, GAME_H * 0.4, 50, GAME_W * 0.7, GAME_H * 0.4, 500);
    grad.addColorStop(0, 'hsla(' + Math.floor(nebulaHue) + ',60%,20%,0.08)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, GAME_W, GAME_H);
  }

  /* ─────────────── ASTEROID GENERATION ─────────────── */
  function generateAsteroidShape(radius) {
    const points = 8 + Math.floor(Math.random() * 6);
    const verts = [];
    for (let i = 0; i < points; i++) {
      const angle = (Math.PI * 2 / points) * i;
      const r = radius * (0.7 + Math.random() * 0.5);
      verts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    /* Craters */
    const craters = [];
    const craterCount = 1 + Math.floor(Math.random() * 3);
    for (let c = 0; c < craterCount; c++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * 0.5;
      craters.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        r: radius * (0.1 + Math.random() * 0.2)
      });
    }
    return { verts, craters };
  }

  function drawAsteroidShape(x, y, shape, rotation, baseColor) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    /* Body */
    ctx.beginPath();
    ctx.moveTo(shape.verts[0].x, shape.verts[0].y);
    for (let i = 1; i < shape.verts.length; i++) {
      ctx.lineTo(shape.verts[i].x, shape.verts[i].y);
    }
    ctx.closePath();

    const gray = baseColor || 100;
    ctx.fillStyle = 'rgb(' + gray + ',' + (gray - 10) + ',' + (gray - 20) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgb(' + (gray - 30) + ',' + (gray - 40) + ',' + (gray - 50) + ')';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    /* Craters */
    for (let c = 0; c < shape.craters.length; c++) {
      const cr = shape.craters[c];
      ctx.beginPath();
      ctx.arc(cr.x, cr.y, cr.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgb(' + (gray - 30) + ',' + (gray - 35) + ',' + (gray - 40) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgb(' + (gray - 50) + ',' + (gray - 55) + ',' + (gray - 60) + ')';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ─────────────── GAME OBJECTS ─────────────── */
  let ship = {};
  let asteroids = [];
  let score = 0;
  let lives = MAX_LIVES;
  let distance = TOTAL_DISTANCE;
  let invincibleTimer = 0;
  let multiplier = 1;
  let timeSurvived = 0;
  let asteroidsDodged = 0;
  let spawnTimer = 0;
  let spawnInterval = 1.5;
  let distanceRate = 200;
  let sceneTimer = 0;

  /* ── Thrust system ── */
  const THRUST_MIN = 0.5;
  const THRUST_MAX = 5.0;
  const THRUST_ACCEL = 1.8;       // how fast thrust ramps up per second held
  const THRUST_DECEL = 1.2;       // how fast thrust ramps down per second held
  const THRUST_DECAY = 0.4;       // passive decay back toward 1.0 when no input
  let thrustLevel = 1.0;
  let introPhase = 0;
  let launchPhase = 0;
  let introShibaX = 0;
  let introShibaY = 0;
  let introShipX = 0;
  let marsScale = 0.05;
  let flashAlpha = 0;
  let redFlashAlpha = 0;
  let gameOverDelay = 0;
  let countdownNum = 3;

  function resetGame() {
    ship = {
      x: GAME_W * 0.18,
      y: GAME_H * 0.5,
      w: 100,
      h: 60,
      speed: 300,
      tilt: 0
    };
    asteroids = [];
    score = 0;
    lives = MAX_LIVES;
    distance = TOTAL_DISTANCE;
    invincibleTimer = 0;
    multiplier = 1;
    timeSurvived = 0;
    asteroidsDodged = 0;
    spawnTimer = 0;
    spawnInterval = 1.5;
    distanceRate = 200;
    sceneTimer = 0;
    introPhase = 0;
    launchPhase = 0;
    marsScale = 0.05;
    flashAlpha = 0;
    redFlashAlpha = 0;
    gameOverDelay = 0;
    countdownNum = 3;
    thrustLevel = 1.0;

    /* Reset starfield X positions */
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < starLayers[layer].length; i++) {
        starLayers[layer][i].x = Math.random() * GAME_W;
      }
    }

    /* Clear particles */
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) particles[i].active = false;

    /* Intro positions */
    introShibaX = 80;
    introShibaY = GAME_H * 0.62;
    introShipX = GAME_W * 0.65;
  }

  /* ─────────────── SPAWN ASTEROID ─────────────── */
  function spawnAsteroid() {
    const typeRoll = Math.random();
    let a;
    if (typeRoll < 0.4) {
      /* Small asteroid */
      const r = 12 + Math.random() * 14;
      a = {
        x: GAME_W + r + 20,
        y: 40 + Math.random() * (GAME_H - 80),
        radius: r,
        vx: -200 - Math.random() * 180,
        vy: 0,
        sineAmp: 20 + Math.random() * 30,
        sineFreq: 1 + Math.random() * 2,
        sinePhase: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 3,
        shape: generateAsteroidShape(r),
        color: 90 + Math.floor(Math.random() * 50),
        points: 2,
        baseY: 0,
        passed: false
      };
      a.baseY = a.y;
    } else if (typeRoll < 0.75) {
      /* Large asteroid */
      const r = 35 + Math.random() * 30;
      a = {
        x: GAME_W + r + 20,
        y: 50 + Math.random() * (GAME_H - 100),
        radius: r,
        vx: -90 - Math.random() * 80,
        vy: 0,
        sineAmp: 10 + Math.random() * 20,
        sineFreq: 0.5 + Math.random() * 1,
        sinePhase: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 1.5,
        shape: generateAsteroidShape(r),
        color: 70 + Math.floor(Math.random() * 40),
        points: 5,
        baseY: 0,
        passed: false
      };
      a.baseY = a.y;
    } else {
      /* Space debris */
      const r = 5 + Math.random() * 8;
      a = {
        x: GAME_W + r + 20,
        y: 30 + Math.random() * (GAME_H - 60),
        radius: r,
        vx: -320 - Math.random() * 250,
        vy: (Math.random() - 0.5) * 40,
        sineAmp: 5,
        sineFreq: 3 + Math.random() * 2,
        sinePhase: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 6,
        shape: generateAsteroidShape(r),
        color: 110 + Math.floor(Math.random() * 60),
        points: 1,
        baseY: 0,
        passed: false
      };
      a.baseY = a.y;
    }
    asteroids.push(a);
  }

  /* ─────────────── COLLISION ─────────────── */
  function circleCollision(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < ar + br;
  }

  /* ─────────────── UI HELPERS ─────────────── */
  function showOverlay(el) { el.classList.remove('hidden'); }
  function hideOverlay(el) { el.classList.add('hidden'); }

  function formatNumber(n) {
    return Math.floor(n).toLocaleString();
  }

  function updateHUD() {
    $hudDist.textContent = formatNumber(distance) + ' km';
    $hudScore.textContent = formatNumber(score);
    const hearts = [];
    for (let i = 0; i < MAX_LIVES; i++) hearts.push(i < lives ? '❤️' : '🖤');
    $hudLives.textContent = hearts.join(' ');
    $hudMult.textContent = 'x' + multiplier.toFixed(1);

    /* Thrust gauge */
    const thrustPct = ((thrustLevel - THRUST_MIN) / (THRUST_MAX - THRUST_MIN)) * 100;
    $thrustFill.style.width = thrustPct + '%';
    $hudThrust.textContent = thrustLevel.toFixed(1) + 'x';
    /* Color shift: cyan at low, orange mid, red at max */
    if (thrustLevel > 3.5) {
      $hudThrust.style.color = '#ff4444';
      $thrustFill.style.boxShadow = '0 0 12px rgba(255,68,68,0.7)';
    } else if (thrustLevel > 2.0) {
      $hudThrust.style.color = '#ff9900';
      $thrustFill.style.boxShadow = '0 0 10px rgba(255,153,0,0.6)';
    } else {
      $hudThrust.style.color = '#00f5ff';
      $thrustFill.style.boxShadow = '0 0 8px rgba(0,245,255,0.5)';
    }
  }

  /* ─────────────── DRAW SHIP ─────────────── */
  function drawShip(x, y, w, h, tilt) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(tilt);

    /* Ship sprite */
    if (assets.ship) {
      /* Blink when invincible */
      if (invincibleTimer > 0) {
        ctx.globalAlpha = Math.sin(invincibleTimer * 12) > 0 ? 1 : 0.2;
      }
      ctx.drawImage(assets.ship, -w / 2, -h / 2, w, h);

      /* Tiny Shiba in cockpit */
      if (assets.shiba) {
        const shibaSize = 20;
        ctx.drawImage(assets.shiba, w * 0.08 - shibaSize/2, -shibaSize / 2, shibaSize, shibaSize);
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ─────────────── DRAW MARS (BACKGROUND) ─────────────── */
  function drawMars() {
    if (!assets.mars) return;
    const size = Math.max(30, 400 * marsScale);
    const mx = GAME_W - size * 0.4;
    const my = GAME_H * 0.45 - size / 2;
    ctx.globalAlpha = Math.min(1, marsScale * 3);
    ctx.drawImage(assets.mars, mx, my, size, size);
    ctx.globalAlpha = 1;
  }

  /* ─────────────── SCENE: INTRO ─────────────── */
  function updateIntro(dt) {
    sceneTimer += dt;
    updateStarfield(dt, 0.3);
    updateCamera(dt);
    updateParticles(dt);

    /* Shiba walks toward ship */
    const targetX = introShipX - 70;
    if (introPhase === 0) {
      introShibaX += 65 * dt;
      introShibaY = GAME_H * 0.58 + Math.sin(sceneTimer * 4) * 5; /* bobbing */
      if (introShibaX >= targetX) {
        introShibaX = targetX;
        introPhase = 1;
        flashAlpha = 1;
        shakeCamera(6, 0.4);
      }
    }

    if (introPhase === 1) {
      flashAlpha -= dt * 1.5;
      if (flashAlpha <= 0) {
        flashAlpha = 0;
        introPhase = 2;
      }
    }

    if (introPhase === 2 && sceneTimer >= INTRO_DURATION) {
      state = State.LAUNCH;
      sceneTimer = 0;
      launchPhase = 0;
      countdownNum = 3;
      sfx.launch();
      startEngine();
    }
  }

  function drawIntro() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    drawBackground(0);
    drawStarfield();

    /* Launchpad */
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, GAME_H * 0.72, GAME_W, GAME_H * 0.28);
    ctx.fillStyle = '#252545';
    ctx.fillRect(introShipX - 60, GAME_H * 0.72 - 6, 180, 10);

    /* Platform detail lines */
    ctx.strokeStyle = '#333366';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const lx = introShipX - 50 + i * 22;
      ctx.beginPath();
      ctx.moveTo(lx, GAME_H * 0.72 + 4);
      ctx.lineTo(lx, GAME_H * 0.72 + 25);
      ctx.stroke();
    }

    /* Spaceship on pad */
    if (assets.ship) {
      ctx.save();
      ctx.translate(introShipX + 30, GAME_H * 0.55);
      ctx.rotate(-Math.PI / 2); /* pointing up */
      ctx.drawImage(assets.ship, -50, -35, 100, 70);

      /* Cockpit glow after boarding */
      if (introPhase >= 1) {
        const glowAlpha = 0.3 + 0.2 * Math.sin(sceneTimer * 5);
        ctx.fillStyle = 'rgba(0, 245, 255,' + glowAlpha + ')';
        ctx.beginPath();
        ctx.arc(10, 0, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    /* Shiba walking */
    if (introPhase === 0 && assets.shiba) {
      const bobScale = 1 + 0.02 * Math.sin(sceneTimer * 8);
      ctx.save();
      ctx.translate(introShibaX, introShibaY);
      ctx.scale(bobScale, bobScale);
      ctx.drawImage(assets.shiba, -30, -30, 60, 60);
      ctx.restore();
    }

    /* Flash effect */
    if (flashAlpha > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + flashAlpha + ')';
      ctx.fillRect(0, 0, GAME_W, GAME_H);
    }

    /* Text */
    if (introPhase >= 2) {
      ctx.font = '700 36px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#00f5ff';
      ctx.shadowColor = '#00f5ff';
      ctx.shadowBlur = 20;
      ctx.fillText('ASTEROID IS READY', GAME_W / 2, GAME_H * 0.35);
      ctx.shadowBlur = 0;
    }

    drawParticles();
  }

  /* ─────────────── SCENE: LAUNCH ─────────────── */
  function updateLaunch(dt) {
    sceneTimer += dt;
    updateStarfield(dt, 1 + sceneTimer * 2);
    updateCamera(dt);
    updateParticles(dt);

    /* Countdown: 3..2..1..GO over first 4 seconds */
    if (launchPhase === 0) {
      const prev = countdownNum;
      if (sceneTimer < 1)      countdownNum = 3;
      else if (sceneTimer < 2) countdownNum = 2;
      else if (sceneTimer < 3) countdownNum = 1;
      else { countdownNum = 0; launchPhase = 1; sfx.countdownGo(); shakeCamera(18, 1.5); }

      if (countdownNum !== prev && countdownNum > 0) sfx.countdown();
    }

    /* After countdown: ship moves right with massive exhaust */
    if (launchPhase === 1) {
      ship.x = GAME_W * 0.18 + (sceneTimer - 3) * 30;
      emitExhaust(ship.x - 10, ship.y + ship.h / 2, 5);
      emitSpeedLines(2);

      if (sceneTimer >= LAUNCH_DURATION) {
        state = State.PLAYING;
        sceneTimer = 0;
        showOverlay($hud);
      }
    }
  }

  function drawLaunch() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    drawBackground(0);
    drawStarfield();

    /* Ship */
    if (launchPhase === 1) {
      drawShip(ship.x, ship.y - ship.h / 2, ship.w, ship.h, 0);
    } else {
      /* Ship still on pad, rotating from vertical to horizontal */
      if (assets.ship) {
        const progress = Math.min(1, sceneTimer / 3);
        const rot = (-Math.PI / 2) * (1 - progress);
        const sx = GAME_W * 0.4;
        const sy = GAME_H * 0.5;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(rot);
        ctx.drawImage(assets.ship, -50, -35, 100, 70);
        ctx.restore();
      }
    }

    /* Countdown text */
    if (launchPhase === 0 && countdownNum > 0) {
      const phase = sceneTimer % 1;
      const sc = 1 + phase * 0.5;
      const alpha = 1 - phase;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '900 ' + Math.floor(120 * sc) + 'px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#00f5ff';
      ctx.shadowColor = '#00f5ff';
      ctx.shadowBlur = 40;
      ctx.fillText(countdownNum.toString(), GAME_W / 2, GAME_H / 2);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    if (launchPhase === 1 && sceneTimer < 4.5) {
      const alpha = Math.max(0, 1 - (sceneTimer - 3) * 1.5);
      ctx.globalAlpha = alpha;
      ctx.font = '900 80px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 40;
      ctx.fillText('LAUNCH!', GAME_W / 2, GAME_H / 2);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    drawParticles();
  }

  /* ─────────────── SCENE: PLAYING ─────────────── */
  function updatePlaying(dt) {
    timeSurvived += dt;
    sceneTimer += dt;
    updateCamera(dt);
    updateParticles(dt);

    /* ── Thrust control ── */
    let thrustInput = 0;
    if (keys['ArrowRight'] || keys['KeyD'] || keys['Right'] || keys['d'] || keys['D']) thrustInput = 1;
    if (keys['ArrowLeft']  || keys['KeyA'] || keys['Left']  || keys['a'] || keys['A']) thrustInput = -1;

    if (thrustInput > 0) {
      /* Exponential ramp up: the higher you are, the faster you accelerate */
      thrustLevel += THRUST_ACCEL * thrustLevel * 0.3 * dt;
    } else if (thrustInput < 0) {
      thrustLevel -= THRUST_DECEL * dt;
    } else {
      /* Passive decay toward 1.0 */
      if (thrustLevel > 1.0) thrustLevel -= THRUST_DECAY * dt;
      if (thrustLevel < 1.0) thrustLevel += THRUST_DECAY * 0.5 * dt;
      if (Math.abs(thrustLevel - 1.0) < 0.05) thrustLevel = 1.0;
    }
    thrustLevel = Math.max(THRUST_MIN, Math.min(THRUST_MAX, thrustLevel));

    /* Scale starfield with thrust */
    updateStarfield(dt, 1.0 + thrustLevel * 0.8);

    /* Visual X-axis offset for thrust feel */
    ship.x += ((GAME_W * 0.18 + (thrustLevel - 1.0) * 40) - ship.x) * 5 * dt;

    /* ── Ship movement (vertical dodge only) ── */
    let dy = 0;
    if (keys['ArrowUp']    || keys['KeyW'] || keys['Up']   || keys['w'] || keys['W']) dy = -1;
    if (keys['ArrowDown']  || keys['KeyS'] || keys['Down'] || keys['s'] || keys['S']) dy = 1;

    if (touchActive) {
      const tdy = touchY - (ship.y);
      const tdist = Math.abs(tdy);
      if (tdist > 5) {
        dy = tdy / tdist;
      }
    }

    ship.y += dy * ship.speed * dt;

    /* Clamp vertical only */
    ship.y = Math.max(30, Math.min(GAME_H - 30 - ship.h, ship.y));

    /* Ship tilt */
    const targetTilt = dy * -0.18;
    ship.tilt += (targetTilt - ship.tilt) * 5 * dt;

    /* ── Invincibility ── */
    if (invincibleTimer > 0) invincibleTimer -= dt;

    /* ── Engine exhaust (scales with thrust) ── */
    const exhaustCount = Math.floor(1 + thrustLevel * 2);
    emitExhaust(ship.x - 5, ship.y + ship.h * 0.25, exhaustCount);

    /* ── Spawn asteroids (thrust increases spawn rate) ── */
    spawnTimer += dt;
    const difficultyProgress = 1 - (distance / TOTAL_DISTANCE);
    spawnInterval = Math.max(0.15, (1.5 - difficultyProgress * 1.2) / thrustLevel);
    if (spawnTimer >= spawnInterval) {
      spawnTimer = 0;
      spawnAsteroid();
    }

    /* ── Update asteroids ── */
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      a.x += a.vx * dt;
      a.y = a.baseY + Math.sin(sceneTimer * a.sineFreq + a.sinePhase) * a.sineAmp;
      a.rotation += a.rotSpeed * dt;

      /* Off-screen left — dodged */
      if (a.x + a.radius < -20) {
        if (!a.passed) {
          asteroidsDodged++;
          score += a.points * multiplier;
        }
        asteroids.splice(i, 1);
        continue;
      }

      /* Mark as passed (scored) when fully past ship */
      if (!a.passed && a.x + a.radius < ship.x) {
        a.passed = true;
        asteroidsDodged++;
        score += a.points * multiplier;
      }

      /* Collision */
      if (invincibleTimer <= 0) {
        const shipCX = ship.x + ship.w * 0.45;
        const shipCY = ship.y + ship.h * 0.25;
        const shipR = ship.h * 0.35;
        if (circleCollision(shipCX, shipCY, shipR, a.x, a.y, a.radius * 0.8)) {
          /* HIT! */
          lives--;
          invincibleTimer = INVINCIBILITY_TIME;
          emitExplosion(a.x, a.y, 40);
          shakeCamera(12, 0.5);
          redFlashAlpha = 0.4;
          sfx.hit();
          asteroids.splice(i, 1);

          if (lives <= 0) {
            state = State.GAME_OVER;
            stopEngine();
            emitExplosion(shipCX, shipCY, 80);
            shakeCamera(20, 1);
            sfx.explosion();
            gameOverDelay = 1.8;
            hideOverlay($hud);
          }
          continue;
        }
      }
    }

    /* ── Distance (thrust exponentially increases travel speed) ── */
    distanceRate = (200 + timeSurvived * 5) * Math.pow(thrustLevel, 1.5);
    distance -= distanceRate * dt;

    /* ── Multiplier (thrust boosts multiplier) ── */
    multiplier = (1 + Math.floor(timeSurvived / 15) * 0.5) * (0.8 + thrustLevel * 0.4);
    multiplier = Math.round(multiplier * 10) / 10;

    /* ── Mars scale ── */
    marsScale = 0.05 + (1 - distance / TOTAL_DISTANCE) * 0.95;

    /* ── Distance bonus scoring (more at higher thrust) ── */
    score += dt * 2 * multiplier * thrustLevel;

    /* ── Speed lines at high thrust ── */
    if (thrustLevel > 2.5) {
      emitSpeedLines(Math.floor(thrustLevel - 2));
    }

    /* ── Screen vibration at max thrust ── */
    if (thrustLevel > 4.5) {
      shakeCamera(2, 0.05);
    }

    /* ── Victory check ── */
    if (distance <= 0) {
      distance = 0;
      state = State.VICTORY;
      stopEngine();
      sfx.victory();
      sceneTimer = 0;
      hideOverlay($hud);
    }

    /* ── Red flash decay ── */
    if (redFlashAlpha > 0) redFlashAlpha -= dt * 1.5;

    /* ── Update HUD ── */
    updateHUD();
  }

  function drawPlaying() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    drawBackground(1 / 60);
    drawStarfield();

    /* Mars in background */
    drawMars();

    /* Asteroids */
    for (let i = 0; i < asteroids.length; i++) {
      const a = asteroids[i];
      drawAsteroidShape(a.x, a.y, a.shape, a.rotation, a.color);
    }

    /* Ship */
    drawShip(ship.x, ship.y, ship.w, ship.h, ship.tilt);

    /* Particles on top */
    drawParticles();

    /* Red flash */
    if (redFlashAlpha > 0) {
      ctx.fillStyle = 'rgba(255, 30, 30,' + Math.max(0, redFlashAlpha) + ')';
      ctx.fillRect(0, 0, GAME_W, GAME_H);
    }
  }

  /* ─────────────── SCENE: GAME OVER ─────────────── */
  function updateGameOver(dt) {
    updateStarfield(dt, 0.3);
    updateCamera(dt);
    updateParticles(dt);

    if (gameOverDelay > 0) {
      gameOverDelay -= dt;
      if (gameOverDelay <= 0) {
        $goDistance.textContent = formatNumber(TOTAL_DISTANCE - distance) + ' km';
        $goAsteroids.textContent = formatNumber(asteroidsDodged);
        $goScore.textContent = formatNumber(score);
        showOverlay($gameOver);
      }
    }
  }

  function drawGameOver() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    drawBackground(0);
    drawStarfield();
    drawParticles();
  }

  /* ─────────────── SCENE: VICTORY ─────────────── */
  function updateVictory(dt) {
    sceneTimer += dt;
    updateStarfield(dt, 0.5);
    updateCamera(dt);
    updateParticles(dt);

    /* Ship auto-fly toward mars */
    if (sceneTimer < 3) {
      ship.x += 120 * dt;
      ship.y += (GAME_H * 0.4 - ship.y) * dt * 0.5;
      emitExhaust(ship.x - 5, ship.y + ship.h / 2, 2);
    }

    /* Confetti */
    if (sceneTimer > 1.5 && sceneTimer < 6) {
      emitConfetti(GAME_W / 2, GAME_H / 2, 3);
    }

    /* Show overlay */
    if (sceneTimer >= 2.5 && !$victory.classList.contains('shown')) {
      $vicScore.textContent = formatNumber(score);
      $vicTime.textContent = Math.floor(timeSurvived) + 's';
      $vicAsteroids.textContent = formatNumber(asteroidsDodged);
      showOverlay($victory);
      $victory.classList.add('shown');
    }
  }

  function drawVictory() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    drawBackground(0);
    drawStarfield();
    drawMars();

    /* Ship */
    if (sceneTimer < 4) {
      drawShip(ship.x, ship.y, ship.w, ship.h, 0);
    }

    drawParticles();
  }

  /* ─────────────── GAME FLOW ─────────────── */
  function startGame() {
    initAudio();
    resetGame();
    hideOverlay($start);
    hideOverlay($gameOver);
    hideOverlay($victory);
    hideOverlay($hud);
    $victory.classList.remove('shown');
    state = State.INTRO;
    sceneTimer = 0;
  }

  function restartGame() {
    resetGame();
    hideOverlay($gameOver);
    hideOverlay($victory);
    hideOverlay($hud);
    $victory.classList.remove('shown');
    state = State.INTRO;
    sceneTimer = 0;
  }

  $playBtn.addEventListener('click', startGame);
  $retryBtn.addEventListener('click', restartGame);
  $replayBtn.addEventListener('click', restartGame);

  /* ─────────────── MAIN LOOP ─────────────── */
  function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);

    if (paused) { lastTime = timestamp; return; }

    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.1) dt = 0.016; /* clamp huge spikes */

    /* Clear */
    resetTransform();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    applyCamera();

    switch (state) {
      case State.LOADING:
      case State.MENU:
        /* Draw a subtle starfield behind the menu */
        updateStarfield(dt, 0.3);
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, GAME_W, GAME_H);
        drawBackground(dt);
        drawStarfield();
        break;

      case State.INTRO:
        updateIntro(dt);
        drawIntro();
        break;

      case State.LAUNCH:
        updateLaunch(dt);
        drawLaunch();
        break;

      case State.PLAYING:
        updatePlaying(dt);
        drawPlaying();
        break;

      case State.GAME_OVER:
        updateGameOver(dt);
        drawGameOver();
        break;

      case State.VICTORY:
        updateVictory(dt);
        drawVictory();
        break;
    }

    resetTransform();
  }

  /* ─────────────── INIT ─────────────── */
  async function init() {
    initStarfield();

    await loadAssets();

    state = State.MENU;
    $playBtn.style.display = '';
    document.getElementById('loadingBar').style.display = 'none';

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  init();

})();
