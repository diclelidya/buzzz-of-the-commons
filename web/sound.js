// Step 10 — the micro-grid as sound. One voice per house, placed at the house in 3D.
// Logic follows reference/the_grid/.../trial_final_soundscape-fluid.html (Tone.js 14.8.49,
// loaded as a global by index.html: the UMD build, as in the reference).

import * as THREE from 'three';

const Tone = window.Tone;
const SCALE = ['C', 'D', 'E', 'G', 'A'];
const HYDRO_KW = 6;
const EIGG = { name: 'Eigg (yedek)', lat: 56.91, lon: -6.16 };
const DEFAULT_WIND = 6;          // m/s, if a fetch fails
const DEFAULT_RADIATION = 200;   // W/m2, if a fetch fails
const STEP_KW = 0.2;
const LOOK_RANGE = 15;           // m from the house centre

export const houses = [];
const supply = { place: '…', wind: DEFAULT_WIND, radiation: DEFAULT_RADIATION, live: false, kW: 0 };
setSupply(EIGG.name, DEFAULT_WIND, DEFAULT_RADIATION, false);

function setSupply(place, wind, radiation, live) {
  const before = houses.length ? share() : 0;
  Object.assign(supply, { place, wind, radiation, live });
  supply.kW = HYDRO_KW + Math.min(30, 0.5 * wind ** 3 * 0.4) + radiation * 0.05;
  // Keep each house's usage relative to its share when the live numbers arrive.
  if (before) for (const h of houses) if (h.usage !== null) h.usage *= share() / before;
}

function share() { return supply.kW / Math.max(1, houses.length); }
function usageOf(h) {
  if (h.usage === null) h.usage = h.factor * share();
  return h.usage;
}
function ratioOf(h) { return usageOf(h) / share(); }

async function fetchSupply() {
  let loc = EIGG;
  try {
    const r = await fetch('https://ipapi.co/json/');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (typeof j.latitude !== 'number') throw new Error(j.reason || 'no location');
    loc = { name: [j.city, j.country_name].filter(Boolean).join(', '), lat: j.latitude, lon: j.longitude };
  } catch (err) {
    console.warn('ipapi failed, using Eigg:', err);
  }
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat.toFixed(2) +
      '&longitude=' + loc.lon.toFixed(2) + '&current=wind_speed_10m,shortwave_radiation&wind_speed_unit=ms';
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const c = (await r.json()).current;
    setSupply(loc.name, c.wind_speed_10m, c.shortwave_radiation, true);
  } catch (err) {
    console.warn('Open-Meteo failed, using defaults:', err);
    setSupply(loc.name, DEFAULT_WIND, DEFAULT_RADIATION, false);
  }
}
fetchSupply();

// --- houses ----------------------------------------------------------------------
// Small per-point jitter: amplitude follows the house's note envelope, irregular when overloaded.
const JITTER = `#include <begin_vertex>
vec3 hp = fract( position * 0.731 );
float h1 = fract( sin( dot( hp.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
float h2 = fract( sin( dot( hp.yz, vec2( 39.3468, 11.135 ) ) ) * 24634.6345 );
vec3 jdir = normalize( vec3( h1 - 0.5, h2 - 0.5, fract( h1 * 7.13 + h2 ) - 0.5 ) + 1e-4 );
float jw = sin( uTime * 18.0 + h1 * 6.2832 ) + uIrr * 1.5 * sin( uTime * ( 37.0 + 60.0 * h2 ) + h2 * 40.0 );
transformed += jdir * uAmp * jw;`;

// Called once per House_XX group, before its first render (CPU arrays still present).
// Returns the house's own point material so the GUI can resize it.
export function addHouse(name, group, baseMaterial) {
  const box = new THREE.Box3().setFromObject(group);   // world space, after Z-up -> Y-up
  const uniforms = { uTime: { value: 0 }, uAmp: { value: 0 }, uIrr: { value: 0 } };
  const material = baseMaterial.clone();
  material.onBeforeCompile = (shader) => {
    baseMaterial.onBeforeCompile(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'uniform float uTime;\nuniform float uAmp;\nuniform float uIrr;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', JITTER);
  };
  group.traverse((o) => { if (o.isPoints) o.material = material; });
  const h = {
    name: name.replace(/_Shell$/, ''),
    centre: box.getCenter(new THREE.Vector3()),
    sphere: box.getBoundingSphere(new THREE.Sphere()),
    note: SCALE[Math.floor(Math.random() * SCALE.length)] + (3 + Math.floor(Math.random() * 3)),
    factor: 0.3 + Math.random() * 1.2,   // start usage = 0.3–1.5 x share
    usage: null,
    env: 0,
    uniforms,
  };
  houses.push(h);
  if (audio) buildVoice(h);
  return material;
}

// --- audio graph -------------------------------------------------------------------
let audio = null;
let starting = false;

// Must be called from the start click: Tone.start() needs that user gesture.
export function startAudio() {
  if (!Tone) return;
  const ready = Tone.start();
  if (starting) return;
  starting = true;
  ready.then(buildGraph);
}

