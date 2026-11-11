// 3D konfigurátor chaty: rozměry + volby -> model (three.js) a cena z podrobného rozpočtu.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Interně se počítá z rozpočtového modelu (chata-model.js); na veřejném webu je jen tabulka
// předpočítaných výsledků (chata-ceny.js, tools/export-chata-ceny.js) bez jednotkových cen.
const MODEL = window.CHATA_MODEL;
function calc(st) {
  if (MODEL) return window.ChataRozpocet.compute(MODEL, st);
  const C = window.CHATA_CENY, row = C.data[[st.W, st.L, st.exp, st.bal, st.fas].join('|')];
  const v = Object.fromEntries(C.geom.map((k, i) => [k, row[i + 2]]));
  return { v, openings: C.openings, bezDph: row[0], sDph: row[1], chapters: null };
}

// ------------------------------------------------------------------ volby
const OPTS = [
  { key: 'W', group: 'dims', label: 'Šířka štítu', unit: 'm', values: [6, 6.5, 7, 7.5, 8] },
  { key: 'L', group: 'dims', label: 'Délka', unit: 'm', values: [7, 7.5, 8, 8.5, 9, 9.5, 10] },
  { key: 'exp', group: 'variants', label: 'Stropní trámy v přízemí', values: [1, 0],
    names: ['Pohledové', 'Skryté'], desc: ['Vyložená zhlaví, přesah 0,7 m', 'Podhled ze sádrokartonu, přesah 0,3 m'] },
  { key: 'fas', group: 'variants', label: 'Fasáda přízemí', values: [1, 0],
    names: ['Roubená', 'Omítka'], desc: ['Prkna s bílou spárou', 'Bílá omítka'] },
  { key: 'bal', group: 'variants', label: 'Balkon ve štítu', values: [0, 1],
    names: ['Bez balkonu', 'S balkonem'], desc: ['Okna ve štítu', 'Pod přesahem střechy'] },
];
const state = { W: 6, L: 8, exp: 1, bal: 0, fas: 1 };
for (const [k, v] of new URLSearchParams(location.hash.slice(1))) {
  const o = OPTS.find((o) => o.key === k);
  if (o && o.values.includes(+v)) state[k] = +v;
}

