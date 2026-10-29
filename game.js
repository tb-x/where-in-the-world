import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/* ======== tuning knobs ======== */
const ASSET_V = 1;
const FOV = 40;                     // camera's vertical field of view, degrees
const MIN_ALT = 0.03;               // closest the camera gets, in globe radii above the ground (~190 km)
const MAX_ALT = 3.2;
const FIT_PAD = 0.82;               // a region fills this share of the screen's shorter side
const COUNTRY_FIT = 0.45;           // a country flown to fills this share, so its neighbours show too
const MAX_TRI_EDGE = 1;             // degrees; bigger triangles are split so they bend with the globe
const TAP_MOVE_PX = 10;             // a touch that moves less than this is a tap
const TAP_SLOP_PX = [12, 24];       // a tap in the sea this close to a country still finds it
const IDLE_SPIN = 3;                // degrees per second the globe turns until the first touch
const FLY_RHO = 1.3;                // how high a flight climbs (the van Wijk and Nuij zoom curve)
const FLY_SPEED = 1.1;              // seconds per unit of flight path
const LABEL_SECONDS = 3.5;
const CLIP_VOL = 1;                 // 0 to 1, loudness of the recorded voice
const SFX_VOL = 0.5;
const QUESTIONS_PER_LEVEL = 12;
const HINT_AFTER = [2, 3];          // wrong taps before the ring shows, and before the camera flies there
const REMIND_SECONDS = 9;           // no tap for this long: the question is asked again, then the ring shows
const LIFT = 0.004;                 // how far a found country rises off the globe (globe radii, at most)
const CARDS = 5;                    // flags to choose from in a flag question
const CARD_FLY = 0.7;               // seconds the right flag takes to fly onto its country
const FLAG_SPREAD = 0.8;            // seconds a found country's flag takes to spread over it
const HOME = 'Poland';
const COLOURS = ['#ffd45c', '#8fd16a', '#ff9eb8', '#c3a3f2', '#ffad6b'];
const CONT_COLOURS = { EU: '#ff9eb8', AS: '#ffd45c', AF: '#ffad6b', NA: '#8fd16a', SA: '#c3a3f2', OC: '#6fd3c4', AN: '#f4f7ff' };
const PALE = '#dfe5ec';
const OCEAN = '#2f86d6';
const COAST = '#1c5c9e';
const BORDER = '#ffffff';
// The camera's continent views (`regions`) and the closer view for small places (`closer`) are in
// assets/levels.json, shared with dev/check.py.
const STORE = 'world.';

const TEST = /tbxtest/.test(location.search) || navigator.webdriver;
const ALL_OPEN = /[?&]all\b/.test(location.search);   // every level open (for grown-ups and tests)
const D2R = Math.PI / 180;

/* ======== helpers ======== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapLon = lon => ((lon + 540) % 360) - 180;
const $ = id => document.getElementById(id);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(STORE + key)) ?? fallback; } catch { return fallback; } }
function save(key, v) { try { localStorage.setItem(STORE + key, JSON.stringify(v)); } catch {} }

function dirOf(lon, lat, out = new THREE.Vector3()) {
  const cl = Math.cos(lat * D2R);
  return out.set(cl * Math.sin(lon * D2R), Math.sin(lat * D2R), cl * Math.cos(lon * D2R));
}
function lonLatOf(v) {
  return { lon: Math.atan2(v.x, v.z) / D2R, lat: Math.asin(clamp(v.y / v.length(), -1, 1)) / D2R };
}

function decode(flat, q) {
  const out = new Float64Array(flat.length);
  let x = 0, y = 0;
  for (let i = 0; i < flat.length; i += 2) {
    x += flat[i]; y += flat[i + 1];
    out[i] = x / q; out[i + 1] = y / q;
  }
  return out;
}

function inRing(lon, lat, r) {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const yi = r[i + 1], yj = r[j + 1];
    if ((yi > lat) !== (yj > lat) && lon < (r[j] - r[i]) * (lat - yi) / (yj - yi) + r[i]) c = !c;
  }
  return c;
}
function inPoly(lon, lat, p) {
  for (const x of [lon, lon + 360, lon - 360]) {
    const [x0, y0, x1, y1] = p.box;
    if (x < x0 || x > x1 || lat < y0 || lat > y1) continue;
    let n = 0;
    for (const r of p.rings) if (inRing(x, lat, r)) n++;
    if (n % 2) return true;
  }
  return false;
}

/* ======== game clock: waits that tests can fast-forward with __wm.step ======== */
let clock = 0;
const waits = [];
function sleep(s) { return new Promise(res => waits.push({ t: clock + s, res })); }
function tickClock(dt) {
  clock += dt;
  for (let i = waits.length - 1; i >= 0; i--) if (waits[i].t <= clock) waits.splice(i, 1)[0].res();
}

/* ======== the globe ======== */
const canvas = $('globe');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 10);
scene.add(camera);
const AMBIENT = 1.9;
const ambient = new THREE.AmbientLight(0xffffff, AMBIENT);
scene.add(ambient);
const globe = new THREE.Group();   // the ocean, the countries and their lines: the Earth in the finale
scene.add(globe);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-0.6, 0.8, 0.3);
camera.add(sun);
const centre = new THREE.Object3D();
scene.add(centre);
sun.target = centre;

// the ocean is drawn a little behind the land (polygon offset), so they never flicker into each other from far away
const ocean = new THREE.Mesh(new THREE.SphereGeometry(0.9995, 160, 80),
  new THREE.MeshLambertMaterial({ color: OCEAN, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }));
globe.add(ocean);

const glow = new THREE.Mesh(new THREE.SphereGeometry(1.12, 64, 32), new THREE.ShaderMaterial({
  side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying vec3 vN; void main(){ float i = pow(clamp(0.62 - dot(vN, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 2.2); gl_FragColor = vec4(0.55, 0.8, 1.0, 1.0) * i; }',
}));
globe.add(glow);

/* ======== countries ======== */
let countries = [], byName = {}, coast, border;

function triangulate(rings) {
  // earcut in longitude/latitude, then split long edges so the surface follows the sphere
  const contour = [], holes = [];
  rings.forEach((r, k) => {
    const pts = [];
    for (let i = 0; i < r.length; i += 2) pts.push(new THREE.Vector2(r[i], r[i + 1]));
    (k ? holes : contour).push(...(k ? [pts] : pts));
  });
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  const lon = [], lat = [];
  for (const p of contour.concat(...holes)) { lon.push(p.x); lat.push(p.y); }
  const mid = new Map();
  const midpoint = (a, b) => {
    const key = a < b ? a * 1e7 + b : b * 1e7 + a;
    let m = mid.get(key);
    if (m === undefined) {
      m = lon.length;
      lon.push((lon[a] + lon[b]) / 2); lat.push((lat[a] + lat[b]) / 2);
      mid.set(key, m);
    }
    return m;
  };
  const len = (a, b) => Math.hypot(lat[b] - lat[a], (lon[b] - lon[a]) * Math.cos((lat[a] + lat[b]) / 2 * D2R));
  const tris = [], stack = faces.map(f => f.slice());
  while (stack.length) {
    const [a, b, c] = stack.pop();
    const ab = len(a, b), bc = len(b, c), ca = len(c, a);
    const m = Math.max(ab, bc, ca);
    if (m <= MAX_TRI_EDGE) { tris.push(a, b, c); continue; }
    if (m === ab) { const k = midpoint(a, b); stack.push([a, k, c], [k, b, c]); }
    else if (m === bc) { const k = midpoint(b, c); stack.push([a, b, k], [a, k, c]); }
    else { const k = midpoint(c, a); stack.push([a, b, k], [k, b, c]); }
  }
  // front faces outward: counter-clockwise in longitude/latitude is counter-clockwise seen from space
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
    if ((lon[b] - lon[a]) * (lat[c] - lat[a]) - (lat[b] - lat[a]) * (lon[c] - lon[a]) < 0) { tris[i + 1] = c; tris[i + 2] = b; }
  }
  return { lon, lat, tris };
}

function boxOf(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) {
    x0 = Math.min(x0, p.box[0]); y0 = Math.min(y0, p.box[1]); x1 = Math.max(x1, p.box[2]); y1 = Math.max(y1, p.box[3]);
  }
  return [x0, y0, x1, y1];
}

