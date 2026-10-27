// The seasons finale (PLAN.md section 8): a talking space scene after the last level. The game's own globe
// becomes the Earth, tipped over 23.4° and carried round the Sun, to show why summer and winter
// come: our half leans toward the Sun in summer and away in winter, and Australia has the opposite.
// Everything runs on the game clock, so __wm.step / __wm.run can play it silently in tests.

/* ======== tuning knobs ======== */
const TILT = 23.44;              // degrees, the Earth's real tilt
const ORBIT = 14;                // orbit radius, in Earth radii (nowhere near to scale, and nothing says it is)
const SUN_R = 3.4;               // the Sun's drawn radius
const EARTH_BIG = 2.2;           // the Earth's size while it goes round the Sun (it's drawn far too big, so its tilt shows)
const GHOST = 1.5;               // the four faint Earths at the seasons
const OBLIQUE = 22;              // degrees the year view looks down on the orbit: low, so the tilt shows side-on
const YEAR_SECONDS = 12;         // one trip round the Sun in beat 5
const SPIN = 0.9;                // radians a second the Earth turns while it isn't held to face the Sun
const SEASON_WORD_GAP = 1.4;     // seconds between season words while the child drags the Earth
const STARS = 1400;
const CITIES = [[21, 52.2], [2.3, 48.9], [-0.1, 51.5], [13.4, 52.5], [12.5, 41.9], [-3.7, 40.4], [37.6, 55.8], [-74, 40.7],
  [-118.2, 34], [-87.6, 41.9], [-43.2, -22.9], [-58.4, -34.6], [139.7, 35.7], [116.4, 39.9], [121.5, 31.2], [77.2, 28.6],
  [72.9, 19.1], [151.2, -33.9], [144.9, -37.8], [31.2, 30], [3.4, 6.5], [28, -26.2], [-99.1, 19.4], [100.5, 13.8], [106.8, -6.2]];

const D2R = Math.PI / 180;
const ease = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// the Earth's place on its orbit: theta 0 is December (our half leans away), π is June
const SEASONS = ['winter', 'spring', 'summer', 'fall'];
const SEASON_ICON = { winter: '❄️⛄', spring: '🌸', summer: '☀️🍦', fall: '🍂' };