const fmtNum = (x, d = 0) => x.toLocaleString('cs-CZ', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtKc = (x) => fmtNum(Math.round(x)) + ' Kč';

for (const o of OPTS) {
  const div = document.createElement('div');
  div.className = 'opt';
  div.innerHTML = `<div class="opt-head"><span>${o.label}</span><b></b></div><div class="${o.names ? 'choices' : 'chips'}"></div>`;
  const list = div.lastElementChild;
  o.values.forEach((val, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    if (o.names) {
      b.className = 'choice';
      b.innerHTML = `<span class="t">${o.names[i]}</span><span class="d">${o.desc[i]}</span><span class="p"></span>`;
    } else {
      b.className = 'chip';
      b.textContent = fmtNum(val, val % 1 ? 1 : 0) + ' m';
    }
    b.addEventListener('click', () => { state[o.key] = val; update(); });
    list.appendChild(b);
  });
  o.el = div;
  document.getElementById(o.group).appendChild(div);
}
document.getElementById('toggle-ch').addEventListener('click', (e) => {
  const open = document.getElementById('chapters').classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', open);
});

// ------------------------------------------------------------------ scéna
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
view.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.5;
controls.minDistance = 8;
controls.maxDistance = 60;
controls.target.set(0, 2.2, 0);

scene.add(new THREE.HemisphereLight(0xfff8ef, 0xc9bfb2, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(10, 18, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// podložka: kulatý trávník, k okraji se rozplývá do pozadí
const lawnTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), gr = g.createRadialGradient(256, 256, 120, 256, 256, 256);
  gr.addColorStop(0, 'rgba(176,183,152,1)'); gr.addColorStop(0.7, 'rgba(196,199,174,.85)'); gr.addColorStop(1, 'rgba(240,235,227,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const lawn = new THREE.Mesh(new THREE.CircleGeometry(13, 64), new THREE.MeshStandardMaterial({ map: lawnTex, transparent: true, roughness: 1 }));
lawn.rotation.x = -Math.PI / 2;
lawn.position.y = -0.45;
lawn.receiveShadow = true;
scene.add(lawn);

// ------------------------------------------------------------------ materiály a textury
function canvasTex(draw, px = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  draw(c.getContext('2d'), px);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// roubená fasáda: hnědá prkna KVH 200 mm s bílou spárou (5 na 1 m)
const texRoub = canvasTex((g, s) => {
  const n = 5, h = s / n, gap = h * 0.09;
  for (let i = 0; i < n; i++) {
    g.fillStyle = `hsl(28, 46%, ${30 + rnd() * 5}%)`;
    g.fillRect(0, i * h, s, h);
    g.strokeStyle = 'rgba(30,15,5,.22)';
    for (let k = 0; k < 9; k++) {
      g.beginPath();
      const y = i * h + 4 + rnd() * (h - gap - 8);
      g.moveTo(0, y);
      g.bezierCurveTo(s * .3, y + rnd() * 6 - 3, s * .6, y + rnd() * 6 - 3, s, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,230,190,.12)'; g.fillRect(0, i * h, s, 3);
    g.fillStyle = '#ece6da'; g.fillRect(0, (i + 1) * h - gap, s, gap);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, (i + 1) * h - gap, s, 2);
  }
});
// palubky štítů: svislé, ~146 mm (7 na 1 m), světlejší
const texPal = canvasTex((g, s) => {
  const n = 7, w = s / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = `hsl(30, 38%, ${48 + rnd() * 7}%)`;
    g.fillRect(i * w, 0, w, s);
    g.strokeStyle = 'rgba(60,35,15,.18)';
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      const x = i * w + 4 + rnd() * (w - 8);
      g.moveTo(x, 0);
      g.bezierCurveTo(x + rnd() * 4 - 2, s * .3, x + rnd() * 4 - 2, s * .6, x, s);
      g.stroke();
    }
    g.fillStyle = 'rgba(40,22,8,.6)'; g.fillRect(i * w, 0, 3, s);
  }
});
// omítka: bílá, jemná zrnitost
const texOmi = canvasTex((g, s) => {
  g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() < .5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.6)';
    g.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
  }
}, 256);
texOmi.repeat.set(0.5, 0.5);
// kamenný sokl (jen vizuálně)
const texStone = canvasTex((g, s) => {
  g.fillStyle = '#8f8a7c'; g.fillRect(0, 0, s, s);
  let y = 0;
  while (y < s) {
    const h = 26 + rnd() * 22;
    let x = -rnd() * 40;
    while (x < s) {
      const w = 40 + rnd() * 70;
      g.fillStyle = `hsl(${42 + rnd() * 10}, ${18 + rnd() * 14}%, ${66 + rnd() * 14}%)`;
      g.beginPath();
      g.roundRect(x + 2, y + 2, w - 4, h - 4, 8);
      g.fill();
      x += w;
    }
    y += h;
  }
});

const std = (o) => new THREE.MeshStandardMaterial({ roughness: .85, ...o });
const M = {
  roub: std({ map: texRoub }),
  omi: std({ map: texOmi, roughness: 1 }),
  pal: std({ map: texPal }),
  stone: std({ map: texStone, roughness: 1 }),
  trim: std({ color: 0xa67a4c }),          // lišty, šambrány, čela střechy
  frame: std({ color: 0x5e3f24, roughness: .6 }), // okna a dveře
  beam: std({ color: 0xb2814d, emissive: 0x2a1a0c }), // zhlaví a pozednice (pod přesahem bez stínu)
  soffit: std({ color: 0xb48a5a }),
  roof: std({ color: 0x252526, roughness: .5, metalness: .3 }),
  seam: std({ color: 0x333335, roughness: .45, metalness: .35 }),
  glass: std({ color: 0x4c585f, roughness: .08, metalness: .6 }),
  metal: std({ color: 0x2c2c2d, roughness: .4, metalness: .5 }),
};

// ------------------------------------------------------------------ stavba
const WALL = 0.3; // vizuální tloušťka obvodové stěny
const SOKL = 0.45; // kamenný sokl pod podlahou přízemí (jen vizuálně, v rozpočtu není)
let house = null;

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function extrude(pts, depth, mat) {
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth, bevelEnabled: false }), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
/** Válec mezi dvěma body (svody). */
function pipe(a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 10), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  m.castShadow = true;
  return m;
}
/** Zhlaví / konzola: bočnice s vykrojeným koncem, protažená o šířku b (lokálně z = ven ze stěny). */
function konzola(len, h, b, mat) {
  const k = Math.min(0.18, len * 0.4);
  const pts = [[0, 0], [len - k, 0]];
  for (let i = 1; i <= 6; i++) { const t = (i / 6) * Math.PI / 2; pts.push([len - k + Math.sin(t) * k, h * 0.5 * (1 - Math.cos(t))]); }
  pts.push([len, h], [0, h]);
  const m = extrude(pts, b, mat); // tvar v rovině (z, y), protažení podél x
  m.geometry.rotateY(-Math.PI / 2); // lokální x tvaru -> svět z, protažení -> svět x
  m.geometry.translate(b / 2, 0, 0);
  return m;
}

