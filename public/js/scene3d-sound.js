'use strict';

/**
 * Noven.code — Interactive 3D Geometric Sculpture & Ambient Sound Experience
 * - Respects prefers-reduced-motion
 * - Never autoplays audio without explicit user consent
 */

class NovenAmbientSound {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isPlaying = false;
    this.volume = Number(localStorage.getItem('nc_sound_volume') || 0.25);
    this.consentDecision = localStorage.getItem('nc_sound_consent'); // 'enabled' | 'muted' | null
    this.oscillators = [];
    this.chordInterval = null;
  }

  initEngine() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.001, this.ctx.currentTime);

    // Warm low-pass filter for calm ambient electronic pad
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(620, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.2, this.ctx.currentTime);

    filter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Ambient chord frequencies (D minor 9th / F major 7th warm harmonic drone)
    const baseFreqs = [146.83, 220.0, 261.63, 329.63];
    baseFreqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.detune.setValueAtTime((idx - 1.5) * 4, this.ctx.currentTime);

      oscGain.gain.setValueAtTime(0.18 / baseFreqs.length, this.ctx.currentTime);
      osc.connect(oscGain);
      oscGain.connect(filter);
      osc.start();
      this.oscillators.push({ osc, oscGain });
    });

    // Subtle harmonic evolution every 6 seconds
    const chords = [
      [146.83, 220.0, 261.63, 329.63], // Dm9
      [130.81, 196.0, 246.94, 293.66], // Cmaj9
      [116.54, 174.61, 220.0, 261.63], // Bbmaj7
      [110.0, 164.81, 220.0, 277.18]   // A7sus4
    ];
    let chordIdx = 0;
    this.chordInterval = setInterval(() => {
      if (!this.isPlaying || !this.ctx) return;
      chordIdx = (chordIdx + 1) % chords.length;
      const nextChord = chords[chordIdx];
      const now = this.ctx.currentTime;
      this.oscillators.forEach((item, i) => {
        if (nextChord[i]) {
          item.osc.frequency.exponentialRampToValueAtTime(nextChord[i], now + 4.2);
        }
      });
    }, 6500);
  }

  enable() {
    this.initEngine();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isPlaying = true;
    localStorage.setItem('nc_sound_consent', 'enabled');
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(Math.max(0.001, this.masterGain.gain.value), now);
    this.masterGain.gain.linearRampToValueAtTime(this.volume, now + 1.2);
  }

  mute() {
    this.isPlaying = false;
    localStorage.setItem('nc_sound_consent', 'muted');
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.4);
    }
  }

  toggle() {
    if (this.isPlaying) {
      this.mute();
    } else {
      this.enable();
    }
    return this.isPlaying;
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, Number(val)));
    localStorage.setItem('nc_sound_volume', String(this.volume));
    if (this.isPlaying && this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.15);
    }
  }
}

/**
 * Interactive 3D Spatial Wireframe & Faceted Polyhedron Renderer
 * Renders an interactive 3D architectural icosahedron/torus-knot lattice on the Hero canvas
 */
function initHero3DCanvas(canvasEl) {
  if (!canvasEl) return;
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    const rect = canvasEl.parentElement.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvasEl.width = width * dpr;
    canvasEl.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener('resize', resize);

  // Build 3D Icosahedron + Inner Core vertices & edges
  const t = (1 + Math.sqrt(5)) / 2;
  const rawVerts = [
    [-1,  t,  0], [ 1,  t,  0], [-1, -t,  0], [ 1, -t,  0],
    [ 0, -1,  t], [ 0,  1,  t], [ 0, -1, -t], [ 0,  1, -t],
    [ t,  0, -1], [ t,  0,  1], [-t,  0, -1], [-t,  0,  1]
  ].map(([x, y, z]) => {
    const len = Math.hypot(x, y, z);
    return { x: x / len, y: y / len, z: z / len };
  });

  // Outer ring orbital nodes
  const orbitalNodes = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    orbitalNodes.push({
      x: Math.cos(angle) * 1.45,
      y: Math.sin(angle) * 0.42,
      z: Math.sin(angle) * 1.45
    });
  }

  // Edges between close vertices
  const edges = [];
  for (let i = 0; i < rawVerts.length; i++) {
    for (let j = i + 1; j < rawVerts.length; j++) {
      const d = Math.hypot(
        rawVerts[i].x - rawVerts[j].x,
        rawVerts[i].y - rawVerts[j].y,
        rawVerts[i].z - rawVerts[j].z
      );
      if (d < 1.2) edges.push([i, j]);
    }
  }

  let rotX = 0.35;
  let rotY = 0.6;
  let targetRotX = 0.35;
  let targetRotY = 0.6;

  window.addEventListener('mousemove', (e) => {
    if (prefersReducedMotion) return;
    const nx = (e.clientX / window.innerWidth) - 0.5;
    const ny = (e.clientY / window.innerHeight) - 0.5;
    targetRotY = nx * 1.1;
    targetRotX = ny * 0.7;
  });

  function project(v, radius, cx, cy) {
    // Rotate Y
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const x1 = v.x * cosY - v.z * sinY;
    const z1 = v.z * cosY + v.x * sinY;

    // Rotate X
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const y2 = v.y * cosX - z1 * sinX;
    const z2 = z1 * cosX + v.y * sinX;

    const fov = 3.6;
    const scale = fov / (fov + z2);
    return {
      px: cx + x1 * radius * scale,
      py: cy + y2 * radius * scale,
      z: z2,
      scale
    };
  }

  function renderFrame() {
    ctx.clearRect(0, 0, width, height);

    const cx = width > 900 ? width * 0.72 : width * 0.5;
    const cy = height * 0.44;
    const radius = Math.min(width, height) * 0.27;

    if (!prefersReducedMotion) {
      rotY += 0.0035 + (targetRotY - rotY) * 0.03;
      rotX += 0.0015 + (targetRotX - rotX) * 0.03;
    }

    const projected = rawVerts.map((v) => project(v, radius, cx, cy));
    const projectedOrbit = orbitalNodes.map((v) => project(v, radius, cx, cy));

    // Draw orbital ring
    ctx.beginPath();
    projectedOrbit.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.px, pt.py);
      else ctx.lineTo(pt.px, pt.py);
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(233, 221, 224, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw icosahedron edges with depth-aware opacity
    edges.forEach(([i, j]) => {
      const a = projected[i];
      const b = projected[j];
      const avgZ = (a.z + b.z) * 0.5;
      const alpha = Math.max(0.08, Math.min(0.65, 0.38 - avgZ * 0.22));
      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
      ctx.strokeStyle = avgZ < 0 ? `rgba(166, 56, 84, ${alpha + 0.15})` : `rgba(233, 221, 224, ${alpha})`;
      ctx.lineWidth = avgZ < 0 ? 1.5 : 1;
      ctx.stroke();
    });

    // Draw vertices
    projected.forEach((pt) => {
      const r = Math.max(2, 3.8 * pt.scale);
      ctx.beginPath();
      ctx.arc(pt.px, pt.py, r, 0, Math.PI * 2);
      ctx.fillStyle = pt.z < 0 ? '#A63854' : 'rgba(248, 247, 245, 0.55)';
      ctx.fill();
    });

    if (!prefersReducedMotion) {
      requestAnimationFrame(renderFrame);
    }
  }

  renderFrame();
}

window.NovenAmbientSound = NovenAmbientSound;
window.initHero3DCanvas = initHero3DCanvas;