function buildCountry(c, q) {
  const polys = c.polys.map(p => {
    const rings = p.map(r => decode(r, q));
    const o = rings[0];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < o.length; i += 2) {
      x0 = Math.min(x0, o[i]); x1 = Math.max(x1, o[i]); y0 = Math.min(y0, o[i + 1]); y1 = Math.max(y1, o[i + 1]);
    }
    return { rings, box: [x0, y0, x1, y1] };
  });
  const pos = [], ll = [], idx = [];
  const v = new THREE.Vector3();
  const g = new THREE.BufferGeometry();
  for (const p of polys) {
    const t = triangulate(p.rings);
    const base = pos.length / 3;
    p.v0 = base; p.vn = t.lon.length;
    for (let i = 0; i < t.lon.length; i++) { dirOf(t.lon[i], t.lat[i], v); pos.push(v.x, v.y, v.z); ll.push(t.lon[i], t.lat[i]); }
    g.addGroup(idx.length, t.tris.length, 0);   // each part has its own group, so an island can get its flag alone
    for (const i of t.tris) idx.push(base + i);
  }
  const arr = new Float32Array(pos);
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(arr.slice(), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ll.length), 2));
  g.setIndex(idx);
  const colour = new THREE.Color(COLOURS[c.c]);
  const base = new THREE.MeshLambertMaterial({ color: colour.clone() });
  const mesh = new THREE.Mesh(g, [base]);
  globe.add(mesh);
  return { ...c, polys, mesh, base, colour, ll: new Float32Array(ll), tris: idx.length / 3, lift: 0, liftGoal: 0, bump: 0, glow: 0 };
}

function buildLines(lines, q, colour, opacity) {
  const pos = [], v = new THREE.Vector3();
  for (const flat of lines) {
    const r = decode(flat, q);
    for (let i = 2; i < r.length; i += 2) {
      dirOf(r[i - 2], r[i - 1], v).multiplyScalar(1.0004); pos.push(v.x, v.y, v.z);
      dirOf(r[i], r[i + 1], v).multiplyScalar(1.0004); pos.push(v.x, v.y, v.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity }));
  globe.add(m);
  return m;
}

function hitAt(lon, lat) {
  for (const c of countries) {
    const k = c.polys.findIndex(p => inPoly(lon, lat, p));
    if (k >= 0) return { c, part: k, lon, lat };
  }
  return null;
}

// Russia is drawn in two continents' colours when the continents are shown (the Urals at about 60°E)
const contOf = (c, lon) => (c.name === 'Russia' ? (wrapLon(lon) > 19 && wrapLon(lon) < 60 ? 'EU' : 'AS') : c.cont);

/* ======== flags painted on countries ======== */
const flagTextures = new Map();

function flagTexture(code) {
  if (!flagTextures.has(code)) {
    flagTextures.set(code, new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = 512; cv.height = 384;
        cv.getContext('2d').drawImage(img, 0, 0, 512, 384);
        const t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        res(t);
      };
      img.onerror = () => res(null);
      img.src = `assets/flags/${code}.svg`;
    }));
  }
  return flagTextures.get(code);
}

// Fit the 4:3 flag over a box so it covers it, measured on the ground (longitude shrinks with latitude);
// returns the flag's position (uv) of a point
function setUV(c, parts, box) {
  const [w, s, e, n] = box;
  const cx = (w + e) / 2, cy = (s + n) / 2, k = Math.cos(cy * D2R);
  let fw = (e - w) * k, fh = n - s;
  if (fw / fh > 4 / 3) fh = fw * 3 / 4; else fw = fh * 4 / 3;
  const uvOf = (lon, lat) => [0.5 + wrapLon(lon - cx) * k / fw, 0.5 + (lat - cy) / fh];
  const uv = c.mesh.geometry.attributes.uv;
  for (const i of parts) {
    const p = c.polys[i];
    for (let v = p.v0; v < p.v0 + p.vn; v++) uv.setXY(v, ...uvOf(c.ll[v * 2], c.ll[v * 2 + 1]));
  }
  uv.needsUpdate = true;
  return uvOf;
}