/** Stěna jako protažený obrys s otvory. pts = [[u,y],...] v rovině stěny, holes = [{u,y,w,h}].
 *  side: 'S' (+z), 'N' (−z), 'E' (+x), 'W' (−x). Vnější líc leží na hraně půdorysu. */
function wall(pts, holes, mat, side, v) {
  const shape = new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y)));
  for (const o of holes) {
    const p = new THREE.Path();
    p.moveTo(o.u - o.w / 2, o.y); p.lineTo(o.u + o.w / 2, o.y);
    p.lineTo(o.u + o.w / 2, o.y + o.h); p.lineTo(o.u - o.w / 2, o.y + o.h);
    shape.holes.push(p);
  }
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: WALL, bevelEnabled: false }), mat);
  m.castShadow = m.receiveShadow = true;
  place(m, side, v, -WALL);
  return m;
}
/** Umístí objekt s lokální osou z směřující ven ze stěny; off = posun podél normály od líce. */
function place(obj, side, v, off) {
  const { L, W } = v;
  if (side === 'S') { obj.position.z = W / 2 + off; }
  if (side === 'N') { obj.rotation.y = Math.PI; obj.position.z = -W / 2 - off; }
  if (side === 'E') { obj.rotation.y = Math.PI / 2; obj.position.x = L / 2 + off; }
  if (side === 'W') { obj.rotation.y = -Math.PI / 2; obj.position.x = -L / 2 - off; }
}

/** Okno / dveře: rám s příčkami, u dřevěné fasády šambrána. */
function opening(o, side, v, trim) {
  const g = new THREE.Group();
  const f = 0.08, d = 0.08, cy = o.y + o.h / 2;
  const add = (m) => { g.add(m); return m; };
  add(box(o.w, f, d, M.frame, 0, o.y + f / 2, 0));
  add(box(o.w, f, d, M.frame, 0, o.y + o.h - f / 2, 0));
  add(box(f, o.h, d, M.frame, -o.w / 2 + f / 2, cy, 0));
  add(box(f, o.h, d, M.frame, o.w / 2 - f / 2, cy, 0));
  const iw = o.w - 2 * f, ih = o.h - 2 * f;
  if (o.kind === 'door') {
    add(box(iw, ih, 0.04, M.frame, 0, cy, -0.01));
    for (const y of [0.3, 0.7]) add(box(iw * 0.7, 0.03, 0.02, M.trim, 0, o.y + o.h * y, 0.02));
  } else {
    add(box(iw, ih, 0.02, M.glass, 0, cy, -0.01)).castShadow = false;
    const leaves = o.kind === 'french' || o.w > 0.85 ? 2 : 1;
    const rows = o.h > 1.2 ? 3 : 2;
    if (leaves === 2) add(box(0.06, ih, 0.06, M.frame, 0, cy, 0));
    for (let i = 1; i < rows; i++) add(box(iw, 0.035, 0.04, M.frame, 0, o.y + f + (ih * i) / rows, 0.01));
    if (o.kind !== 'french') add(box(o.w + 0.12, 0.035, 0.2, M.metal, 0, o.y - 0.02, 0.1));
  }
  if (trim) { // šambrána
    const t = 0.11, z = 0.13;
    add(box(o.w + 2 * t, t, 0.03, M.trim, 0, o.y + o.h + t / 2, z));
    add(box(t, o.h + t, 0.03, M.trim, -o.w / 2 - t / 2, cy + t / 2, z));
    add(box(t, o.h + t, 0.03, M.trim, o.w / 2 + t / 2, cy + t / 2, z));
    if (o.kind !== 'window') add(box(o.w + 2 * t, 0.04, 0.03, M.trim, 0, o.y - 0.02, z));
    else add(box(o.w + 2 * t, t, 0.03, M.trim, 0, o.y - t / 2 - 0.035, z));
  }
  g.children.forEach((c) => (c.position.x += o.u));
  place(g, side, v, -0.12);
  return g;
}