function buildGraph() {
  const master = new Tone.Gain(0.74);
  master.chain(new Tone.Limiter(-1.5), Tone.Destination);
  const meter = new Tone.Meter();
  master.connect(meter);
  const rev = new Tone.Reverb({ decay: 4.2, wet: 0.28 }).connect(master);
  const bus = new Tone.Filter(4600, 'lowpass');
  bus.connect(master);
  bus.connect(rev);
  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' }, envelope: { attack: 3, decay: 1, sustain: 1, release: 4 }, volume: -26,
  }).connect(rev);
  pad.triggerAttack(['C2', 'G2']);
  audio = { bus, meter, listener: Tone.getContext().listener, triggers: { clean: 0, buzz: 0 } };
  houses.forEach(buildVoice);

  let step = 0;
  new Tone.Loop((time) => {
    step = (step + 1) % 16;
    houses.forEach((h, i) => {
      if (!h.clean) return;
      const ratio = ratioOf(h);
      const e = Math.min(1, ratio);
      if (e < 0.05) return;
      const ph = (i * 7) % 16;
      if (!(step === ph || (e > 0.6 && step === (ph + 8) % 16))) return;
      if (Math.random() > 0.32 + e * 0.64) return;
      const vel = 0.13 + e * 0.5;
      let f = Tone.Frequency(h.note).toFrequency();
      if (ratio > 1) {
        const g = Math.min(1, ratio - 1);
        f *= Math.pow(2, Math.min(100, (ratio - 1) * 100) / 1200);
        h.clean.triggerAttackRelease(f, '8n', time, vel * 0.85);
        h.buzz.triggerAttackRelease(f, '16n', time, Math.min(0.7, 0.22 + g * 0.5));
        if (g > 0.45 && Math.random() < 0.45) {
          h.buzz.triggerAttackRelease(f * 1.005, '32n', time + 0.055, Math.min(0.6, 0.2 + g * 0.4));
        }
        audio.triggers.buzz++;
      } else {
        h.clean.triggerAttackRelease(f, '8n', time, vel);
      }
      audio.triggers.clean++;
      Tone.Draw.schedule(() => { h.env = Math.max(h.env, vel); }, time);
    });
  }, '16n').start(0);
  Tone.Transport.bpm.value = 76;
  Tone.Transport.start();
}

function buildVoice(h) {
  h.panner = new Tone.Panner3D({
    panningModel: 'HRTF', distanceModel: 'exponential', refDistance: 8, rolloffFactor: 1.5,
  }).connect(audio.bus);
  h.panner.setPosition(h.centre.x, h.centre.y + 3, h.centre.z);
  h.clean = new Tone.Synth({
    oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.55, sustain: 0.05, release: 1.2 }, volume: -11,
  }).connect(h.panner);
  h.buzz = new Tone.Synth({
    oscillator: { type: 'sawtooth' }, envelope: { attack: 0.004, decay: 0.22, sustain: 0.12, release: 0.3 }, volume: -9,
  });
  h.buzz.chain(new Tone.Distortion(0.9), new Tone.Filter(3200, 'lowpass'), h.panner);
}

// --- interaction + HUD ---------------------------------------------------------------
const hudEl = document.getElementById('hud');
const targetEl = document.getElementById('target');
let target = null;

function nudge(sign) {
  if (!target) return;
  target.usage = Math.max(0, usageOf(target) + sign * STEP_KW);
  showTarget();
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') nudge(1);
  else if (e.code === 'KeyQ') nudge(-1);
});
window.addEventListener('wheel', (e) => nudge(e.deltaY < 0 ? 1 : -1), { passive: true });

function showTarget() {
  if (!target) { targetEl.textContent = ''; return; }
  const ratio = ratioOf(target);
  targetEl.textContent = `${target.name} · nota ${target.note} · oran ${ratio.toFixed(2)} ` +
    `(${usageOf(target).toFixed(1)} / ${share().toFixed(1)} kW)${ratio > 1 ? ' · aşırı yük' : ''}` +
    '\nQ / E ya da tekerlek: kullanım ∓ 0.2 kW';
  targetEl.classList.toggle('over', ratio > 1);
}

function showSupply() {
  hudEl.textContent = `${supply.place}${supply.live ? '' : ' (varsayılan hava)'}\n` +
    `rüzgâr ${supply.wind.toFixed(1)} m/s · ışınım ${Math.round(supply.radiation)} W/m²\n` +
    `arz ${supply.kW.toFixed(1)} kW · pay ${share().toFixed(2)} kW/ev`;
}

const fwd = new THREE.Vector3();
const ray = new THREE.Ray();
let hudClock = 0;

export function updateSound(camera, dt, time) {
  camera.getWorldDirection(fwd);
  if (audio) {
    const L = audio.listener;
    L.positionX.value = camera.position.x;
    L.positionY.value = camera.position.y;
    L.positionZ.value = camera.position.z;
    L.forwardX.value = fwd.x;
    L.forwardY.value = fwd.y;
    L.forwardZ.value = fwd.z;
  }

  ray.set(camera.position, fwd);
  let best = null, bestD = Infinity;
  for (const h of houses) {
    h.env *= Math.exp(-dt * 5);
    const ratio = ratioOf(h);
    h.uniforms.uTime.value = time;
    h.uniforms.uAmp.value = 0.005 + h.env * 0.12;
    h.uniforms.uIrr.value = ratio > 1 ? Math.min(1, 0.3 + (ratio - 1) * 2) : 0;
    const d = camera.position.distanceTo(h.centre);
    if (d <= LOOK_RANGE && d < bestD && ray.intersectsSphere(h.sphere)) { best = h; bestD = d; }
  }
  target = best;

  hudClock -= dt;
  if (hudClock <= 0) {
    hudClock = 0.1;
    showSupply();
    showTarget();
  }
}

// Exposed for debugging from the console.
export const soundDebug = { houses, supply, get audio() { return audio; }, get target() { return target; } };