// The flag material spreads the flag over the country's own colour in a growing circle from a point
// (uFrom, in flag coordinates); update() grows uR
const SPREAD_END = 1.8;   // a radius past every corner of the flag
function flagMaterial(c, tex) {
  const m = new THREE.MeshLambertMaterial({ map: tex });
  m.userData.u = { uFrom: { value: new THREE.Vector2(0.5, 0.5) }, uR: { value: SPREAD_END }, uBase: { value: c.base.color } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.fragmentShader = 'uniform vec2 uFrom;\nuniform float uR;\nuniform vec3 uBase;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec4 sampledDiffuseColor = texture2D( map, vMapUv );
      float spread = smoothstep( uR, uR - 0.05, length( ( vMapUv - uFrom ) * vec2( 4.0 / 3.0, 1.0 ) ) );
      diffuseColor.rgb *= mix( uBase, sampledDiffuseColor.rgb, spread );`);
  };
  return m;
}
const spreading = new Set();

async function paintFlag(c, parts, box, from) {
  if (!c.flag) return;
  const tex = await flagTexture(c.flag);
  if (!tex) return;
  const uvOf = setUV(c, parts, box);
  if (!c.mesh.material[1]) c.mesh.material[1] = flagMaterial(c, tex);
  const u = c.mesh.material[1].userData.u;
  if (from && !parts.every(i => c.painted?.has(i))) { u.uFrom.value.set(...uvOf(...from)); u.uR.value = 0; spreading.add(c); }
  c.painted = new Set([...(c.painted || []), ...parts]);
  if (!flagsHidden) for (const i of parts) c.mesh.geometry.groups[i].materialIndex = 1;
}

// During a flag question the painted flags are hidden, so the map can't give the answer away
let flagsHidden = false;
function hideFlags(hide) {
  flagsHidden = hide;
  for (const c of countries) {
    if (!c.painted) continue;
    for (const i of c.painted) c.mesh.geometry.groups[i].materialIndex = hide ? 0 : 1;
  }
}

/* ======== how the map looks ======== */
function setLook(mode, keep = new Set()) {
  for (const c of countries) {
    c.mesh.geometry.groups.forEach(g => { g.materialIndex = 0; });   // its flag material stays for the next trip
    c.painted = null;
    c.lift = c.liftGoal = c.bump = c.glow = 0;
    c.mesh.scale.setScalar(1);
    c.base.emissive.setRGB(0, 0, 0);
    c.base.vertexColors = false;
    if (mode === 'continents') {
      if (c.name === 'Russia') {   // half Europe, half Asia
        const n = c.ll.length / 2, col = new Float32Array(n * 3), eu = new THREE.Color(CONT_COLOURS.EU), as = new THREE.Color(CONT_COLOURS.AS);
        for (let v = 0; v < n; v++) (contOf(c, c.ll[v * 2]) === 'EU' ? eu : as).toArray(col, v * 3);
        c.mesh.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
        c.base.vertexColors = true;
        c.base.color.set('#ffffff');
      } else c.base.color.set(CONT_COLOURS[c.cont]);
    } else if (mode === 'pale' && !keep.has(c)) c.base.color.copy(c.colour).lerp(new THREE.Color(PALE), 0.8);
    else c.base.color.copy(c.colour);
    c.base.needsUpdate = true;
  }
}

/* ======== camera ======== */
const view = { lon: 19, lat: 28, alt: 2.4 };
let W = 1, H = 1, focal = 1;

function halfFov() {
  const v = FOV / 2 * D2R;
  return Math.min(v, Math.atan(Math.tan(v) * W / H));
}
function globeAlt() { return clamp(1 / Math.sin(halfFov() * FIT_PAD) - 1, 0.5, MAX_ALT); }
// height at which a place reaching ext degrees from its centre fills the screen
function altFor(ext, fit = FIT_PAD) {
  const e = clamp(ext, 0.8, 89) * D2R, a = halfFov() * fit;
  return clamp(Math.cos(e) + Math.sin(e) / Math.tan(a) - 1, MIN_ALT, globeAlt());
}

function resize() {
  W = Math.max(1, innerWidth); H = Math.max(1, innerHeight);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  focal = H / 2 / Math.tan(FOV / 2 * D2R);
}

// while the flag cards cover the bottom of the screen, the picture moves up by half their height
let viewShift = 0, viewShiftGoal = 0;

function placeCamera() {
  if (viewShift) camera.setViewOffset(W, H, 0, viewShift, W, H);
  else camera.clearViewOffset();
  view.lat = clamp(view.lat, -80, 80);
  view.lon = wrapLon(view.lon);
  view.alt = clamp(view.alt, MIN_ALT, MAX_ALT);
  dirOf(view.lon, view.lat, camera.position).multiplyScalar(1 + view.alt);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.near = view.alt * 0.3;
  camera.far = view.alt + 2.2;
  camera.updateProjectionMatrix();
  glow.visible = view.alt > 0.25;
  border.material.opacity = clamp(0.35 + view.alt * 2, 0.35, 0.8);
}

/* ======== flights ======== */
let flight = null;

function flyTo(target) {
  const w0 = view.alt, w1 = clamp(target.alt, MIN_ALT, MAX_ALT);
  const a = dirOf(view.lon, view.lat), b = dirOf(target.lon, clamp(target.lat, -80, 80));
  const d1 = Math.acos(clamp(a.dot(b), -1, 1));
  const rho = FLY_RHO, rho2 = rho * rho, rho4 = rho2 * rho2;
  let S, at;
  if (d1 < 1e-4) {
    S = Math.log(w1 / w0) / rho;
    at = s => [0, w0 * Math.exp(rho * s)];
  } else {
    const b0 = (w1 * w1 - w0 * w0 + rho4 * d1 * d1) / (2 * w0 * rho2 * d1);
    const b1 = (w1 * w1 - w0 * w0 - rho4 * d1 * d1) / (2 * w1 * rho2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    S = (r1 - r0) / rho;
    at = s => [w0 / (rho2 * d1) * (Math.cosh(r0) * Math.tanh(rho * s + r0) - Math.sinh(r0)),
               w0 * Math.cosh(r0) / Math.cosh(rho * s + r0)];
  }
  if (flight) flight.done();
  const secs = Math.abs(S) < 0.02 ? 0.3 : clamp(Math.abs(S) * FLY_SPEED, 0.7, 3.5);
  flight = { a, b, d1, S, at, secs, t: 0 };
  idle = false;
  return new Promise(res => { flight.done = res; });
}

function stepFlight(dt) {
  if (!flight) return;
  const f = flight;
  f.t = Math.min(1, f.t + dt / f.secs);
  const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
  const [u, w] = f.at(e * f.S);
  const k = f.t === 1 ? 1 : clamp(u, 0, 1);
  const d = new THREE.Vector3();
  if (f.d1 < 1e-4) d.copy(f.b);
  else d.copy(f.a).multiplyScalar(Math.sin((1 - k) * f.d1)).addScaledVector(f.b, Math.sin(k * f.d1)).divideScalar(Math.sin(f.d1));
  const ll = lonLatOf(d);
  view.lon = ll.lon; view.lat = ll.lat; view.alt = Math.min(w, MAX_ALT);
  if (f.t === 1) { flight = null; f.done(); }
}

function goBox([w, s, e, n], fit = COUNTRY_FIT) {
  const lat = (s + n) / 2;
  const ext = Math.max((n - s) / 2, (e - w) / 2 * Math.cos(lat * D2R));
  return flyTo({ lon: wrapLon((w + e) / 2), lat, alt: altFor(ext, fit) });
}
function goView(v) {
  if (v === 'world') return flyTo({ lon: view.lon, lat: clamp(view.lat, -30, 40), alt: globeAlt() });
  if (v === 'home') return goBox(byName[HOME].box);
  const r = typeof v === 'string' ? levels.regions[v] : v;
  return flyTo({ lon: r.lon, lat: r.lat, alt: altFor(r.ext) });
}

/* ======== touch: turn, zoom, tap ======== */
const pointers = new Map();
let gesture = null, idle = true, spin = { lon: 0, lat: 0 };
const raycaster = new THREE.Raycaster();
const unitSphere = new THREE.Sphere(new THREE.Vector3(), 1);

function lonLatAt(x, y) {
  raycaster.setFromCamera(new THREE.Vector2(x / W * 2 - 1, -(y / H) * 2 + 1), camera);
  const hit = raycaster.ray.intersectSphere(unitSphere, new THREE.Vector3());
  return hit && lonLatOf(hit);
}
// what the finger landed on, forgiving a near miss in the sea
function pickAt(x, y) {
  const at = (px, py) => { const ll = lonLatAt(px, py); return ll && hitAt(ll.lon, ll.lat); };
  let hit = at(x, y);
  for (const r of TAP_SLOP_PX) {
    if (hit) break;
    const found = new Map();
    for (let k = 0; k < 8; k++) {
      const h = at(x + r * Math.cos(k * Math.PI / 4), y + r * Math.sin(k * Math.PI / 4));
      if (h) { const f = found.get(h.c) || { h, n: 0 }; f.n++; found.set(h.c, f); }
    }
    hit = [...found.values()].sort((p, q) => q.n - p.n)[0]?.h || null;
  }
  return hit;
}

function pinchInfo() {
  const [p, q] = [...pointers.values()];
  return { d: Math.hypot(p.x - q.x, p.y - q.y), x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}
function pan(dx, dy) {
  const k = view.alt / focal / D2R;   // degrees of arc per pixel at the middle of the screen
  view.lon -= dx * k / Math.max(Math.cos(view.lat * D2R), 0.2);
  view.lat += dy * k;
}

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  if (mode === 'finale') { finale?.pointer('down', e.clientX, e.clientY); return; }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (flight && mode === 'look') flight = null;
  idle = false; spin = { lon: 0, lat: 0 };
  if (pointers.size === 1) gesture = { x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, last: performance.now() };
  else { gesture = gesture || {}; gesture.moved = true; gesture.pinch = pinchInfo(); }
  canvas.classList.add('drag');
});
canvas.addEventListener('pointermove', e => {
  if (mode === 'finale') { finale?.pointer('move', e.clientX, e.clientY); return; }
  const p = pointers.get(e.pointerId);
  if (!p || !gesture) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (flight) return;   // a question's flight finishes before the globe can be turned
  if (pointers.size >= 2) {
    const now = pinchInfo(), was = gesture.pinch;
    if (was && now.d > 0) {
      view.alt *= was.d / now.d;
      pan(now.x - was.x, now.y - was.y);
    }
    gesture.pinch = now;
    return;
  }
  if (Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0) > TAP_MOVE_PX) gesture.moved = true;
  if (!gesture.moved) return;
  const before = { lon: view.lon, lat: view.lat };
  pan(dx, dy);
  const t = performance.now(), dt = Math.max(1, t - gesture.last) / 1000;
  spin = { lon: (view.lon - before.lon) / dt, lat: (view.lat - before.lat) / dt };
  gesture.last = t;
});
function pointerEnd(e) {
  if (mode === 'finale') { finale?.pointer('up', e.clientX, e.clientY); return; }
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 1) { gesture.pinch = null; return; }
  if (pointers.size) return;
  canvas.classList.remove('drag');
  const g = gesture;
  gesture = null;
  if (!g) return;
  if (!g.moved && e.type === 'pointerup' && performance.now() - g.t0 < 700) tap(e.clientX, e.clientY);
  if (performance.now() - g.last > 80) spin = { lon: 0, lat: 0 };
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (mode === 'finale') return;
  if (mode === 'look') flight = null;
  idle = false;
  if (!flight) view.alt *= Math.exp(e.deltaY * 0.0015);
}, { passive: false });

function tap(x, y) {
  const hit = pickAt(x, y);
  if (mode === 'quiz') answer(hit);
  else if (mode === 'look' && hit) { showName(hit.c, hit.c.name, hit.c.label); say(line('this', hit.c)); }
}

/* ======== labels over the globe: the name bubble, stickers, the hint ring ======== */
const labelEl = $('label'), ringEl = $('ring'), stickersEl = $('stickers');
let shown = null, labelTimer = 0;
const stickers = [];
let ringAt = null;

function screenOf(lon, lat, lift = 0.004) {
  const p = dirOf(lon, lat).multiplyScalar(1 + lift);
  const facing = p.clone().normalize().dot(camera.position.clone().normalize());
  p.project(camera);
  return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, on: facing > 0.15 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 };
}
function place(el, [lon, lat]) {
  const s = screenOf(lon, lat);
  el.style.left = `${s.x}px`;
  el.style.top = `${s.y}px`;
  el.style.visibility = s.on ? 'visible' : 'hidden';
}

// lift a country and show its name for a few seconds
function showName(c, name, at, seconds = LABEL_SECONDS) {
  if (shown && shown.c !== c) shown.c.liftGoal = shown.c.found ? 0.4 : 0;
  shown = { c, at };
  if (c) { c.bump = 1; c.liftGoal = 1; }
  labelEl.textContent = name;
  labelEl.classList.add('on');
  labelTimer = seconds;
}
function hideName() {
  if (!shown) return;
  if (shown.c) shown.c.liftGoal = shown.c.found ? 0.4 : 0;
  shown = null;
  labelEl.classList.remove('on');
}

function addSticker(emoji, at, cls = '') {
  if (!emoji) return;
  const el = document.createElement('div');
  el.className = `sticker ${cls}`;
  el.textContent = emoji;
  stickersEl.append(el);
  stickers.push({ el, at });
}
function clearStickers() { stickers.length = 0; stickersEl.textContent = ''; }

function showRing(at) { ringAt = at; ringEl.classList.add('on'); }
// the first hint: a ring round the answer; on a 'world' trip the globe first turns so it faces the answer
async function hintRing(t) {
  if (quiz?.L.camera === 'world' && t.kind !== 'continent') {
    quiz.moved = true;
    await flyTo({ lon: t.at[0], lat: clamp(t.at[1], -45, 50), alt: Math.min(view.alt, globeAlt()) });
  }
  if (quiz?.target === t && !quiz.solved) showRing(t.at);
}
function hideRing() { ringAt = null; ringEl.classList.remove('on'); }

function placeLabels() {
  if (shown) place(labelEl, shown.at);
  for (const s of stickers) place(s.el, s.at);
  if (ringAt) place(ringEl, ringAt);
}

/* ======== voice: Kokoro clips, the device's voice when a clip is missing ======== */
// Clips are listed by their exact text in assets/voice/clips.json (made by dev/voices.py); the lines
// themselves are in assets/lines.json. Test pages decode the clips but never play a sound. say() resolves
// when the line has been said, on the game clock.
let lines = { country: {}, shared: {} }, clips = {}, actx = null, voiceGain = null, sfxGain = null, playing = null, sayToken = 0;
const buffers = new Map();
const said = [];

function line(kind, t) { return (lines.country[kind] || '').replace('{say}', t.say).replace('{capital}', t.capital?.[0] ?? ''); }
// the question and the answer for a target, by the kind of question
const askKind = t => (t.q === 'flag' ? 'flag' : t.q === 'capital' ? 'capital' : 'where');
const yesKind = t => (t.q === 'capital' ? 'capitalYes' : 'yes');

function audio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
    voiceGain = actx.createGain();
    voiceGain.gain.value = CLIP_VOL;
    voiceGain.connect(actx.destination);
    sfxGain = actx.createGain();
    sfxGain.gain.value = SFX_VOL;
    sfxGain.connect(actx.destination);
  }
  return actx;
}

// iOS only lets sound start inside a touch, so the first touch anywhere wakes the audio up
let unlocked = false;
addEventListener('pointerdown', () => {
  if (unlocked || TEST) return;
  const c = audio();
  if (!c) return;
  c.resume?.();
  const s = c.createBufferSource();
  s.buffer = c.createBuffer(1, 1, 22050);
  s.connect(c.destination);
  s.start(0);
  unlocked = true;
}, { capture: true });

function clipBuffer(file) {
  if (!buffers.has(file)) {
    const c = audio();
    buffers.set(file, !c ? Promise.resolve(null) : fetch(`assets/voice/${file}`)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(b => new Promise((ok, no) => c.decodeAudioData(b, ok, no)))
      .catch(() => null));
  }
  return buffers.get(file);
}
function preload(texts) { for (const t of texts) if (clips[t]) clipBuffer(clips[t].file); }

function stopVoice() {
  if (playing) { try { playing.stop(); } catch {} playing = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

async function say(text) {
  if (!text) return;
  const token = ++sayToken;
  stopVoice();
  const clip = clips[text];
  const buf = clip ? await clipBuffer(clip.file) : null;
  if (token !== sayToken) return;   // a newer line has started
  said.push({ text, via: buf ? 'clip' : 'speech' });
  if (said.length > 20) said.shift();
  const secs = buf ? buf.duration : 0.4 + text.split(/\s+/).length * 0.38;
  if (!TEST && buf) {
    const s = actx.createBufferSource();
    s.buffer = buf;
    s.connect(voiceGain);
    s.start();
    playing = s;
  } else if (!TEST && 'speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    const v = speechSynthesis.getVoices().find(v => v.lang === 'en-US');
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  await sleep(secs);
}

/* ======== sound effects (synthesized) ======== */
function tone(freq, start, dur, type = 'sine', vol = 1, slide = 0) {
  const c = actx;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, c.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(sfxGain);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.02);
}
function sfx(name) {
  if (TEST || !audio() || actx.state !== 'running') return;
  if (name === 'right') { tone(660, 0, 0.12, 'triangle', 0.6); tone(990, 0.09, 0.22, 'triangle', 0.6); }
  else if (name === 'wrong') tone(260, 0, 0.22, 'sine', 0.5, 0.7);
  else if (name === 'stamp') { tone(140, 0, 0.12, 'square', 0.25, 0.5); tone(1320, 0.05, 0.3, 'triangle', 0.3); }
  else if (name === 'end') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, 'triangle', 0.45));
}

/* ======== screens ======== */
let mode = 'start', levels = null, progress = load('progress', {});
const screens = ['start', 'levels', 'quizbar', 'places', 'end', 'back', 'cards', 'passport'];
function showScreens(...on) { for (const s of screens) $(s).hidden = !on.includes(s); }

function goStart() {
  stopQuiz();
  closeCards();
  mode = 'start';
  hideName(); clearStickers(); hideRing();
  setLook('plain');
  showScreens('start');
  idle = true;
  goView('world');
}
function goLook() {
  stopQuiz();
  mode = 'look';
  setLook('plain');
  showScreens('places', 'back');
  say(lines.shared['fly-world']);
}
function goLevels() {
  stopQuiz();
  mode = 'levels';
  hideName(); clearStickers(); hideRing();
  setLook('plain');
  idle = true;
  const grid = $('levelgrid');
  grid.textContent = '';
  levels.levels.forEach((L, i) => {
    const b = document.createElement('button');
    const open = ALL_OPEN || i === 0 || progress[i - 1] !== undefined;
    const best = progress[i];
    b.disabled = !open;
    b.innerHTML = `<span class="icon">${open ? L.icon : '🔒'}</span><span class="num">${i + 1}</span>` +
      `<span class="stars">${best === undefined ? '' : '★'.repeat(starsOf(best, countOf(L)))}</span>`;
    b.setAttribute('aria-label', `Level ${i + 1}: ${L.trip}`);
    b.addEventListener('click', () => playLevel(i));
    grid.append(b);
  });
  if (ALL_OPEN || load('finaleSeen', false)) {   // the seasons finale, to watch again
    const b = document.createElement('button');
    b.className = 'sun';
    b.innerHTML = '<span class="icon">🌞</span>';
    b.setAttribute('aria-label', 'Why we have summer and winter');
    b.addEventListener('click', () => startFinale(0));
    grid.append(b);
  }
  showScreens('levels', 'back');
}
// 1 to 3 stars from the countries found on the first try
function starsOf(firstTry, total) { return firstTry >= total ? 3 : firstTry >= total * 0.6 ? 2 : 1; }
const everyPlace = () => [...new Set(levels.levels.filter(l => l.camera !== 'globe' && !l.mix).flatMap(l => l.ask))];
function askOf(L) {
  if (L.mix) return everyPlace().filter(n => !levels.levels.find(l => l.tour).ask.includes(n));
  if (L.tour) return everyPlace();
  return L.ask;
}
function countOf(L) { return L.questions || QUESTIONS_PER_LEVEL; }

$('play').addEventListener('click', () => goLevels());
$('look').addEventListener('click', () => goLook());
$('pass').addEventListener('click', () => goPassport());
$('back').addEventListener('click', () => { closeCards(); if (mode === 'finale') endFinale(); else (mode === 'quiz' || mode === 'end' ? goLevels() : goStart()); });
$('again').addEventListener('click', () => playLevel(levelIdx));
$('next').addEventListener('click', () => playLevel(levelIdx + 1));
$('tolevels').addEventListener('click', () => goLevels());
$('hear').addEventListener('click', () => quiz?.target && say(line(askKind(quiz.target), quiz.target)));
$('places').addEventListener('click', e => {
  const b = e.target.closest('button[data-go]');
  if (!b) return;
  hideName();
  say(lines.shared[`fly-${b.dataset.go}`]);
  goView(b.dataset.go);
});

/* ======== questions ======== */
let quiz = null, levelIdx = 0, quizToken = 0;

function stopQuiz() { quizToken++; quiz = null; hideRing(); closeCards(); }

// what a level can ask about: a country, a continent or an island (part of a country)
function targetOf(name) {
  const cont = Object.entries(levels.continents).find(([, n]) => n === name)?.[0];
  if (cont && levels.levels[levelIdx].camera === 'globe') {   // "Australia" is a country everywhere else
    const r = levels.regions[cont];
    return { kind: 'continent', name, say: name, cont, at: [r.lon, r.lat],
             members: countries.filter(c => c.cont === cont || c.name === 'Russia' && (cont === 'EU' || cont === 'AS')) };
  }
  const isl = levels.islands[name];
  if (isl) {
    const c = byName[isl.country];
    const parts = c.polys.map((p, k) => k).filter(k => {
      const p = c.polys[k];
      if (isl.at) return inPoly(isl.at[0], isl.at[1], p);
      const [w, s, e, n] = isl.box, mx = wrapLon((p.box[0] + p.box[2]) / 2), my = (p.box[1] + p.box[3]) / 2;
      return mx >= w && mx <= e && my >= s && my <= n;
    });
    const box = boxOf(parts.map(k => c.polys[k]));
    return { kind: 'island', name, say: name, c, parts, box, at: [wrapLon((box[0] + box[2]) / 2), (box[1] + box[3]) / 2] };
  }
  const c = byName[name];
  return { kind: 'country', name, say: c.say, c, parts: c.polys.map((p, k) => k), box: c.box, at: c.label };
}

function isRight(t, hit) {
  if (!hit) return false;
  if (t.kind === 'continent') return contOf(hit.c, hit.lon) === t.cont;
  if (t.kind === 'island') return hit.c === t.c && t.parts.includes(hit.part);
  return hit.c === t.c;
}

// half the size of a place, in degrees on the ground
function halfSize(t) {
  const [w, s, e, n] = t.box;
  return Math.max((n - s) / 2, (e - w) / 2 * Math.cos((s + n) / 2 * D2R));
}
// a view (centre and half-width) shows a place if it's inside and big enough to tap on this screen
function shows(v, t) {
  const px = 2 * halfSize(t) * FIT_PAD * Math.min(W, H) / 2 / v.ext;
  const away = Math.acos(clamp(dirOf(v.lon, v.lat).dot(dirOf(t.at[0], t.at[1])), -1, 1)) / D2R;
  return px >= levels.closer.minPx && away + halfSize(t) * 0.5 <= v.ext / FIT_PAD;   // the view reaches ext / FIT_PAD
}
// a wide view of its own round a place, with the place pushed off-centre so it isn't the obvious answer
function closerView(t) {
  const [k, lo, hi] = levels.closer.view, ext = clamp(halfSize(t) * k, lo, hi);
  const a = Math.random() * Math.PI * 2, r = ext * levels.closer.offset * (0.6 + Math.random() * 0.4);
  return { lon: t.at[0] + Math.cos(a) * r / Math.max(Math.cos(t.at[1] * D2R), 0.3), lat: clamp(t.at[1] + Math.sin(a) * r, -60, 70), ext };
}
function regionOf(v) { return v === 'home' ? { lon: byName[HOME].label[0], lat: byName[HOME].label[1], ext: 8 } : typeof v === 'string' ? levels.regions[v] : v; }

// Move the camera for a map question. Returns true when it ends up away from the level's own view.
// 'world' (the later trips) never turns towards the answer: the child finds the right part of the world too.
async function cameraFor(L, t, first) {
  if (L.camera === 'world') { await goView('world'); return false; }   // the whole globe, still facing where the child left it
  if (L.camera === 'globe') { await flyTo({ lon: t.at[0] + (Math.random() - 0.5) * 50, lat: clamp(t.at[1], -45, 50), alt: globeAlt() }); return false; }
  const v = L.camera === 'level' ? regionOf(L.view) : L.camera === 'continent' ? levels.regions[t.c.cont] : null;
  if (!v || !shows(v, t)) {   // an island level, or a place far too small or outside the usual view
    const c = closerView(t);
    await flyTo({ lon: c.lon, lat: c.lat, alt: altFor(c.ext) });
    return true;
  }
  if (L.camera === 'level' && !first && !quiz.moved) return false;
  await flyTo({ lon: v.lon, lat: v.lat, alt: altFor(v.ext) });
  return false;
}

async function playLevel(i) {
  stopQuiz();
  const token = quizToken;
  levelIdx = i;
  mode = 'quiz';
  const L = levels.levels[i];
  hideName(); clearStickers(); hideRing(); closeCards();
  const targets = planTrip(L);
  setLook(L.camera === 'globe' ? 'continents' : L.pale ? 'pale' : 'plain',
          new Set([byName[HOME], ...targets.map(t => t.c).filter(Boolean)]));
  for (const c of countries) c.found = false;
  preload(targets.flatMap(t => [line(askKind(t), t), line(yesKind(t), t), ...(t.q === 'flag' ? [line('this', t)] : [])]));
  const dots = $('dots');
  dots.innerHTML = targets.map(t => `<i${t.q === 'flag' ? ' data-flag' : t.q === 'capital' ? ' data-capital' : ''}></i>`).join('');
  showScreens('quizbar', 'back');
  idle = false;
  window.tbxEvent?.('level-start', { level: i + 1 });
  say(lines.shared.go);
  quiz = { L, targets, n: 0, firstTry: 0, results: [], moved: false };
  for (let n = 0; n < targets.length; n++) {
    if (token !== quizToken) return;
    quiz.n = n;
    dots.children[n].classList.add('now');
    await ask(targets[n], n === 0, token);
    if (token !== quizToken) return;
  }
  endLevel(token);
}

// The places of a trip: each once, then, when the trip is longer than its list, a few asked again at the
// end, picked from the first half so other questions come in between
function tripTargets(names, n) {
  const once = names.slice(0, n), more = n - once.length;
  const again = shuffle(once.slice(0, Math.max(Math.ceil(once.length / 2), more))).slice(0, more);
  return [...once.map(targetOf), ...again.map(name => ({ ...targetOf(name), repeat: true }))];
}

// The questions of one trip, in order. A flag question is always about a country the trip hasn't shown yet:
// it lights up with its name and the child picks its flag (asking for a flag the child has just seen painted
// on the map would make no sense; changed 2026-10-29). Places asked again at the end are map questions (a
// country met in a flag question then has its flag on), and the last question is always on the map.
function planTrip(L) {
  const total = countOf(L), F = Math.min(L.flags || 0, total - 1);
  let names = shuffle(askOf(L).slice());
  if (L.tour) {   // mostly places from the passport, and a few not stamped yet
    const stamped = names.filter(n => passport.includes(n)), fresh = names.filter(n => !passport.includes(n));
    const nNew = Math.max(L.new, total - stamped.length);
    names = shuffle([...fresh.slice(0, nNew), ...stamped.slice(0, total - nNew)]);
  }
  // a different handful each time: `places` of the list (any in `always` among them), the rest asked again
  if (L.always) names = [...L.always, ...names.filter(n => !L.always.includes(n))];
  names = shuffle(names.slice(0, Math.min(L.places || total, total)));
  const targets = tripTargets(names, total);
  const firsts = targets.filter(t => !t.repeat), last = targets.length - 1;
  const alone = t => !targets.some(o => o !== t && !o.repeat && o.c === t.c);   // (Sicily would paint Italy's flag)
  shuffle(firsts.filter(t => t !== targets[last] && t.kind === 'country' && t.c.flag && alone(t))).slice(0, F)
    .forEach(t => { t.q = 'flag'; });
  return withCapitals(L, targets.map(t => ({ q: 'map', ...t })));
}

// A capitals level asks every map question by its capital city; a number asks that many (countries with a capital listed)
function withCapitals(L, plan) {
  if (!L.capitals) return plan;
  const can = plan.filter(t => t.q === 'map' && t.kind === 'country' && levels.capitals[t.name]);
  for (const t of L.capitals === true ? can : shuffle(can).slice(0, L.capitals)) { t.q = 'capital'; t.capital = levels.capitals[t.name]; }
  return plan;
}

function ask(t, first, token) {
  return new Promise(async done => {
    quiz.target = t;
    quiz.wrong = 0;
    quiz.done = done;
    quiz.busy = true;
    quiz.solved = false;
    if (t.q === 'flag') {   // the country lights up with its name; its flag (and every other) is hidden meanwhile
      hideFlags(true);
      openCards(t);
      quiz.moved = true;
      await goBox(t.box);
      if (token !== quizToken) return;
      t.c.glow = 1;
      showName(t.c, t.name, t.at, 1e9);
      await say(line('this', t));
      if (token !== quizToken) return;
      quiz.busy = false;
      await say(line('flag', t));
    } else {
      const away = await cameraFor(quiz.L, t, first);
      if (token !== quizToken) return;
      quiz.moved = away;
      quiz.busy = false;
      await say(line(askKind(t), t));
    }
    remind(t, token);
  });
}

// no tap for a while: ask again, then show the ring (or, for flags, take away some wrong ones)
async function remind(t, token) {
  let n = 0;
  while (token === quizToken && quiz?.target === t && !quiz.solved) {
    const since = clock;
    await sleep(REMIND_SECONDS);
    if (token !== quizToken || quiz?.target !== t || quiz.solved || quiz.lastTap > since) continue;
    if (n++ === 0) say(line(askKind(t), t));
    else if (t.q === 'flag') { thinCards(2); say(line('flag', t)); }
    else { hintRing(t); say(lines.shared.look); }
  }
}

// a right answer, on the map or among the flags
async function solved(t, token) {
  quiz.busy = true;
  quiz.solved = true;
  const first = quiz.wrong === 0;
  if (first) quiz.firstTry++;
  if (!t.repeat) quiz.results.push({ t, first });   // a place asked again isn't a new one
  $('dots').children[quiz.n].classList.replace('now', first ? 'gold' : 'done');
  hideRing();
  sfx('right');
  if (flagsHidden) hideFlags(false);   // a flag question: the flags come back as its flag spreads over the country
  found(t);
  await say(line(yesKind(t), t));
  await sleep(0.4);
  if (token !== quizToken) return;
  hideName();
  closeCards();
  quiz.done();
}

async function answer(hit) {
  if (!quiz || quiz.busy || !quiz.target) return;
  const t = quiz.target, token = quizToken;
  if (t.q === 'flag') {   // the question is about the flags: a tap on the map just names the country
    if (hit && hit.c !== t.c) { showName(hit.c, hit.c.name, hit.c.label, 2); say(line('this', hit.c)); }
    return;
  }
  quiz.lastTap = clock;
  if (!hit) return;   // a tap in the sea isn't an answer
  if (isRight(t, hit)) return solved(t, token);
  quiz.wrong++;
  sfx('wrong');
  window.tbxEvent?.('mixup', { asked: t.name, tapped: hit.c.name });
  {
    const cont = t.kind === 'continent' ? contOf(hit.c, hit.lon) : null;
    const name = cont ? levels.continents[cont] : hit.c.name;
    showName(hit.c, name, cont ? [hit.lon, hit.lat] : hit.c.label, 2.5);
    say(line('this', cont ? { say: name } : hit.c));
  }
  if (quiz.wrong === HINT_AFTER[0]) hintRing(t);
  if (quiz.wrong === HINT_AFTER[1]) {
    quiz.busy = true;
    quiz.moved = true;
    await (t.kind === 'continent' ? flyTo({ lon: t.at[0], lat: clamp(t.at[1], -45, 50), alt: globeAlt() }) : goBox(t.box));
    if (token !== quizToken) return;
    quiz.busy = false;
    showRing(t.at);
    for (const c of t.members || [t.c]) c.glow = 1;
    say(lines.shared.look);
  }
}

function found(t) {
  for (const c of countries) c.glow = 0;
  if (t.kind === 'continent') {
    for (const c of t.members) { c.bump = 1; c.liftGoal = 0.4; c.found = true; }
    showName(null, t.name, t.at, 2.5);
  } else {
    if (t.kind === 'country') { t.c.found = true; t.c.bump = 1; t.c.liftGoal = 0.4; }
    paintFlag(t.c, t.parts, t.box, t.at);   // spreading from where its name (and a flying flag card) sits
    showName(t.kind === 'country' ? t.c : null, t.name, t.at, 2.5);
  }
  // (no emoji sticker on the found place: the user found them confusing, 2026-10-29; the capital's star stays)
  if (t.q === 'capital') {   // a star on the capital city, with its name
    const at = [t.capital[1], t.capital[2]];
    addSticker('⭐', at, 'capital');
    showName(t.c, t.capital[0], at, 3.5);
  }
  stamp(t.name);
}

/* ======== flag questions: five flags to choose from ======== */
const cardsEl = $('cards');

function lookalikes(c) {
  return [...new Set(levels.lookalikes.filter(g => g.includes(c.name)).flat())].filter(n => n !== c.name).map(n => byName[n]);
}

// the right flag and four wrong ones: from other continents, the same continent, or look-alikes first
function cardsFor(t) {
  const known = [...new Set(levels.levels.flatMap(l => l.ask))].map(n => byName[n]).filter(c => c && c.flag && c !== t.c);
  const alike = new Set(lookalikes(t.c));
  const far = shuffle(known.filter(c => c.cont !== t.c.cont && !alike.has(c)));
  const near = shuffle(known.filter(c => c.cont === t.c.cont && !alike.has(c)));
  const pool = quiz.L.cards === 'alike' ? [...shuffle([...alike]), ...near, ...far]
    : quiz.L.cards === 'near' ? [...near, ...far] : far;
  return shuffle([t.c, ...pool.slice(0, CARDS - 1)]);
}

function openCards(t) {
  cardsEl.textContent = '';
  for (const c of cardsFor(t)) {
    const b = document.createElement('button');
    b.className = 'card';
    b.dataset.name = c.name;
    b.setAttribute('aria-label', `The flag of ${c.name}`);
    b.innerHTML = `<img src="assets/flags/${c.flag}.svg" alt="">`;
    b.addEventListener('click', () => pickCard(c, b));
    cardsEl.append(b);
  }
  cardsEl.hidden = false;
  cardsEl.classList.remove('out');
  requestAnimationFrame(() => { viewShiftGoal = cardsEl.offsetHeight / 2; });
  viewShiftGoal = 70;
}
function closeCards() {
  cardsEl.hidden = true;
  viewShiftGoal = 0;
  if (flagsHidden) hideFlags(false);
}
// take away wrong flags until `keep` are left (the right one stays)
function thinCards(keep) {
  const wrong = [...cardsEl.children].filter(b => b.dataset.name !== quiz.target.c.name && !b.classList.contains('gone'));
  shuffle(wrong).slice(0, Math.max(0, wrong.length - (keep - 1))).forEach(b => b.classList.add('gone'));
}

async function pickCard(c, b) {
  if (!quiz || quiz.busy || quiz.target?.q !== 'flag' || b.classList.contains('gone')) return;
  const t = quiz.target, token = quizToken;
  quiz.lastTap = clock;
  if (c === t.c) {
    quiz.busy = true;
    flyCard(b, t.at);
    await sleep(CARD_FLY);
    if (token !== quizToken) return;
    return solved(t, token);
  }
  quiz.wrong++;
  sfx('wrong');
  b.classList.remove('shake');
  void b.offsetWidth;
  b.classList.add('shake');
  say(line('this', c));
  window.tbxEvent?.('mixup', { asked: t.name, tapped: c.name, flag: true });
  if (quiz.wrong === HINT_AFTER[0]) thinCards(2);
  if (quiz.wrong >= HINT_AFTER[1]) { thinCards(1); cardsEl.querySelector(`[data-name="${CSS.escape(t.c.name)}"]`)?.classList.add('glow'); }
}

// a copy of the flag flies from its card onto the country
function flyCard(b, at) {
  const r = b.getBoundingClientRect(), s = screenOf(at[0], at[1]);
  const img = b.querySelector('img').cloneNode();
  img.className = 'flying';
  Object.assign(img.style, { left: `${r.left + 8}px`, top: `${r.top + 8}px`, width: `${r.width - 16}px` });
  document.body.append(img);
  img.animate([{ transform: 'translate(0, 0) scale(1)', opacity: 1 },
               { transform: `translate(${s.x - r.left - r.width / 2}px, ${s.y - r.top - r.height / 2}px) scale(.3)`, opacity: 0.2 }],
              { duration: CARD_FLY * 1000, easing: 'cubic-bezier(.5,0,.6,1)' }).finished.then(() => img.remove(), () => img.remove());
  setTimeout(() => img.remove(), CARD_FLY * 1000 + 500);   // (a hidden page never finishes the animation)
  b.classList.add('picked');
}

/* ======== passport: every place found, kept on this device ======== */
let passport = load('passport', []);

function stamp(name) {
  if (passport.includes(name)) return;
  passport.push(name);
  save('passport', passport);
}

function sayOf(name) { return byName[name]?.say || name; }

function goPassport() {
  stopQuiz();
  mode = 'passport';
  hideName(); clearStickers();
  setLook('plain');
  idle = true;
  const groups = Object.entries(levels.continents).map(([code, cname]) => {
    const names = passport.filter(n => {
      const isl = levels.islands[n];
      const c = byName[isl ? isl.country : n];
      return n === cname ? true : c && c.cont === code && !Object.values(levels.continents).includes(n);
    });
    return { code, names };
  }).filter(g => g.names.length);
  const pages = $('pages');
  pages.innerHTML = `<h2>🛂 ${passport.length}${load('medal', false) ? ' 🏅' : ''}</h2>` + (groups.length ? '' : '<p class="empty">🌍 ▶</p>') + groups.map(g =>
    `<div class="group"><span class="cont">${levels.stickers[levels.continents[g.code]] || ''}</span>` + g.names.map(n => {
      return `<button class="stamp" data-name="${n}">${stampFace(n, byName[levels.islands[n]?.country ?? n])}<small>${n}</small></button>`;
    }).join('') + '</div>').join('');
  showScreens('passport', 'back');
}
$('pages').addEventListener('click', e => {
  const b = e.target.closest('.stamp');
  if (b) say(lines.country.this.replace('{say}', sayOf(b.dataset.name)));
});

// a stamp shows the place's flag (an island its country's), a continent its animal
function stampFace(name, c) {
  return c?.flag ? `<img src="assets/flags/${c.flag}.svg" alt="">` : `<b>${levels.stickers[name] || '⭐'}</b>`;
}

async function endLevel(token) {
  mode = 'end';
  const q = quiz;
  quiz = null;
  const total = q.targets.length;
  progress[levelIdx] = Math.max(progress[levelIdx] ?? 0, q.firstTry);
  save('progress', progress);
  window.tbxEvent?.('level-end', { level: levelIdx + 1, firstTry: q.firstTry, of: total });
  await sleep(0.6);
  if (token !== quizToken) return;
  const stamps = $('stamps');
  stamps.innerHTML = q.results.map(({ t, first }) => {
    return `<span class="stamp${first ? ' first' : ''}">${stampFace(t.name, t.c)}<small>${t.name}</small></span>`;
  }).join('');
  $('endstars').textContent = '★'.repeat(starsOf(q.firstTry, total)) + '☆'.repeat(3 - starsOf(q.firstTry, total));
  $('next').hidden = levelIdx + 1 >= levels.levels.length;
  showScreens('end', 'back');
  sfx('end');
  await say(lines.shared.trip);
  if (token !== quizToken) return;
  goView('world');
  if (levels.levels[levelIdx].mix && !load('finaleSeen', false)) {   // after the last level, the first time: the seasons finale
    await sleep(2.5);
    if (token === quizToken && mode === 'end') startFinale(0);
  }
}

/* ======== the seasons finale (finale.js, loaded when it's needed) ======== */
const FINALE = './finale.js?v=13';   // bump ?v= after changing finale.js
let finale = null;

async function startFinale(beat = 0) {
  stopQuiz();
  hideName(); clearStickers(); hideRing();
  showScreens('back');
  idle = false;
  flight = null;
  if (!finale) {
    const m = await import(FINALE);
    finale = m.createFinale({
      THREE, scene, camera, globe, headlight: sun, ambient, ambientIntensity: AMBIENT, dirOf, byName, HOME,
      lines, say, sleep, stopVoice, sfx,
      medal: () => save('medal', true),
      exit: () => endFinale(),
    });
  }
  mode = 'finale';
  finale.start(beat);
}

function endFinale() {
  if (mode !== 'finale') return;
  finale.stop();
  stopVoice();
  save('finaleSeen', true);
  mode = 'levels';
  view.alt = globeAlt();
  goLevels();
}

/* ======== main loop ======== */
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  requestAnimationFrame(frame);
}

function update(dt) {
  tickClock(dt);
  if (mode === 'finale') {
    finale?.update(dt);
    renderer.render(scene, camera);
    return;
  }
  viewShift += (viewShiftGoal - viewShift) * Math.min(1, dt * 6);
  if (Math.abs(viewShift - viewShiftGoal) < 0.5) viewShift = viewShiftGoal;
  if (idle) view.lon += IDLE_SPIN * dt;
  stepFlight(dt);
  if (!gesture && !flight && (spin.lon || spin.lat)) {
    view.lon += spin.lon * dt; view.lat += spin.lat * dt;
    const k = Math.exp(-dt * 4);
    spin.lon *= k; spin.lat *= k;
    if (Math.hypot(spin.lon, spin.lat) < 0.5) spin = { lon: 0, lat: 0 };
  }
  placeCamera();
  for (const c of spreading) {
    const u = c.mesh.material[1].userData.u;
    u.uR.value += dt * SPREAD_END / FLAG_SPREAD;
    if (u.uR.value >= SPREAD_END) { u.uR.value = SPREAD_END; spreading.delete(c); }
  }
  const lift = Math.min(LIFT, view.alt * 0.04);
  for (const c of countries) {
    if (!c.lift && !c.liftGoal && !c.bump && !c.glow) continue;
    c.lift += (c.liftGoal - c.lift) * Math.min(1, dt * 8);
    if (Math.abs(c.lift - c.liftGoal) < 1e-3) c.lift = c.liftGoal;
    c.bump = Math.max(0, c.bump - dt * 1.6);
    c.mesh.scale.setScalar(1 + lift * (c.lift * 0.5 + Math.sin(c.bump * Math.PI) * 1.2));
    if (c.glow) c.base.emissive.setRGB(1, 1, 1).multiplyScalar(0.12 + 0.12 * Math.sin(clock * 6));
    else c.base.emissive.setRGB(0, 0, 0);
  }
  if (shown) {
    labelTimer -= dt;
    if (labelTimer <= 0) hideName();
  }
  placeLabels();
  renderer.render(scene, camera);
}

async function start() {
  resize();
  addEventListener('resize', resize);
  const t0 = performance.now();
  const [world, l, c, lv] = await Promise.all([
    fetch(`assets/world.json?v=${ASSET_V}`).then(r => r.json()),
    fetch('assets/lines.json', { cache: 'no-cache' }).then(r => r.json()),
    fetch('assets/voice/clips.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : { clips: {} })).catch(() => ({ clips: {} })),
    fetch('assets/levels.json', { cache: 'no-cache' }).then(r => r.json()),
  ]);
  lines = l; clips = c.clips; levels = lv;
  countries = world.countries.map(c => buildCountry(c, world.q));
  byName = Object.fromEntries(countries.map(c => [c.name, c]));
  coast = buildLines(world.coast, world.q, COAST, 0.7);
  border = buildLines(world.border, world.q, BORDER, 0.8);
  view.alt = globeAlt();
  $('loading').classList.add('done');
  const tris = countries.reduce((n, c) => n + c.tris, 0);
  console.info(`world: ${countries.length} countries, ${tris} triangles, built in ${Math.round(performance.now() - t0)} ms`);
  showScreens('start');
  requestAnimationFrame(frame);
  // everything a game can still ask for, for sw.js to fetch ahead so it all works offline (see index.html)
  const url = path => new URL(path, import.meta.url).href;
  window.wmFiles = [
    ...new Set(Object.values(clips).map(c => url(`assets/voice/${c.file}`))),
    ...new Set(countries.filter(c => c.flag).map(c => url(`assets/flags/${c.flag}.svg`))),
    url(FINALE),
  ];
}

/* ======== test hook ======== */
window.__wm = {
  view, flyTo, goView, goBox: name => goBox(byName[name].box),
  at: (lon, lat) => hitAt(lon, lat)?.c.name ?? null,
  near: (x, y) => pickAt(x, y)?.c.name ?? null, still: () => { idle = false; spin = { lon: 0, lat: 0 }; },
  tap: (x, y) => tap(x, y),
  // run the game for a while without animation frames (a hidden test page gets none)
  step: (seconds = 0, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) update(dt); update(0); return { ...view }; },
  // the same, letting the game's awaits run between steps
  run: async (seconds, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) { update(dt); await new Promise(r => setTimeout(r, 0)); } },
  flying: () => !!flight,
  said,   // the last lines said and whether a clip or the device's voice said them
  clipCount: () => Object.keys(clips).length,
  play: i => playLevel(i), goLevels, goLook, goStart,
  paint: name => { const c = byName[name]; return paintFlag(c, c.polys.map((p, k) => k), c.box, c.label); },   // a flag spreading over a country
  quiz: () => quiz && { level: levelIdx + 1, n: quiz.n, of: quiz.targets.length, target: quiz.target?.name, kind: quiz.target?.kind,
    q: quiz.target?.q, repeat: quiz.target?.repeat, parts: quiz.target?.parts?.length, wrong: quiz.wrong, busy: quiz.busy, firstTry: quiz.firstTry,
    plan: quiz.targets.map(t => `${t.q === 'flag' ? '🏳' : t.q === 'capital' ? '⭐' : ''}${t.name}${t.repeat ? '↺' : ''}`).join(' '),
    cards: [...cardsEl.children].map(b => b.dataset.name + (b.classList.contains('gone') ? ' (gone)' : '')) },
  // answer the current question: right, or wrong with a named country (on the map, or that country's flag card)
  answer: () => {
    const t = quiz.target;
    if (t.q === 'flag') return pickCard(t.c, cardsEl.querySelector(`[data-name="${CSS.escape(t.c.name)}"]`));
    answer(t.kind === 'continent' ? { c: t.members[0], part: 0, lon: t.members[0].label[0], lat: t.members[0].label[1] } : { c: t.c, part: t.parts[0], lon: t.at[0], lat: t.at[1] });
  },
  wrong: name => {
    if (quiz.target.q === 'flag') {
      const b = name ? cardsEl.querySelector(`[data-name="${CSS.escape(name)}"]`) : [...cardsEl.children].find(b => b.dataset.name !== quiz.target.c.name && !b.classList.contains('gone'));
      return pickCard(byName[b.dataset.name], b);
    }
    answer({ c: byName[name], part: 0, lon: byName[name].label[0], lat: byName[name].label[1] });
  },
  mode: () => mode, progress: () => ({ ...progress }), passport: () => passport.slice(), goPassport,
  finale: beat => startFinale(beat), finaleState: () => finale?.state(), push: theta => finale?.push(theta * Math.PI), endFinale,
  get countries() { return countries; },
};

start();
