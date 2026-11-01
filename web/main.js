// The Buzzz of the Commons — first-person point-cloud walk (Step 8).
// PLYs are Rhino Z-up metres -> rotation.x = -PI/2. GLBs are already Y-up.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import Stats from 'three/addons/libs/stats.module.js';
import { addHouse, setHouseCount, startAudio, updateSound, soundDebug } from './sound.js';

const BG = 0x0B0820;
const EYE_HEIGHT = 1.7;
const RUN_FACTOR = 2.5;
const SPAWN = new THREE.Vector3(92.52, 10.70, 15.00);   // 4 m in front of House_01's door
const LOOK_AT = new THREE.Vector3(-23.5, 10.70, 3.9);  // pipe network centroid (west, -x)

// Each PLY is split into ground tiles of ~TILE_POINTS points (never smaller than TILE_MIN m)
// so frustum culling and the fog-limited far plane can skip what is behind or too far.
const TILE_POINTS = 50000;
const TILE_MIN = 40;

const params = {
  renderScale: 0.75,    // drawing-buffer pixels per CSS pixel
  pointFraction: 0.5,   // share of each tile's (shuffled) points that is drawn
  pointSize: 0.1,
  fogDensity: 0.01,
  walkSpeed: 4,
  variantA: true,
  variantB: true,
};

// --- renderer, scene, camera -------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(params.renderScale);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(BG, params.fogDensity);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 5000);
camera.position.copy(SPAWN);
camera.lookAt(LOOK_AT);

function updateFar() {
  // Beyond ~2.6 / density the exp2 fog is >99.9 % opaque: clip there so far tiles are culled.
  camera.far = params.fogDensity > 0 ? Math.min(5000, 2.6 / params.fogDensity) : 5000;
  camera.updateProjectionMatrix();
}
updateFar();

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(80, 120, 40);
scene.add(sun);

// One shared material for all point clouds so the GUI slider updates everything.
// PLY colours are sRGB bytes; convert to linear in the shader (renderer outputs sRGB).
const pointMaterial = new THREE.PointsMaterial({ size: params.pointSize, vertexColors: true, sizeAttenuation: true });
pointMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>',
    '#include <color_vertex>\n#ifdef USE_COLOR\n\tvColor.rgb = pow( vColor.rgb, vec3( 2.2 ) );\n#endif');
};
const pointMaterials = [pointMaterial];   // plus one per house (sound.js), for the size slider

const variantNodes = { A: [], B: [] };
const pointGeometries = [];   // every tile, for the point-fraction slider
const freshTiles = [];        // drawn once unculled so their buffers upload (see the loop)
let collider = null;

function applyPointFraction() {
  for (const g of pointGeometries) {
    g.setDrawRange(0, Math.ceil(g.getAttribute('position').count * params.pointFraction));
  }
}

// --- loading -------------------------------------------------------------------
const statusEl = document.getElementById('status');
const barEl = document.querySelector('#bar > div');

async function fetchBuffer(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out.buffer;
}

// Fast path for our own PLYs (binary LE, float xyz + uchar rgb, 15 bytes/point).
// Anything else falls back to three's PLYLoader. Returns raw Rhino Z-up arrays.
const FAST_HEADER = /format binary_little_endian 1\.0\n[\s\S]*element vertex (\d+)\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n/;

function parsePLY(buffer) {
  const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(2048, buffer.byteLength)));
  const m = head.match(FAST_HEADER);
  if (m) {
    const n = parseInt(m[1], 10);
    const offset = head.indexOf('end_header\n') + 11;
    const dv = new DataView(buffer, offset);
    const u8 = new Uint8Array(buffer, offset);
    const pos = new Float32Array(n * 3);
    const col = new Uint8Array(n * 3);
    for (let i = 0, p = 0, k = 0; i < n; i++, p += 15, k += 3) {
      pos[k] = dv.getFloat32(p, true);
      pos[k + 1] = dv.getFloat32(p + 4, true);
      pos[k + 2] = dv.getFloat32(p + 8, true);
      col[k] = u8[p + 12];
      col[k + 1] = u8[p + 13];
      col[k + 2] = u8[p + 14];
    }
    return { pos, col };
  }
  const g = new PLYLoader().parse(buffer);
  const pos = g.getAttribute('position').array;
  const c = g.getAttribute('color');
  const col = new Uint8Array(pos.length).fill(255);
  if (c) for (let i = 0; i < col.length; i++) col[i] = Math.round(c.array[i] * 255);
  return { pos, col };
}