function build(r) {
  const v = r.v;
  const { L, W, zs, hok, hhr, tg, cs, pe, pg, h1, trh, trb, ntr, Li, vyl, pzb, Lst } = v;
  const g = new THREE.Group();
  const top = (u) => hok + Math.max(0, W / 2 - Math.abs(u)) * tg; // líc střechy nad stěnou
  const size = Object.fromEntries(r.openings.map((o) => [o.ozn.split(',')[0].split('–')[0], o]));
  const op = (ozn, u, y, kind = 'window') => ({ u, y, w: size[ozn].w, h: size[ozn].h, kind });

  // kamenný sokl
  const a = W / 2 - WALL; // štítové stěny mezi okapovými
  for (const s of ['S', 'N']) g.add(wall([[-L / 2, -SOKL], [L / 2, -SOKL], [L / 2, 0], [-L / 2, 0]], [], M.stone, s, v));
  for (const s of ['E', 'W']) g.add(wall([[-a, -SOKL], [a, -SOKL], [a, 0], [-a, 0]], [], M.stone, s, v));

  // otvory podle tabulky 1b, rozmístění podle vizualizací
  const lo = { S: [], N: [], E: [], W: [] }, up = { S: [], N: [], E: [], W: [] };
  const s1 = 0.75, s2 = zs + 0.95;
  lo.S.push(op('O1', -L * 0.22, s1), op('D1', L * 0.12, 0.02, 'door'));
  lo.N.push(op('D3', 0, 0.02, 'french'));
  lo.E.push(op('O2', -W * 0.2, s1), op('O2', W * 0.2, s1));
  up.W.push(op('O4', -0.7, s2), op('O4', 0.7, s2));
  if (v.bal) up.E.push(op('D2', 0, zs + 0.05, 'french'));
  else up.E.push(op('O6', -0.7, s2), op('O6', 0.7, s2));

  // stěny: přízemí (fasáda dle volby), nad stropem palubky (pás pod krovem + štíty)
  const m1 = v.fas ? M.roub : M.omi;
  for (const s of ['S', 'N']) {
    g.add(wall([[-L / 2, 0], [L / 2, 0], [L / 2, zs], [-L / 2, zs]], lo[s], m1, s, v));
    const c = L / 2 - WALL; // pás pod krovem končí u štítů, nároží kryjí palubky štítu
    if (hok - zs > 0.01) g.add(wall([[-c, zs], [c, zs], [c, hok], [-c, hok]], up[s], M.pal, s, v));
  }
  for (const s of ['E', 'W']) {
    g.add(wall([[-a, 0], [a, 0], [a, zs], [-a, zs]], lo[s], m1, s, v));
    // štít: palubky přes celou šířku až pod střechu
    const b = W / 2;
    g.add(wall([[-b, zs], [b, zs], [b, top(b)], [0, hhr], [-b, top(b)]], up[s], M.pal, s, v));
  }
  for (const s of ['S', 'N', 'E', 'W']) {
    for (const o of lo[s]) g.add(opening(o, s, v, v.fas));
    for (const o of up[s]) g.add(opening(o, s, v, true));
  }
  // roubená: nárožní prkna
  if (v.fas) {
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      g.add(box(0.2, zs, 0.2, M.frame, x * (L / 2 - 0.07), zs / 2, z * (W / 2 - 0.07)));
    }
  }
  // předěl přízemí / štít
  for (const s of ['S', 'N', 'E', 'W']) {
    const len = s === 'S' || s === 'N' ? L + 0.1 : W + 0.1;
    const gg = new THREE.Group();
    gg.add(box(len, 0.05, 0.08, M.metal, 0, zs, 0.04));
    place(gg, s, v, 0); g.add(gg);
  }

  // pohledové stropní trámy: zhlaví vyložená na okapových stranách, na nich pozednice
  if (v.exp) {
    for (let i = 0; i < ntr; i++) {
      const x = -Li / 2 + (i * Li) / (ntr - 1);
      for (const sgn of [1, -1]) {
        const k = konzola(vyl, trh, trb, M.beam);
        k.position.set(x, h1, sgn * W / 2);
        if (sgn < 0) k.rotation.y = Math.PI;
        k.receiveShadow = false;
        g.add(k);
      }
    }
    for (const sgn of [1, -1]) {
      const pz = box(Li + trb + 0.3, pzb, pzb, M.beam, 0, h1 + trh + pzb / 2, sgn * (W / 2 + vyl - pzb / 2));
      pz.receiveShadow = false;
      g.add(pz);
    }
  }

  // střecha: dřevěné čelo a podbití (tl. 0,2 m) + tenká plechová krytina s přesahem přes čela
  const E = W / 2 + pe, yE = hok - pe * tg, RT = 0.2, d = RT / cs;
  const x0 = -L / 2 - pg, xc = x0 + Lst / 2;
  const chevron = (e, y0, t) => new THREE.Shape([
    new THREE.Vector2(-e, y0 - e * tg), new THREE.Vector2(0, y0), new THREE.Vector2(e, y0 - e * tg),
    new THREE.Vector2(e, y0 - e * tg + t), new THREE.Vector2(0, y0 + t), new THREE.Vector2(-e, y0 - e * tg + t),
  ]);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(chevron(E, hhr, d), { depth: Lst, bevelEnabled: false }), [M.trim, M.soffit]);
  body.rotation.y = Math.PI / 2;
  body.position.x = x0;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const ov = 0.04, ts = 0.025 / cs; // přesah a tloušťka plechu
  const sheet = new THREE.Mesh(new THREE.ExtrudeGeometry(chevron(E + ov, hhr + d, ts), { depth: Lst + 2 * ov, bevelEnabled: false }), M.roof);
  sheet.rotation.y = Math.PI / 2;
  sheet.position.x = x0 - ov;
  sheet.castShadow = sheet.receiveShadow = true;
  g.add(sheet);
  // stojaté drážky krytiny
  const seamLen = (E + ov) / cs, ySeam = hhr + d + ts - (E + ov) / 2 * tg + 0.012;
  for (let x = x0 + 0.3; x < x0 + Lst - 0.1; x += 0.55) {
    for (const sgn of [1, -1]) {
      const sm = box(0.02, 0.025, seamLen, M.seam, x, ySeam, sgn * (E + ov) / 2);
      sm.castShadow = false;
      sm.rotation.x = sgn * Math.atan(tg);
      g.add(sm);
    }
  }
  g.add(box(Lst + 2 * ov, 0.05, 0.22, M.seam, xc, hhr + d + ts + 0.01, 0)); // hřebenáč
  // žlaby a svody (západní konec)
  for (const sgn of [1, -1]) {
    const gut = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, Lst, 12), M.metal);
    gut.rotation.z = Math.PI / 2;
    gut.position.set(xc, yE - 0.03, sgn * (E + 0.04));
    gut.castShadow = true;
    g.add(gut);
    const xs = -L / 2 + 0.15, zw = sgn * (W / 2 + 0.1);
    g.add(pipe([xs, yE - 0.05, sgn * (E + 0.04)], [xs, yE - 0.45, zw], 0.045, M.metal));
    g.add(pipe([xs, yE - 0.45, zw], [xs, -SOKL, zw], 0.045, M.metal));
  }

  // balkon ve štítu: na konzolách, pod přesahem střechy, zábradlí z vodorovných prken
  if (v.bal) {
    const bd = v.bd, bw = W - 2 * v.bok, x1 = L / 2 + bd;
    for (const z of [-bw / 2 + 0.3, 0, bw / 2 - 0.3]) {
      const k = konzola(bd, 0.24, 0.14, M.beam);
      k.rotation.y = Math.PI / 2; // ven ze štítu (+x)
      k.position.set(L / 2, zs - 0.36, z);
      g.add(k);
    }
    g.add(box(bd, 0.12, bw, M.trim, L / 2 + bd / 2, zs - 0.06, 0));
    g.add(box(0.04, 0.22, bw + 0.08, M.trim, x1 + 0.02, zs - 0.08, 0)); // čelo
    const rh = 1.05;
    const posts = [[x1 - 0.06, -bw / 2 + 0.06], [x1 - 0.06, bw / 2 - 0.06], [L / 2 + 0.06, -bw / 2 + 0.06], [L / 2 + 0.06, bw / 2 - 0.06]];
    const nMid = Math.max(0, Math.ceil(bw / 1.6) - 1);
    for (let i = 1; i <= nMid; i++) posts.push([x1 - 0.06, -bw / 2 + (i * bw) / (nMid + 1)]);
    for (const [x, z] of posts) g.add(box(0.12, rh, 0.12, M.frame, x, zs + rh / 2, z));
    for (let i = 0; i < 4; i++) {
      const y = zs + 0.22 + i * 0.22;
      g.add(box(0.035, 0.12, bw, M.trim, x1 + 0.01, y, 0));
      for (const sgn of [1, -1]) g.add(box(bd, 0.12, 0.035, M.trim, L / 2 + bd / 2, y, sgn * (bw / 2 + 0.01)));
    }
    g.add(box(0.16, 0.04, bw + 0.1, M.trim, x1 - 0.04, zs + rh + 0.02, 0)); // madlo
    for (const sgn of [1, -1]) g.add(box(bd, 0.04, 0.16, M.trim, L / 2 + bd / 2, zs + rh + 0.02, sgn * (bw / 2 - 0.02)));
  }
  return g;
}