export function createFinale(api) {
  const { THREE, scene, camera, globe, headlight, ambient, dirOf } = api;

  /* ======== the solar system ======== */
  const sys = new THREE.Group();          // the Sun sits at its origin
  const tiltG = new THREE.Group();        // the Earth's place on the orbit, tipped over; it never turns
  sys.add(tiltG);
  const light = new THREE.PointLight(0xffffff, 3.2, 0, 0);
  sys.add(light);

  const canvasTex = (size, draw) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const emojiTex = e => canvasTex(64, (g, s) => {
    g.font = `${s * 0.78}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(e, s / 2, s * 0.55);
  });
  const sprite = (map, size, order, blending = THREE.NormalBlending) => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending }));
    m.scale.setScalar(size);
    m.renderOrder = order;
    return m;
  };

  // the Sun: a ball of churning glowing gas, darker towards its edge, in a soft halo
  const sunG = new THREE.Group();
  sys.add(sunG);
  const sunMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main() { vN = normalize(normalMatrix * normal); vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float time; varying vec3 vN; varying vec3 vP; varying vec3 vV;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 p = normalize(vP) * 3.0;
        float g = fbm(p * 2.2 + vec3(0.0, time * 0.05, time * 0.03));          // big slow cells
        float f = fbm(p * 9.0 - vec3(time * 0.12, 0.0, time * 0.08));          // fine grain
        float mu = clamp(dot(vN, vV), 0.0, 1.0);
        float limb = pow(mu, 0.45);                                            // the edge is darker and redder
        vec3 hot = vec3(1.0, 0.86, 0.42), warm = vec3(1.0, 0.56, 0.08), edge = vec3(0.78, 0.22, 0.02);
        vec3 c = mix(edge, mix(warm, hot, limb), limb);
        c *= 0.86 + 0.36 * g + 0.22 * (f - 0.5);
        gl_FragColor = vec4(c, 1.0);   // already in screen colours
      }`,
  });
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 96, 48), sunMat);
  sunG.add(sunBall);
  // the halo: a glow shell round the ball and a wide, faint sprite behind it
  sunG.add(new THREE.Mesh(new THREE.SphereGeometry(SUN_R * 1.25, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vN; void main(){ float i = pow(clamp(0.75 - dot(vN, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.0); gl_FragColor = vec4(1.0, 0.5, 0.1, 1.0) * i * 0.7; }',
  })));
  const halo = sprite(canvasTex(256, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,220,140,.55)'); r.addColorStop(0.3, 'rgba(255,170,60,.18)'); r.addColorStop(1, 'rgba(255,140,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  }), SUN_R * 7, 1, THREE.AdditiveBlending);
  sunG.add(halo);

  // stars everywhere, and the North Star where the Earth's axis points
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(STARS * 3), v = new THREE.Vector3();
  for (let i = 0; i < STARS; i++) { v.randomDirection().multiplyScalar(220); v.toArray(sp, i * 3); }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0 }));
  sys.add(stars);
  const axisDir = new THREE.Vector3(Math.sin(TILT * D2R), Math.cos(TILT * D2R), 0);
  const northStar = sprite(canvasTex(128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,250,200,.9)'); r.addColorStop(1, 'rgba(255,240,150,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
    g.fillStyle = '#fff'; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, l = i % 2 ? 10 : 60; g.lineTo(s / 2 + Math.sin(a) * l, s / 2 - Math.cos(a) * l); }
    g.fill();
  }), 16, 4, THREE.AdditiveBlending);
  northStar.position.copy(axisDir).multiplyScalar(150);
  sys.add(northStar);

  // the axis: a stick through the poles, and a dotted line from its top towards the North Star
  const axis = new THREE.Group();
  const stickMat = new THREE.MeshBasicMaterial({ color: '#ff5a5f', transparent: true });
  axis.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 12), stickMat));
  for (const y of [1.7, -1.7]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 8), stickMat); k.position.y = y; axis.add(k); }
  const starLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 40, 0)]),
    new THREE.LineDashedMaterial({ color: '#fff6b0', dashSize: 0.4, gapSize: 0.3, transparent: true }));
  starLine.computeLineDistances();
  axis.add(starLine);
  tiltG.add(axis);

  // the orbit, drawn as a circle on purpose (an oval would suggest distance makes the seasons)
  const ring = [];
  for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; ring.push(new THREE.Vector3(ORBIT * Math.cos(a), 0, -ORBIT * Math.sin(a))); }
  const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring),
    new THREE.LineDashedMaterial({ color: '#cfe3ff', dashSize: 0.5, gapSize: 0.4, transparent: true, opacity: 0 }));
  orbit.computeLineDistances();
  sys.add(orbit);

  // sunbeam to a place, and the patch of light it makes there (wider and paler when it comes in slanted)
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true), beamMat);
  sys.add(beam);
  const spotMat = new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const spot = new THREE.Mesh(new THREE.CircleGeometry(1, 40), spotMat);
  sys.add(spot);

  // four faint Earths at December, March, June and September, all tipped the same way: the classic seasons
  // picture. Each is lit by the Sun, so it shows which half has day.
  const ghosts = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const ball = new THREE.MeshLambertMaterial({ color: '#5b9be0', transparent: true, opacity: 0 });
    const stick = new THREE.MeshBasicMaterial({ color: '#ff5a5f', transparent: true, opacity: 0 });
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), ball));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 10), stick));
    g.rotation.z = -TILT * D2R;
    g.scale.setScalar(GHOST);
    g.userData = { ball, stick, theta: i * Math.PI / 2 };
    sys.add(g);
    ghosts.push(g);
  }

  // city lights on the night side
  const cityGeo = new THREE.BufferGeometry();
  const cp = new Float32Array(CITIES.length * 3), cc = new Float32Array(CITIES.length * 3);
  CITIES.forEach(([lon, lat], i) => dirOf(lon, lat, v).multiplyScalar(1.004).toArray(cp, i * 3));
  cityGeo.setAttribute('position', new THREE.BufferAttribute(cp, 3));
  cityGeo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const cities = new THREE.Points(cityGeo, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));

  // snow, blossom and leaves drifting down onto a place (they turn with the Earth)
  const N_FLAKES = 70;
  const flakes = {};
  for (const [kind, e] of [['snow', '❄️'], ['petals', '🌸'], ['leaves', '🍂']]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_FLAKES * 3), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: emojiTex(e), size: 0.07, transparent: true, depthWrite: false, opacity: 0 }));
    pts.userData = { lon: new Float32Array(N_FLAKES), lat: new Float32Array(N_FLAKES), r: new Float32Array(N_FLAKES), on: 0 };
    flakes[kind] = pts;
  }
  const scatter = (pts, lon, lat, all) => {
    const u = pts.userData;
    for (let i = 0; i < N_FLAKES; i++) {
      if (!all && u.r[i] > 1.006) continue;
      u.lon[i] = lon + (Math.random() - 0.5) * 22; u.lat[i] = lat + (Math.random() - 0.5) * 12;
      u.r[i] = 1.01 + Math.random() * (all ? 0.12 : 0.02) + (all ? 0 : 0.1);
    }
  };

  /* ======== why slanted sunshine is colder: a picture card ======== */
  // The Sun on an arc shines a band of parallel rays (always the same width, so the same amount of light) onto
  // the ground. High up, the band lands on a small bright patch; low down it spreads over a long pale one. A
  // thermometer and a face follow. The child can drag the Sun once the narrator has explained it.
  const sunPanel = document.createElement('div');
  sunPanel.id = 'sunpanel';
  sunPanel.innerHTML = `<svg viewBox="0 0 400 300" aria-label="Sunshine high and low">
    <defs><clipPath id="spclip"><rect width="400" height="300" rx="24"/></clipPath>
      <linearGradient id="spsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc7ff"/><stop offset="1" stop-color="#e2f5ff"/></linearGradient></defs>
    <g clip-path="url(#spclip)">
      <rect width="400" height="300" fill="url(#spsky)"/>
      <path id="spband" fill="#ffe066" fill-opacity=".38"/>
      <g id="sprays" stroke="#ffb400" stroke-width="3.5" stroke-linecap="round"></g>
      <rect y="240" width="400" height="60" fill="#79c267"/>
      <rect id="sppatch" y="234" height="10" rx="5" fill="#fff36b"/>
      <text id="spface" x="200" y="226" font-size="36" text-anchor="middle">🙂</text>
      <circle id="spsun" r="24" fill="#ffd23f" stroke="#ff9f1a" stroke-width="5"/>
      <rect x="352" y="52" width="26" height="170" rx="13" fill="#fff" stroke="#3b4366" stroke-width="3"/>
      <rect id="spmerc" x="359" width="12" rx="6"/>
      <circle id="spbulb" cx="365" cy="230" r="19" stroke="#3b4366" stroke-width="3"/>
    </g></svg>`;
  const spEl = id => sunPanel.querySelector(`#${id}`);
  const rayGroup = spEl('sprays');
  for (let i = 0; i < 5; i++) rayGroup.append(document.createElementNS('http://www.w3.org/2000/svg', 'line'));
  const BAND = 64, GROUND = 240, REACH = 175;   // band width, ground line, the Sun's distance (svg units)
  function drawPanel(elev) {
    const r = clamp(elev, 6, 90) * D2R, cx = Math.cos(r), sy = Math.sin(r);
    const w = Math.min(BAND / sy, 520), gl = 200 - w / 2, gr = 200 + w / 2;
    spEl('spband').setAttribute('d', `M${gl} ${GROUND}L${gr} ${GROUND}L${gr - cx * REACH} ${GROUND - sy * REACH}L${gl - cx * REACH} ${GROUND - sy * REACH}Z`);
    [...rayGroup.children].forEach((l, i) => {
      const gx = gl + (i + 0.5) / 5 * w;
      l.setAttribute('x1', gx - cx * REACH * 0.92); l.setAttribute('y1', GROUND - sy * REACH * 0.92);
      l.setAttribute('x2', gx); l.setAttribute('y2', GROUND);
    });
    const sun = spEl('spsun');
    sun.setAttribute('cx', 200 - cx * REACH); sun.setAttribute('cy', GROUND - sy * REACH);
    const patch = spEl('sppatch');
    patch.setAttribute('x', gl); patch.setAttribute('width', w);
    patch.setAttribute('fill-opacity', 0.25 + 0.75 * sy);   // the same light over more ground is paler
    const warm = Math.pow(sy, 1.2), h = 18 + 140 * warm;
    const merc = spEl('spmerc');
    merc.setAttribute('y', 222 - h); merc.setAttribute('height', h + 8);
    const col = `rgb(${Math.round(70 + 185 * warm)},${Math.round(150 - 70 * warm)},${Math.round(255 - 190 * warm)})`;
    merc.setAttribute('fill', col); spEl('spbulb').setAttribute('fill', col);
    spEl('spface').textContent = sy > 0.75 ? '😎' : sy > 0.45 ? '🙂' : '🥶';
  }
  // dragging the Sun along its arc
  let panelDrag = false, dragging = false;
  const elevAt = e => {
    const svg = sunPanel.querySelector('svg'), pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return clamp(Math.atan2(GROUND - p.y, 200 - p.x) / D2R, 6, 90);
  };
  sunPanel.addEventListener('pointerdown', e => {
    if (!panelDrag) return;
    dragging = true;
    sunPanel.setPointerCapture(e.pointerId);
    to({ elev: elevAt(e) }, 0);
  });
  sunPanel.addEventListener('pointermove', e => { if (dragging) to({ elev: elevAt(e) }, 0); });
  sunPanel.addEventListener('pointerup', () => { dragging = false; });
  sunPanel.addEventListener('pointercancel', () => { dragging = false; });

  /* ======== labels over 3D points ======== */
  const layer = document.createElement('div');
  layer.id = 'finale';
  const bar = document.createElement('div');
  bar.id = 'finbar';
  bar.innerHTML = '<button id="finskip" aria-label="Next">⏭</button>';
  const endEl = document.createElement('div');
  endEl.id = 'finend';
  endEl.innerHTML = '<div class="medal">🏅</div><div class="row"><button id="finagain" aria-label="Watch again">↺</button>' +
    '<button id="finout" class="go" aria-label="All trips">🗺️</button></div>';
  const labels = {};
  const label = (key, html, cls = '') => {
    const el = document.createElement('div');
    el.className = `flabel ${cls}`;
    el.innerHTML = html;
    layer.append(el);
    labels[key] = { el, on: false };
    return labels[key];
  };
  const home = api.byName[api.HOME].label, aus = api.byName.Australia.label;
  label('house', '🏠');
  label('daynight', '☀️', 'small');
  label('summer', '🏖️🍦');
  label('winter', '⛄');
  label('aus', '🦘😎<br>🎅🏖️');
  label('season', '', 'big');
  label('hand', '👆', 'hand');
  for (const s of SEASONS) label(`sign-${s}`, SEASON_ICON[s], 'sign');
  const show = (key, on) => { labels[key].on = on; };

  /* ======== state, tweens and the camera ======== */
  const st = { theta: 0.75 * Math.PI, tilt: 0, sun: 0, stars: 0, axis: 0, orbit: 0, beam: 0, spin: SPIN, face: null, beamTo: home, signs: 0, size: 1, ghosts: 0, elev: 62 };
  let tweens = [], spinAngle = 0, t = 0, running = false, token = 0, beat = 0;
  let rig = null, rigFrom = null, rigK = 1, rigSecs = 1, drag = null, reached = new Set(), lastWord = -9, lastSeason = null;

  function to(target, secs = 1.2) {
    for (const [k, val] of Object.entries(target)) {
      if (typeof val !== 'number' || secs <= 0) { st[k] = val; tweens = tweens.filter(w => w.k !== k); continue; }
      tweens = tweens.filter(w => w.k !== k);
      tweens.push({ k, a: st[k], b: val, t: 0, secs });
    }
  }
  // the same place on the orbit, but ahead of the Earth, so it never travels backwards round the Sun
  const ahead = a => a + 2 * Math.PI * Math.ceil((st.theta - a) / (2 * Math.PI) - 1e-6);
  const earthPos = (theta = st.theta, out = new THREE.Vector3()) => out.set(ORBIT * Math.cos(theta), 0, -ORBIT * Math.sin(theta));
  const up = new THREE.Vector3(0, 1, 0);
  const halfFov = () => { const vf = camera.fov / 2 * D2R; return Math.min(vf, Math.atan(Math.tan(vf) * camera.aspect)); };

  // camera rigs: functions giving where the camera is and what it looks at, re-read every frame
  const RIGS = {
    close: () => { const E = earthPos(); const d = E.clone().normalize(); return { pos: E.clone().addScaledVector(d, 3.2).addScaledVector(up, 0.8), look: E }; },
    both: () => {
      const E = earthPos(), M = E.clone().multiplyScalar(0.5), side = new THREE.Vector3().crossVectors(E, up).normalize();
      const d = (ORBIT / 2 + SUN_R + 2) / Math.tan(halfFov());
      return { pos: M.clone().addScaledVector(side, d * 0.95).addScaledVector(up, d * 0.3), look: M };
    },
    profile: () => { const E = earthPos(); return { pos: E.clone().add(new THREE.Vector3(0.4, 0.5, 4.4)), look: E }; },   // the tilt seen side-on
    side: () => {   // day on one side, night on the other
      const E = earthPos(), side = new THREE.Vector3().crossVectors(E, up).normalize();
      return { pos: E.clone().addScaledVector(side, 3.6).addScaledVector(up, 0.9), look: E };
    },
    above: () => { const h = (ORBIT + 3) / Math.tan(halfFov()); return { pos: new THREE.Vector3(0, h * 0.95, h * 0.45), look: new THREE.Vector3() }; },
    oblique: () => {   // the textbook view: from the side and a little above, so every Earth's tilt leans the same way on screen
      const d = (ORBIT + EARTH_BIG * 1.5 + 1) / Math.tan(halfFov()), e = OBLIQUE * D2R;
      return { pos: new THREE.Vector3(0, d * Math.sin(e), d * Math.cos(e)), look: new THREE.Vector3(0, -1.5, 0) };
    },
    lean: (south = false) => () => {   // between the Sun and the Earth, a bit above (or below), to see a half lean in or out
      const E = earthPos(), toSun = E.clone().negate().normalize(), side = new THREE.Vector3().crossVectors(toSun, up).normalize();
      return { pos: E.clone().addScaledVector(toSun, 3.3).addScaledVector(up, south ? -1.5 : 1.5).addScaledVector(side, 1.6), look: E };
    },
  };
  function cam(r, secs = 2) {
    rigFrom = { pos: camera.position.clone(), look: camLook.clone() };
    rig = r; rigK = secs > 0 ? 0 : 1; rigSecs = secs;
  }
  const camLook = new THREE.Vector3();

  /* ======== talking and waiting ======== */
  const alive = k => running && k === token;
  async function talk(key, k) {
    if (!alive(k)) return;
    await api.say(api.lines.finale[key]);
  }
  async function wait(s, k) {
    const until = t + s;
    while (alive(k) && t < until) await api.sleep(Math.min(0.25, until - t));
  }

  /* ======== the beats ======== */
  const BEATS = [
    async k => {   // 1: up into space
      to({ sun: 0, stars: 1, tilt: 0, axis: 0, orbit: 0, beam: 0, signs: 0, spin: SPIN, face: null }, 2);
      cam(RIGS.close, 3);
      await talk('up', k);
      await wait(1, k);
    },
    async k => {   // 2: the Sun
      to({ sun: 1, stars: 1 }, 2.5);
      cam(RIGS.both, 3);
      await wait(1.5, k);
      await talk('sun', k);
      await wait(0.6, k);
    },
    async k => {   // 3: day and night
      to({ sun: 1, spin: SPIN * 0.8, face: null }, 1);
      cam(RIGS.side, 2.5);
      show('house', true); show('daynight', true);
      await talk('spin', k);
      await talk('day', k);
      await talk('night', k);
      await wait(2.5, k);
      show('daynight', false);
    },
    async k => {   // 4: the tilt, and the North Star
      to({ spin: SPIN * 0.5 }, 1);
      cam(RIGS.profile, 2);
      to({ axis: 1 }, 1);
      await wait(1, k);
      to({ tilt: 1 }, 2.5);
      await talk('tilt', k);
      await talk('star', k);
      await wait(1, k);
    },
    async k => {   // 5: a year round the Sun
      to({ axis: 1, tilt: 1, sun: 1, orbit: 1, signs: 1, spin: SPIN * 0.6, size: EARTH_BIG, ghosts: 1 }, 2.5);
      cam(RIGS.oblique, 3);
      await wait(2, k);
      talk('year', k);
      to({ theta: st.theta + 2 * Math.PI }, YEAR_SECONDS);
      await wait(YEAR_SECONDS, k);
    },
    async k => {   // 6: summer
      to({ theta: ahead(Math.PI), axis: 1, tilt: 1, orbit: 1, signs: 0, face: home, beamTo: home, size: 1, ghosts: 0 }, 3);
      cam(RIGS.lean(), 3);
      await wait(3, k);
      to({ beam: 1 }, 1);
      show('summer', true);
      await talk('summer1', k);
      await talk('summer2', k);
      await wait(1.5, k);
      show('summer', false);
    },
    async k => {   // 7: winter
      to({ beam: 0 }, 0.6);
      to({ theta: ahead(0), face: home, beamTo: home, signs: 0, size: 1, ghosts: 0 }, 4);
      cam(RIGS.lean(), 4);
      await wait(4, k);
      to({ beam: 1 }, 1);
      flakes.snow.userData.on = 1; scatter(flakes.snow, home[0], home[1], true);
      show('winter', true);
      await talk('winter1', k);
      await talk('winter2', k);
      await talk('winter3', k);
      await wait(1.5, k);
    },
    async k => {   // 8: why: high sunshine lands on a small spot, low sunshine spreads out
      to({ beam: 0, elev: 75 }, 0.6);
      sunPanel.classList.add('on');
      await talk('why', k);
      to({ elev: 62 }, 1.2);   // Poland's noon Sun in June
      await talk('high', k);
      await wait(0.6, k);
      to({ elev: 15 }, 3);     // and in December
      await wait(1.5, k);
      await talk('low', k);
      await wait(0.8, k);
      panelDrag = true;
      await talk('move', k);
      await wait(9, k);
      panelDrag = false;
    },
    async k => {   // 9: summer in Australia
      to({ theta: ahead(0), face: aus, beamTo: aus, beam: 1, size: 1, ghosts: 0 }, 2);
      cam(RIGS.lean(true), 2.5);
      await wait(2.5, k);
      show('aus', true);
      await talk('australia', k);
      await wait(2, k);
      show('aus', false);
    },
    async k => {   // 10: spring and fall
      to({ beam: 0, face: null, spin: SPIN * 0.6, signs: 1, size: EARTH_BIG, ghosts: 1 }, 1.5);
      cam(RIGS.oblique, 2.5);
      to({ theta: ahead(Math.PI / 2) }, 3);
      flakes.petals.userData.on = 1; scatter(flakes.petals, home[0], home[1], true);
      await talk('between', k);
      await wait(1.5, k);
      flakes.petals.userData.on = 0;
      to({ theta: ahead(1.5 * Math.PI) }, 3);
      flakes.leaves.userData.on = 1; scatter(flakes.leaves, home[0], home[1], true);
      await wait(3.5, k);
      flakes.leaves.userData.on = 0;
    },
    async k => {   // 11: the child pushes the Earth round
      to({ beam: 0, face: null, spin: SPIN * 0.6, signs: 1, orbit: 1, axis: 1, tilt: 1, size: EARTH_BIG, ghosts: 1 }, 1);
      cam(RIGS.oblique, 2);
      reached = new Set(); lastSeason = null;
      drag = { on: true, used: false };
      show('season', true); show('hand', true);
      await talk('try', k);
      while (alive(k) && reached.size < 4) {
        const since = t;
        await wait(10, k);
        if (alive(k) && drag && (!drag.moved || drag.lastMove < since)) talk('push', k);
      }
      await wait(1.5, k);
      drag = null;
      show('season', false); show('hand', false);
    },
    async k => {   // 12: well done
      drag = null;
      to({ signs: 0, spin: SPIN * 0.5, size: EARTH_BIG, ghosts: 1 }, 1);
      cam(RIGS.oblique, 2.5);
      api.medal();
      endEl.classList.add('on');
      confetti();
      api.sfx('end');
      await talk('end1', k);
      await talk('end2', k);
    },
  ];

  function confetti() {
    for (let i = 0; i < 26; i++) {
      const el = document.createElement('i');
      el.className = 'confetti';
      el.textContent = ['⭐', '🎉', '🌍', '✨', '🌸', '❄️', '☀️', '🍂'][i % 8];
      el.style.left = `${Math.random() * 100}%`;
      el.style.animationDelay = `${Math.random() * 0.8}s`;
      el.style.fontSize = `${20 + Math.random() * 22}px`;
      layer.append(el);
      setTimeout(() => el.remove(), 4000);
    }
  }

  // what any beat may have left on (a skipped beat never reaches its own clean-up); each beat sets up its own
  function tidy() {
    for (const [key, l] of Object.entries(labels)) if (key !== 'house' && !key.startsWith('sign-')) l.on = false;
    for (const p of Object.values(flakes)) p.userData.on = 0;
    drag = null;
    panelDrag = false;
    sunPanel.classList.remove('on');
    endEl.classList.remove('on');
  }

  async function play(from) {
    const k = ++token;
    for (beat = from; beat < BEATS.length; beat++) {
      if (!alive(k)) return;
      tidy();
      bar.hidden = beat >= BEATS.length - 1;   // nothing to skip to from the ending
      window.tbxEvent?.('finale', { beat: beat + 1 });
      await BEATS[beat](k);
      if (!alive(k)) return;
    }
  }

  /* ======== starting, stopping, the frame ======== */
  function start(from = 0) {
    const was = running;
    running = true;
    t = 0;
    // the globe moves into the solar system without a jump: the camera keeps where it was relative to it
    const E = earthPos();
    sys.position.set(0, 0, 0);
    const camRel = was ? new THREE.Vector3(0, 0, 3) : camera.position.clone();
    scene.add(sys);
    tiltG.position.copy(E);
    tiltG.add(globe);
    globe.add(cities);
    for (const p of Object.values(flakes)) globe.add(p);
    camera.position.copy(E).add(camRel);
    camLook.copy(E);
    camera.near = 0.02; camera.far = 600; camera.updateProjectionMatrix();
    spinAngle = 0;
    rig = null; rigK = 1;
    document.body.append(layer, bar, endEl, sunPanel);
    endEl.classList.remove('on');
    for (const l of Object.values(labels)) l.on = false;
    if (from > 0) {   // jumping in: the state the beats before would have left
      Object.assign(st, { sun: 1, stars: 1, tilt: from > 3 ? 1 : 0, axis: from > 3 ? 1 : 0, orbit: from > 4 ? 1 : 0, size: 1, ghosts: 0 });
      cam(RIGS.both, 0);
    }
    update(0);
    play(from);
  }

  function stop() {
    running = false;
    token++;
    drag = null;
    scene.remove(sys);
    globe.removeFromParent();
    globe.remove(cities);
    for (const p of Object.values(flakes)) globe.remove(p);
    scene.add(globe);
    globe.position.set(0, 0, 0);
    globe.rotation.set(0, 0, 0);
    headlight.visible = true;
    headlight.intensity = 1.4;
    ambient.color.set('#ffffff'); ambient.intensity = api.ambientIntensity;
    layer.remove(); bar.remove(); endEl.remove(); sunPanel.remove();
    sunPanel.classList.remove('on');
  }

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), q = new THREE.Quaternion(), nightBlue = new THREE.Color('#5a6ab0');

  function worldOf(lon, lat, r = 1.02, out = new THREE.Vector3()) {
    return globe.localToWorld(dirOf(lon, lat, out).multiplyScalar(r));
  }
  function place(key, p, visible) {
    const l = labels[key];
    const s = p.clone().project(camera);
    const on = l.on && visible && s.z < 1 && Math.abs(s.x) < 1.2 && Math.abs(s.y) < 1.2;
    l.el.style.transform = `translate(${(s.x + 1) / 2 * innerWidth}px, ${(1 - s.y) / 2 * innerHeight}px) translate(-50%, -50%)`;
    l.el.classList.toggle('on', on);
  }
  const facing = p => {   // is a point on the Earth's surface turned towards the camera?
    const n = tmp2.copy(p).sub(tiltG.position).normalize();
    return n.dot(tmp.copy(camera.position).sub(p).normalize()) > 0.1;
  };
  const seasonAt = theta => SEASONS[((Math.round(theta / (Math.PI / 2)) % 4) + 4) % 4];

  function update(dt) {
    if (!running) return;
    t += dt;
    for (const w of tweens) {
      w.t = Math.min(1, w.t + dt / w.secs);
      st[w.k] = w.a + (w.b - w.a) * ease(w.t);
    }
    tweens = tweens.filter(w => w.t < 1);

    // where the Earth is, how it leans, how it turns
    const E = earthPos(st.theta, tiltG.position);
    tiltG.rotation.z = -TILT * D2R * st.tilt;
    tiltG.scale.setScalar(st.size);
    for (const g of ghosts) {   // faint, and gone where the real Earth is
      earthPos(g.userData.theta, g.position);
      const near = clamp((g.position.distanceTo(E) - 2 * st.size) / (2 * st.size), 0, 1);
      g.userData.ball.opacity = 0.6 * st.ghosts * near;
      g.userData.stick.opacity = 0.9 * st.ghosts * near;
      g.visible = st.ghosts * near > 0.01;
    }
    if (st.face) {   // turn so a place faces the Sun
      const toSun = tmp.copy(E).negate().normalize();
      tiltG.updateMatrixWorld();
      const local = toSun.applyQuaternion(q.copy(tiltG.quaternion).invert());
      const want = Math.atan2(local.x, local.z) - st.face[0] * D2R;
      let d = ((want - spinAngle) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      spinAngle += d * Math.min(1, dt * 2.5);
    } else spinAngle += st.spin * dt;
    globe.rotation.set(0, spinAngle, 0);
    sys.updateMatrixWorld(true);

    // the Sun, the sky, the stick, the orbit
    sunG.scale.setScalar(Math.max(0.001, st.sun));
    sunMat.uniforms.time.value = t;
    sunBall.rotation.y += dt * 0.03;
    halo.material.opacity = 0.85 + 0.15 * Math.sin(t * 0.8);
    stars.material.opacity = st.stars;
    northStar.material.opacity = st.axis;
    northStar.scale.setScalar(14 + Math.sin(t * 3) * 2);
    axis.visible = st.axis > 0.01;
    axis.scale.setScalar(Math.max(0.001, st.axis));
    stickMat.opacity = st.axis;
    starLine.material.opacity = st.axis * st.tilt;
    orbit.material.opacity = st.orbit * 0.7;
    // until the Sun is there the Earth is lit as in the game; then the light comes from the Sun, with a dim blue night side
    light.intensity = 4.2 * st.sun;
    headlight.visible = st.sun < 0.999;
    headlight.intensity = 1.4 * (1 - st.sun);
    ambient.intensity = api.ambientIntensity + (0.75 - api.ambientIntensity) * st.sun;
    ambient.color.setRGB(1, 1, 1).lerp(nightBlue, st.sun);

    // the sunbeam to a place and the light it spreads there
    const P = worldOf(st.beamTo[0], st.beamTo[1], 1.0, new THREE.Vector3());
    const n = P.clone().sub(E).normalize();
    const toSunP = P.clone().negate().normalize();
    const cos = n.dot(toSunP);
    const lit = st.beam * clamp(cos * 1.5, 0, 1);
    beamMat.opacity = 0.22 * lit;
    const len = P.length();
    beam.position.copy(P).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(up, toSunP.clone().negate());
    beam.scale.set(0.12 * st.size, len, 0.12 * st.size);
    beam.visible = lit > 0.01;
    spot.visible = lit > 0.01;
    if (spot.visible) {   // stretched along the slant: the same light over more ground
      const slant = toSunP.clone().addScaledVector(n, -cos).normalize();
      const bi = new THREE.Vector3().crossVectors(n, slant);
      spot.position.copy(P).addScaledVector(n, 0.012);
      spot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(slant, bi, n));
      spot.scale.set(0.12 * st.size / Math.max(cos, 0.25), 0.12 * st.size, 1);
      spotMat.opacity = 0.75 * clamp(cos, 0, 1) * st.beam;
    }

    // city lights where it's night
    for (let i = 0; i < CITIES.length; i++) {
      worldOf(CITIES[i][0], CITIES[i][1], 1, tmp);
      tmp2.copy(tmp).sub(E).normalize();                               // the ground's up
      const night = clamp(tmp2.dot(tmp.normalize()) * 4, 0, 1);       // facing away from the Sun at the origin
      const tw = 0.75 + 0.25 * Math.sin(t * 5 + i);
      cc[i * 3] = night * tw; cc[i * 3 + 1] = night * 0.85 * tw; cc[i * 3 + 2] = night * 0.4 * tw;
    }
    cityGeo.attributes.color.needsUpdate = true;

    // falling snow, blossom, leaves
    for (const pts of Object.values(flakes)) {
      const u = pts.userData;
      pts.material.opacity += ((u.on ? 1 : 0) - pts.material.opacity) * Math.min(1, dt * 3);
      pts.visible = pts.material.opacity > 0.02;
      if (!pts.visible) continue;
      const pos = pts.geometry.attributes.position;
      for (let i = 0; i < N_FLAKES; i++) {
        u.r[i] -= dt * 0.03;
        u.lon[i] += dt * 2 * Math.sin(t + i);
        if (u.r[i] < 1.006 && u.on) scatter(pts, st.beamTo[0], st.beamTo[1], false);
        dirOf(u.lon[i], u.lat[i], tmp).multiplyScalar(Math.max(u.r[i], 1.004)).toArray(pos.array, i * 3);
      }
      pos.needsUpdate = true;
    }

    // the camera glides from where it was to the current rig
    if (rig) {
      rigK = rigSecs > 0 ? Math.min(1, rigK + dt / rigSecs) : 1;
      const r = rig(), k = ease(rigK);
      camera.position.lerpVectors(rigFrom.pos, r.pos, k);
      camLook.lerpVectors(rigFrom.look, r.look, k);
    }
    camera.up.set(0, 1, 0);
    camera.lookAt(camLook);
    // the near plane sits just in front of the nearest thing in view, so depth stays fine enough to keep the
    // land on top of the ocean (a fixed near of 0.02 with the stars 600 away made the land speckle)
    let nearest = camera.position.distanceTo(E) - 1.8 * st.size;
    for (const g of ghosts) if (g.visible) nearest = Math.min(nearest, camera.position.distanceTo(g.position) - 1.8 * GHOST);
    nearest = Math.min(nearest, camera.position.length() - SUN_R * 1.3);
    camera.near = clamp(nearest * 0.5, 0.02, 40);
    camera.far = 600;
    camera.updateProjectionMatrix();

    if (sunPanel.classList.contains('on')) drawPanel(st.elev);

    // labels
    const hp = worldOf(home[0], home[1], 1.03, new THREE.Vector3());
    place('house', hp, facing(hp));
    const day = hp.clone().sub(E).normalize().dot(hp.clone().negate().normalize()) > 0;
    labels.daynight.el.textContent = day ? '☀️' : '🌙⭐';
    place('daynight', worldOf(home[0], home[1] + 9, 1.18, new THREE.Vector3()), true);
    place('summer', worldOf(home[0] + 12, home[1] - 6, 1.05, new THREE.Vector3()), facing(hp));
    place('winter', worldOf(home[0] + 12, home[1] - 6, 1.05, new THREE.Vector3()), facing(hp));
    const ap = worldOf(aus[0], aus[1], 1.05, new THREE.Vector3());
    place('aus', ap, facing(ap));
    const here = seasonAt(st.theta);
    labels.season.el.textContent = `🏠 ${SEASON_ICON[here]}`;
    labels.season.el.classList.toggle('on', labels.season.on);   // pinned to the top of the screen (styles.css)
    place('hand', E.clone().add(new THREE.Vector3(0, 0, 0)).addScaledVector(new THREE.Vector3(-Math.sin(st.theta), 0, -Math.cos(st.theta)), 2.6), true);
    for (const [i, s] of SEASONS.entries()) {
      labels[`sign-${s}`].on = st.signs > 0.5;
      place(`sign-${s}`, earthPos(i * Math.PI / 2).add(new THREE.Vector3(0, -GHOST * 2.4, 0)), true);   // under each faint Earth
    }

    // the child's turn: a new season says its name
    if (drag && here !== lastSeason) {
      lastSeason = here;
      if (drag.used) {
        if (!reached.has(here) || t - lastWord > SEASON_WORD_GAP) { api.say(api.lines.finale[here]); lastWord = t; }
        reached.add(here);
      }
    }
  }

  /* ======== pushing the Earth ======== */
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function pointer(type, x, y) {
    if (!drag?.on) return false;
    ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
    if (!ray.ray.intersectPlane(plane, hit)) return true;
    const ang = Math.atan2(-hit.z, hit.x);
    if (type === 'down') drag.grab = hit.distanceTo(tiltG.position) < 4.5 || drag.used;
    if (type === 'move' && drag.grab) {
      let d = ((ang - st.theta) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      to({ theta: st.theta + d }, 0);
      drag.used = drag.moved = true;
      drag.lastMove = t;
      show('hand', false);
    }
    if (type === 'up') drag.grab = false;
    return true;
  }

  bar.querySelector('#finskip').addEventListener('click', () => { api.stopVoice(); play(Math.min(beat + 1, BEATS.length - 1)); });
  endEl.querySelector('#finagain').addEventListener('click', () => { endEl.classList.remove('on'); api.stopVoice(); start(0); });
  endEl.querySelector('#finout').addEventListener('click', () => api.exit());

  return {
    start, stop, update, pointer,
    get beat() { return beat + 1; },
    state: () => ({ beat: beat + 1, theta: st.theta / Math.PI, tilt: st.tilt, sun: st.sun, beam: st.beam, reached: [...reached], season: seasonAt(st.theta) }),
    push: theta => { if (drag) { drag.used = drag.moved = true; drag.lastMove = t; to({ theta }, 0); } },   // for tests
  };
}