// Bucket points into a grid on Rhino XY (counting sort) and return one geometry per
// non-empty tile. Points are scattered in random order, so a drawRange prefix of a
// tile is an even subsample of it (point-fraction slider).
function buildTiles(pos, col) {
  const n = pos.length / 3;
  if (n === 0) return [];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < pos.length; k += 3) {
    const x = pos[k], y = pos[k + 1];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const w = Math.max(x1 - x0, 1e-3), h = Math.max(y1 - y0, 1e-3);
  const cell = Math.max(TILE_MIN, Math.sqrt(w * h * TILE_POINTS / n));
  const nx = Math.ceil(w / cell), ny = Math.ceil(h / cell);

  const cellOf = new Uint32Array(n);
  const start = new Uint32Array(nx * ny + 1);
  for (let i = 0, k = 0; i < n; i++, k += 3) {
    const ix = Math.min(nx - 1, Math.floor((pos[k] - x0) / cell));
    const iy = Math.min(ny - 1, Math.floor((pos[k + 1] - y0) / cell));
    cellOf[i] = iy * nx + ix;
    start[cellOf[i] + 1]++;
  }
  for (let c = 0; c < nx * ny; c++) start[c + 1] += start[c];

  const perm = new Uint32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  const fill = start.slice(0, nx * ny);
  const P = new Float32Array(n * 3), C = new Uint8Array(n * 3);
  for (let j = 0; j < n; j++) {
    const i = perm[j], s = i * 3, d = fill[cellOf[i]]++ * 3;
    P[d] = pos[s]; P[d + 1] = pos[s + 1]; P[d + 2] = pos[s + 2];
    C[d] = col[s]; C[d + 1] = col[s + 1]; C[d + 2] = col[s + 2];
  }

  // Free the CPU copy once it is on the GPU (26 M points would otherwise be held twice).
  const release = function () { this.array = null; };
  const geometries = [];
  for (let c = 0; c < nx * ny; c++) {
    const a = start[c] * 3, b = start[c + 1] * 3;
    if (a === b) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(P.subarray(a, b), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(C.subarray(a, b), 3, true));
    geometry.computeBoundingSphere();
    geometry.getAttribute('position').onUpload(release);
    geometry.getAttribute('color').onUpload(release);
    geometries.push(geometry);
  }
  return geometries;
}

function parseGLB(buffer) {
  return new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
}

function applyVariants() {
  for (const o of variantNodes.A) o.visible = params.variantA;
  for (const o of variantNodes.B) o.visible = params.variantB;
}

let totalPoints = 0;

async function loadAll() {
  const { pointFraction, files: manifest } = await (await fetch('manifest.json')).json();
  // The thinned deploy copy ships its own default (1.0 there looks like 0.5 on the full data).
  params.pointFraction = pointFraction;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  setHouseCount(manifest.filter((f) => /\/House_\d+_Shell\.ply$/.test(f.file)).length);
  const totalBytes = manifest.reduce((s, f) => s + f.bytes, 0);
  let loadedBytes = 0;
  const t0 = performance.now();

  for (let i = 0; i < manifest.length; i++) {
    const item = manifest[i];
    const name = item.file.split('/').pop();
    const label = () => {
      statusEl.textContent = `Yükleniyor ${i + 1}/${manifest.length}: ${name} — ` +
        `${(loadedBytes / 1e6).toFixed(0)} / ${(totalBytes / 1e6).toFixed(0)} MB — ` +
        `${(totalPoints / 1e6).toFixed(1)} M nokta`;
      barEl.style.width = `${(100 * loadedBytes / totalBytes).toFixed(1)}%`;
    };
    label();
    try {
      const buffer = await fetchBuffer(item.file, (n) => { loadedBytes += n; label(); });
      if (item.kind === 'collider') {
        const gltf = await parseGLB(buffer);
        collider = gltf.scene;           // not added to the scene: raycasts only
        collider.updateMatrixWorld(true);
      } else if (item.kind === 'solid') {
        const gltf = await parseGLB(buffer);
        gltf.scene.name = 'solid';
        // GLTFLoader strips ':' from node names, so match on the remaining parts.
        gltf.scene.traverse((o) => {
          if (!o.name.includes('Pipes_all')) return;
          if (o.name.includes('Variant_A')) variantNodes.A.push(o);
          else if (o.name.includes('Variant_B')) variantNodes.B.push(o);
        });
        scene.add(gltf.scene);
      } else {
        const { pos, col } = parsePLY(buffer);
        const points = new THREE.Group();
        points.name = name.replace(/\.ply$/, '');
        points.rotation.x = -Math.PI / 2;  // Rhino Z-up -> three Y-up: (x, y, z) -> (x, z, -y)
        for (const geometry of buildTiles(pos, col)) {
          const tile = new THREE.Points(geometry, pointMaterial);
          tile.frustumCulled = false;
          freshTiles.push(tile);
          pointGeometries.push(geometry);
          points.add(tile);
          totalPoints += geometry.getAttribute('position').count;
        }
        if (/^House_\d+_Shell$/.test(points.name)) pointMaterials.push(addHouse(points.name, points, pointMaterial));
        // Assumption: per-variant pipe vines follow the Variant_A / Variant_B toggles.
        if (name.startsWith('Vegetation_a__')) variantNodes.A.push(points);
        if (name.startsWith('Vegetation_b__')) variantNodes.B.push(points);
        scene.add(points);
        applyPointFraction();
      }
      applyVariants();
    } catch (err) {
      console.error('Load failed:', item.file, err);
    }
  }

  barEl.style.width = '100%';
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`Loaded ${manifest.length} files, ${totalPoints} points in ${pointGeometries.length} tiles in ${secs} s`);
  document.getElementById('loading').classList.add('done');
}