// ------------------------------------------------------------------ přepočet
function update() {
  const r = calc(state);
  const v = r.v;

  for (const o of OPTS) {
    const idx = o.values.indexOf(state[o.key]);
    o.el.querySelectorAll('button').forEach((b, i) => {
      b.classList.toggle('on', i === idx);
      b.setAttribute('aria-pressed', i === idx);
      if (!o.names) return;
      // rozdíl ceny proti aktuální volbě (bez DPH, zaokrouhleno na tisíce)
      const diff = i === idx ? 0 : Math.round((calc({ ...state, [o.key]: o.values[i] }).bezDph - r.bezDph) / 1000) * 1000;
      b.querySelector('.p').textContent = i === idx ? 'Zvoleno' : (diff >= 0 ? '+ ' : '− ') + fmtKc(Math.abs(diff));
    });
    o.el.querySelector('b').textContent = o.unit ? fmtNum(state[o.key], 1) + ' ' + o.unit : '';
  }
  document.getElementById('o-dim').textContent = `${fmtNum(v.L, 1)} × ${fmtNum(v.W, 1)} m`;
  document.getElementById('o-az').textContent = `${fmtNum(v.Az, 1)} m²`;
  document.getElementById('o-ap').textContent = `${fmtNum(v.Ap1 + v.Ap2, 1)} m²`;
  document.getElementById('o-au').textContent = `${fmtNum(v.Au2, 1)} m²`;
  tween('o-bez', r.bezDph);
  tween('o-s', r.sDph);

  if (!r.chapters) document.getElementById('toggle-ch').hidden = true;
  else document.getElementById('chapters').innerHTML = r.chapters.map((c) => {
    return `<div class="${c.total ? '' : 'zero'}"><span>${c.name}</span><span>${fmtKc(c.total)}</span></div>`;
  }).join('') + `<div><span>Přesun hmot</span><span>${fmtKc(r.presun)}</span></div>`;

  if (house) {
    scene.remove(house);
    house.traverse((o) => o.geometry && o.geometry.dispose());
  }
  house = build(r);
  scene.add(house);
  controls.target.y = v.hhr * 0.38;

  history.replaceState(null, '', location.pathname + location.search + '#' + new URLSearchParams(state).toString());
  window.__chata = { r, camera, controls }; // pro kontrolu z konzole
}

const tweens = {};
function tween(id, to) {
  const el = document.getElementById(id);
  const from = tweens[id] ?? to, t0 = performance.now();
  tweens[id] = to;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 450), e = 1 - (1 - k) ** 3;
    el.textContent = fmtKc(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// výchozí pohled: celý dům i s podstavcem v záběru podle poměru stran
const DIR = new THREE.Vector3(0.62, 0.2, 0.76).normalize();
function frame() {
  const fit = 9.6 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect * 0.95);
  camera.position.copy(DIR).multiplyScalar(fit).add(controls.target);
}
function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (!controls.__moved) frame();
}
controls.addEventListener('start', () => (controls.__moved = true));
new ResizeObserver(resize).observe(view);
resize();
update();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