// --- first-person controls -----------------------------------------------------
const controls = new PointerLockControls(camera, document.body);
const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => {
  controls.lock();
  startAudio();   // same click: audio may only start from a user gesture
});
controls.addEventListener('lock', () => overlay.classList.add('hidden'));
controls.addEventListener('unlock', () => overlay.classList.remove('hidden'));

const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

const raycaster = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const rayOrigin = new THREE.Vector3();

function groundHeight(x, z) {
  if (!collider) return null;
  rayOrigin.set(x, 2000, z);
  raycaster.set(rayOrigin, DOWN);
  raycaster.far = 4000;
  const hit = raycaster.intersectObject(collider, true)[0];
  return hit ? hit.point.y : null;
}

function updateMovement(dt) {
  if (controls.isLocked) {
    const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const right = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (fwd || right) {
      const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const step = params.walkSpeed * (run ? RUN_FACTOR : 1) * dt / Math.hypot(fwd, right);
      controls.moveForward(fwd * step);
      controls.moveRight(right * step);
    }
  }
  const g = groundHeight(camera.position.x, camera.position.z);
  if (g !== null) {
    const target = g + EYE_HEIGHT;
    camera.position.y += (target - camera.position.y) * Math.min(1, dt * 12);
  }
}

// --- GUI + FPS -----------------------------------------------------------------
const stats = new Stats();
document.body.appendChild(stats.dom);

const info = { drawn: '' };
const gui = new GUI({ title: 'Ayarlar' });
gui.add(params, 'renderScale', 0.4, 1.5, 0.05).name('Çözünürlük').onChange((v) => { renderer.setPixelRatio(v); });
gui.add(params, 'pointFraction', 0.1, 1, 0.05).name('Nokta oranı').onChange(applyPointFraction);
gui.add(params, 'pointSize', 0.01, 0.5, 0.005).name('Nokta boyutu').onChange((v) => { for (const m of pointMaterials) m.size = v; });
gui.add(params, 'fogDensity', 0, 0.05, 0.0005).name('Sis yoğunluğu').onChange((v) => { scene.fog.density = v; updateFar(); });
gui.add(params, 'walkSpeed', 1, 15, 0.5).name('Yürüme hızı (m/s)');
gui.add(params, 'variantA').name('Variant_A').onChange(applyVariants);
gui.add(params, 'variantB').name('Variant_B').onChange(applyVariants);
gui.add(info, 'drawn').name('Çizilen nokta').disable().listen();

// --- loop ----------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  updateMovement(dt);
  updateSound(camera, dt, clock.elapsedTime);
  renderer.render(scene, camera);
  // New tiles were drawn once unculled, so their buffers are uploaded and the CPU copy freed.
  for (const t of freshTiles) t.frustumCulled = true;
  freshTiles.length = 0;
  info.drawn = `${(renderer.info.render.points / 1e6).toFixed(2)} M`;
  stats.update();
});

// Exposed for debugging from the console.
window.app = { scene, camera, controls, params, variantNodes, sound: soundDebug, get collider() { return collider; } };

loadAll();
