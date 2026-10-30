import * as THREE from 'three';

/* =========================================================
   라인온의원 · 온라인 시술실
   - 3D 방 + 베드, 클릭 이동, 눕기, Dr. Oh 주사, 쿨링
   - Supabase Realtime presence/broadcast로 다른 사람 표시
   ========================================================= */

const CFG = window.LINEON_CONFIG || {};
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wait = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

const BOOSTERS = [
  { id: 'glow', n: '글로우 부스터', d: '칙칙함 · 광채', shots: 9 },
  { id: 'hydra', n: '수분 샤워', d: '건조 · 속당김', shots: 12 },
  { id: 'lift', n: '탄력 리프트', d: '처짐 · 잔주름', shots: 10 },
  { id: 'pore', n: '모공 타이트', d: '모공 · 피지', shots: 14 },
  { id: 'calm', n: '홍조 캄', d: '홍조 · 민감', shots: 8 },
];
const ADJ = ['조용한', '맑은', '포근한', '반짝이는', '느긋한', '수줍은', '산뜻한', '말랑한', '고요한', '졸린'];
const NOUN = ['빗방울', '복숭아', '구름', '달빛', '솜사탕', '물결', '햇살', '오렌지', '바람', '이슬'];
const randomName = () => ADJ[(Math.random() * ADJ.length) | 0] + ' ' + NOUN[(Math.random() * NOUN.length) | 0];
const PALETTE = ['#EA660D', '#F2A65A', '#9AD3C9', '#C9B8F2', '#F2C5B5', '#B5D6F2', '#E8D99A'];

/* ---------- 상태 ---------- */
const me = {
  id: Math.random().toString(36).slice(2, 10),
  name: '', color: PALETTE[(Math.random() * PALETTE.length) | 0],
  x: rnd(-3.2, 3.2), z: rnd(4.0, 5.4), ry: Math.PI, bed: -1, state: 'idle', // 입구 근처 랜덤 위치 (겹침 방지) // idle | walk | lying | injecting | cooling
};
 let shotsTotal = 0; 
try { shotsTotal = +localStorage.getItem('lineon.shots') || 0; } catch (e) {}
let muted = false;
try { muted = localStorage.getItem('lineon.muted') === '1'; } catch (e) {}

/* ---------- 렌더러 / 씬 ---------- */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1011);
scene.fog = new THREE.Fog(0x0e1011, 18, 34);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 80);
const cam = { yaw: 0, pitch: 0.42, dist: 7, target: new THREE.Vector3(0, 1, 2) };

/* 방 치수 */
const ROOM = { w: 16, d: 12, h: 3.4 };

/* ---------- 재질 ---------- */
function woodTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#2b2a28'; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64) {
    const off = (y / 64) % 2 ? 128 : 0;
    for (let x = -128; x < 512; x += 256) {
      const t = 0.9 + Math.random() * 0.2;
      g.fillStyle = `rgb(${(46 * t) | 0},${(43 * t) | 0},${(39 * t) | 0})`;
      g.fillRect(x + off + 1, y + 1, 254, 62);
      for (let i = 0; i < 6; i++) { g.strokeStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.beginPath(); const yy = y + Math.random() * 64; g.moveTo(x + off, yy); g.lineTo(x + off + 256, yy + Math.random() * 4 - 2); g.stroke(); }
    }
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(4, 3); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
const matFloor = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.75, metalness: 0.05 });
const matWall = new THREE.MeshStandardMaterial({ color: 0x2e3337, roughness: 0.95 });
const matWallAccent = new THREE.MeshStandardMaterial({ color: 0x25292c, roughness: 0.9 });
const matCeil = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 1 });
const matFrame = new THREE.MeshStandardMaterial({ color: 0x3a3f43, roughness: 0.6, metalness: 0.3 });
const matMattress = new THREE.MeshStandardMaterial({ color: 0xe9e3d8, roughness: 0.9 });
const matPillow = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.95 });
const matBlanket = new THREE.MeshStandardMaterial({ color: 0xea660d, roughness: 0.85 });
const matSkin = new THREE.MeshStandardMaterial({ color: 0xf3d7c5, roughness: 0.8 });
const matGown = new THREE.MeshStandardMaterial({ color: 0xdfe6e8, roughness: 0.9 });
const matNurse = new THREE.MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.9 });
const matDark = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 });
const matGlass = new THREE.MeshStandardMaterial({ color: 0xbfe6ee, transparent: true, opacity: 0.35, roughness: 0.2 });
const matSteel = new THREE.MeshStandardMaterial({ color: 0xcfd6d9, roughness: 0.3, metalness: 0.8 });

/* ---------- 방 ---------- */
function buildRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), matFloor);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 'floor'; scene.add(floor);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), matCeil);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = ROOM.h; scene.add(ceil);

  const mk = (w, h, x, y, z, ry, m = matWall) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; p.receiveShadow = true; scene.add(p); return p; };
  mk(ROOM.w, ROOM.h, 0, ROOM.h / 2, -ROOM.d / 2, 0, matWallAccent);          // 뒷벽 (로고)
  mk(ROOM.w, ROOM.h, 0, ROOM.h / 2, ROOM.d / 2, Math.PI);                   // 앞벽
  mk(ROOM.d, ROOM.h, -ROOM.w / 2, ROOM.h / 2, 0, Math.PI / 2);               // 왼벽
  mk(ROOM.d, ROOM.h, ROOM.w / 2, ROOM.h / 2, 0, -Math.PI / 2);              // 오른벽 (문)

  // 걸레받이
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(ROOM.w, 0.12, 0.04), matFrame); skirt.position.set(0, 0.06, -ROOM.d / 2 + 0.02); scene.add(skirt);

  // 천장 패널 조명 3개
  for (let i = -1; i <= 1; i++) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.2), new THREE.MeshStandardMaterial({ color: 0xfff6e6, emissive: 0xfff1d6, emissiveIntensity: 1.4 }));
    panel.position.set(i * 4.6, ROOM.h - 0.03, -0.5); scene.add(panel);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.05, 1.4), matFrame); rim.position.set(i * 4.6, ROOM.h - 0.01, -0.5); scene.add(rim);
    const pl = new THREE.PointLight(0xffe9c9, 55, 18, 1.5); pl.position.set(i * 4.6, ROOM.h - 0.5, -0.5); pl.castShadow = i === 0; pl.shadow.mapSize.set(1024, 1024); pl.shadow.bias = -0.002; scene.add(pl);
  }
  scene.add(new THREE.AmbientLight(0xffe4c8, 0.6));
  const hemi = new THREE.HemisphereLight(0xffe1c1, 0x15171a, 0.9); scene.add(hemi);

  // 뒷벽 로고 (SVG → 텍스처), 은은하게
  const img = new Image(); img.src = 'assets/mark_lineon_ps.svg';
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d');
    const r = Math.min(900 / img.width, 900 / img.height); const w = img.width * r, h = img.height * r;
    g.drawImage(img, (1024 - w) / 2, (1024 - h) / 2, w, h);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1, color: 0xffffff }));
    logo.position.set(0, 1.85, -ROOM.d / 2 + 0.02); scene.add(logo);
    const spot = new THREE.SpotLight(0xffd9b3, 30, 9, 0.5, 0.6, 1.2); spot.position.set(0, ROOM.h - 0.1, -ROOM.d / 2 + 2.2); spot.target.position.set(0, 1.8, -ROOM.d / 2); scene.add(spot, spot.target);
  };

  // 메뉴 보드 (왼벽)
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x0f1112, roughness: 0.6 }));
  board.position.set(-ROOM.w / 2 + 0.03, 1.7, -1.5); scene.add(board);
  const bc = document.createElement('canvas'); bc.width = 1024; bc.height = 560; const bg = bc.getContext('2d');
  bg.fillStyle = '#0f1112'; bg.fillRect(0, 0, 1024, 560);
  bg.fillStyle = '#EA660D'; bg.fillRect(60, 60, 8, 440);
  bg.fillStyle = '#f1ece4'; bg.font = '300 44px "Noto Sans KR", sans-serif'; bg.textBaseline = 'top'; bg.fillText('SKIN BOOSTER', 100, 56);
  bg.fillStyle = '#9aa0a3'; bg.font = '300 26px "Noto Sans KR", sans-serif'; bg.fillText('MENU', 100, 112);
  bg.fillStyle = '#f1ece4'; bg.font = '400 34px "Noto Sans KR", sans-serif';
  BOOSTERS.forEach((b, i) => { bg.fillText(b.n, 100, 180 + i * 66); bg.fillStyle = '#9aa0a3'; bg.font = '300 24px "Noto Sans KR", sans-serif'; bg.fillText(b.d, 560, 186 + i * 66); bg.fillStyle = '#f1ece4'; bg.font = '400 34px "Noto Sans KR", sans-serif'; });
  const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace;
  const bplane = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.15), new THREE.MeshBasicMaterial({ map: btex }));
  bplane.position.set(-ROOM.w / 2 + 0.07, 1.7, -1.5); bplane.rotation.y = Math.PI / 2; scene.add(bplane);

  // 문 (오른벽) — 간호사 등장
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 1.1), new THREE.MeshStandardMaterial({ color: 0x3a3330, roughness: 0.7 }));
  door.position.set(ROOM.w / 2 - 0.04, 1.1, 3.5); scene.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), matSteel); knob.position.set(ROOM.w / 2 - 0.1, 1.05, 3.1); scene.add(knob);
  const exitSign = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.5), new THREE.MeshStandardMaterial({ color: 0x3a7a5a, emissive: 0x2ecc71, emissiveIntensity: 0.6 }));
  exitSign.position.set(ROOM.w / 2 - 0.05, 2.45, 3.5); scene.add(exitSign);

  // 카트 / 소품
  const cart = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.45), matSteel); top.position.y = 0.85; cart.add(top);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.45), matSteel); shelf.position.y = 0.4; cart.add(shelf);
  [[-0.32, -0.2], [0.32, -0.2], [-0.32, 0.2], [0.32, 0.2]].forEach(([x, z]) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.85, 8), matSteel); leg.position.set(x, 0.425, z); cart.add(leg); });
  for (let i = 0; i < 4; i++) { const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10), matGlass); vial.position.set(-0.2 + i * 0.13, 0.93, 0); cart.add(vial); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 10), matBlanket); cap.position.set(-0.2 + i * 0.13, 1.0, 0); cart.add(cap); }
  cart.position.set(ROOM.w / 2 - 1.2, 0, 1.2); cart.traverse(o => { o.castShadow = true; }); scene.add(cart);

  // 화분
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0xd9cbb8, roughness: 1 })); pot.position.set(-ROOM.w / 2 + 0.8, 0.2, ROOM.d / 2 - 0.8); scene.add(pot);
  for (let i = 0; i < 7; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x3f7f5a, roughness: 0.9 })); leaf.position.set(pot.position.x + Math.cos(i) * 0.1, 0.85, pot.position.z + Math.sin(i) * 0.1); leaf.rotation.set(Math.cos(i * 1.7) * 0.4, 0, Math.sin(i * 1.3) * 0.4); leaf.castShadow = true; scene.add(leaf); }
}

/* ---------- 베드 ---------- */
const beds = []; // {group, x, z, mesh (clickable), occupant}
function buildBeds() {
  const cols = 4, rows = 2;
  const sx = 3.4, sz = 4.6;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = (c - (cols - 1) / 2) * sx, z = -2.6 + r * sz;
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 2.1), matFrame); frame.position.y = 0.27; frame.castShadow = frame.receiveShadow = true; g.add(frame);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.14, 2.06), matMattress); mattress.position.y = 0.6; mattress.castShadow = mattress.receiveShadow = true; mattress.name = 'bed'; mattress.userData.bed = beds.length; g.add(mattress);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.32), matPillow); pillow.position.set(0, 0.72, -0.78); pillow.castShadow = true; g.add(pillow);
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.04, 0.5), matBlanket); blanket.position.set(0, 0.69, 0.75); g.add(blanket);
    [[-0.38, -0.95], [0.38, -0.95], [-0.38, 0.95], [0.38, 0.95]].forEach(([lx, lz]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), matDark); w.rotation.z = Math.PI / 2; w.position.set(lx, 0.04, lz); g.add(w); });
    // 베드 번호판
    const num = labelSprite(String(beds.length + 1).padStart(2, '0'), { size: 0.22, bg: 'rgba(0,0,0,0)', fg: '#9aa0a3', font: '300 64px "Noto Sans KR", sans-serif' }); num.position.set(0, 0.62, -1.18); g.add(num);
    // 바닥 라인
    // 빈 베드 표시: 매트리스 가장자리 라인
    const ring = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 2.1), new THREE.MeshBasicMaterial({ color: 0xea660d, transparent: true, opacity: 0 })); ring.position.y = 0.68; g.add(ring);
    const idx = beds.length; g.traverse(o => { o.userData.bed = idx; });
    scene.add(g);
    beds.push({ group: g, x, z, mesh: mattress, ring, occupant: null });
  }
}

/* ---------- 라벨 스프라이트 ---------- */
function labelSprite(text, o = {}) {
  const size = o.size || 0.5;
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = o.bg ?? 'rgba(18,20,21,.75)'; roundRect(g, 8, 24, 496, 112, 56); g.fill();
  g.fillStyle = o.fg || '#f1ece4'; g.font = o.font || '400 54px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(text).slice(0, 14), 256, 82);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(size * 3.2, size, 1); return sp;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* ---------- 아바타 ---------- */
function makeAvatar({ color = '#EA660D', nurse = false, name = '' } = {}) {
  const g = new THREE.Group();
  const bodyMat = nurse ? matNurse : matGown;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 6, 14), bodyMat); body.position.y = 0.62; body.castShadow = true; g.add(body);
  // 환자복 포인트 (가슴 띠) / 간호사 명찰
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: nurse ? 0xea660d : new THREE.Color(color), roughness: 0.8 })); strip.position.set(0, 0.78, 0.2); g.add(strip);
  const headG = new THREE.Group(); headG.position.y = 1.22; g.add(headG); g.userData.headG = headG;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 20), matSkin); head.castShadow = true; headG.add(head);
  // 눈
  [-0.09, 0.09].forEach(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), matDark); e.position.set(x, 0.02, 0.235); headG.add(e); });
  // 볼터치
  [-0.15, 0.15].forEach(x => { const b = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), new THREE.MeshBasicMaterial({ color: 0xf2a68c, transparent: true, opacity: 0.55 })); b.position.set(x, -0.05, 0.215); b.lookAt(x * 4, -0.05, 2); headG.add(b); });
  if (nurse) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.265, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ color: 0xea660d, roughness: 0.85 })); cap.position.y = 0.03; headG.add(cap);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 12, Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.45, Math.PI * 0.35), new THREE.MeshStandardMaterial({ color: 0xeaf3f4, roughness: 0.9, side: THREE.DoubleSide })); mask.position.set(0, -0.02, 0.07); headG.add(mask);
    const tag = labelSprite('Dr. Oh', { size: 0.11, bg: '#ffffff', fg: '#121415', font: '500 60px "Noto Sans KR", sans-serif' }); tag.position.set(0.13, 0.86, 0.27); g.add(tag);
  } else {
    // 머리카락 (뒤통수 쪽 반구)
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), new THREE.MeshStandardMaterial({ color: 0x3b2f2a, roughness: 0.95 })); hair.position.set(0, 0.01, -0.05); hair.rotation.x = -0.35; headG.add(hair);
  }
  // 발
  [-0.1, 0.1].forEach(x => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), bodyMat); f.scale.set(1, 0.6, 1.3); f.position.set(x, 0.07, 0.04); g.add(f); });
  const label = labelSprite(name || ' ', { size: 0.36 }); label.position.y = 1.72; g.add(label); g.userData.label = label;
  g.userData.body = body; g.userData.head = head;
  return g;
}
function setAvatarName(g, name) { const old = g.userData.label; g.remove(old); const l = labelSprite(name, { size: 0.36 }); l.position.y = 1.72; g.add(l); g.userData.label = l; }

/* 눕기 포즈: 베드 위로 올려 눕힘 */
function poseLying(g, bed) {
  g.position.set(bed.x, 0.66, bed.z + 0.4);
  g.rotation.set(-Math.PI / 2, 0, 0);
  g.userData.label.position.set(0, 1.5, 0.55); // 로컬 +y=머리쪽(월드 -z), 로컬 +z=월드 위
}
function poseStanding(g) { g.rotation.set(0, g.rotation.y, 0); g.position.y = 0; g.userData.label.position.set(0, 1.72, 0); }

/* ---------- 내 아바타 / 간호사 ---------- */
const myAvatar = makeAvatar({ color: me.color });
myAvatar.position.set(me.x, 0, me.z); myAvatar.rotation.y = me.ry; scene.add(myAvatar);
const nurse = makeAvatar({ nurse: true, name: '' }); nurse.userData.label.visible = false; nurse.visible = false; scene.add(nurse);
// 주사기 (간호사 손 → 1인칭에서는 카메라 앞)
const syringe = new THREE.Group();
const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0xf2f7f8, transparent: true, opacity: 0.9, roughness: 0.2 })); syringe.add(barrel);
const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.14, 12), new THREE.MeshStandardMaterial({ color: 0xea660d, emissive: 0xea660d, emissiveIntensity: 0.3 })); liquid.position.y = -0.02; syringe.add(liquid);
const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 6), matSteel); needle.position.y = -0.17; syringe.add(needle);
const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), matSteel); plunger.position.y = 0.12; syringe.add(plunger);
const glove = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 12), new THREE.MeshStandardMaterial({ color: 0xdff1f2, roughness: 0.9 })); glove.scale.set(1, 0.8, 1.3); glove.position.set(0.05, 0.06, 0); syringe.add(glove);
syringe.visible = false; scene.add(syringe);

/* 쿨링팩 (카메라 앞 반투명 판) */
const coolPack = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0xaee4ee, transparent: true, opacity: 0, depthTest: false }));
coolPack.renderOrder = 999; camera.add(coolPack); coolPack.position.set(0, 0, -0.2); scene.add(camera);

/* 반짝 입자 */
const sparks = [];
function spark(pos) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffb07a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(pos); m.userData.t = 0; m.userData.v = new THREE.Vector3(rnd(-0.12, 0.12), rnd(0.1, 0.3), rnd(-0.12, 0.12)); scene.add(m); sparks.push(m);
}

/* ---------- 입력 ---------- */
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
let drag = null, moved = false;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch }; moved = false; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
  if (me.state === 'idle' || me.state === 'walk') { cam.yaw = drag.yaw - dx * 0.006; cam.pitch = clamp(drag.pitch - dy * 0.004, 0.12, 1.2); }
  else { lookYaw = clamp(lookYaw0 - dx * 0.003, -0.5, 0.5); lookPitch = clamp(lookPitch0 - dy * 0.003, -0.35, 0.35); }
});
canvas.addEventListener('pointerup', e => { if (drag && !moved) click(e); drag = null; lookYaw0 = lookYaw; lookPitch0 = lookPitch; });
canvas.addEventListener('wheel', e => { cam.dist = clamp(cam.dist + e.deltaY * 0.004, 3, 14); }, { passive: true });
let lookYaw = 0, lookPitch = 0, lookYaw0 = 0, lookPitch0 = 0;

const walk = { target: null };
function click(e) {
  if (me.state !== 'idle' && me.state !== 'walk') return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(scene.children, true);
  for (const h of hits) {
    if (h.object.userData.bed !== undefined) { const i = h.object.userData.bed; const b = beds[i]; if (b.occupant && b.occupant !== me.id) { toast('이미 누가 누워 있어요'); return; } goTo(b.x + (b.x > 0 ? -0.9 : 0.9), b.z, () => lieDown(i)); $('#hint').classList.add('fade'); return; }
    if (h.object.name === 'floor') { const p = h.point; goTo(clamp(p.x, -ROOM.w / 2 + 0.5, ROOM.w / 2 - 0.5), clamp(p.z, -ROOM.d / 2 + 0.5, ROOM.d / 2 - 0.5)); $('#hint').classList.add('fade'); return; }
  }
}
function goTo(x, z, then) { walk.target = { x, z, then }; me.state = 'walk'; }

/* ---------- 흐름: 눕기 → 주사 → 쿨링 ---------- */
let busy = false, coolTimer = null, currentBed = -1;
function lieDown(i) {
  const b = beds[i]; currentBed = i; me.bed = i; me.state = 'lying'; b.occupant = me.id;
  poseLying(myAvatar, b); myAvatar.visible = false; // 1인칭이라 내 몸은 숨김 (다른 사람에겐 보임)
  document.body.classList.add('lying');
  lookYaw = lookPitch = lookYaw0 = lookPitch0 = 0;
  $('#menu').hidden = false; say('편하게 누우세요. 메뉴에서 하나 골라주세요.', 3200);
  net.push();
}
function standUp() {
  clearInterval(coolTimer); $('#menu').hidden = true; $('#cool').hidden = true; document.body.classList.remove('lying');
  coolPack.material.opacity = 0; nurse.visible = false; syringe.visible = false;
  const b = beds[currentBed]; if (b && b.occupant === me.id) b.occupant = null;
  poseStanding(myAvatar); myAvatar.position.set(b ? b.x + (b.x > 0 ? -0.9 : 0.9) : 0, 0, b ? b.z : 4); me.x = myAvatar.position.x; me.z = myAvatar.position.z;
  myAvatar.visible = true;
  me.bed = -1; me.state = 'idle'; currentBed = -1; busy = false; net.push();
}
async function inject(b) {
  if (busy) return; busy = true; $('#menu').hidden = true; me.state = 'injecting'; net.push();
  say(`${b.n} 준비할게요. 잠시만요.`, 2600);
  // 간호사 문에서 출발
  const bed = beds[currentBed];
  nurse.visible = true; nurse.position.set(ROOM.w / 2 - 0.6, 0, 3.5); nurse.rotation.y = -Math.PI / 2;
  const side = bed.x > 0 ? -1 : 1; // 베드 옆, 머리 쪽
  const dest = new THREE.Vector3(bed.x + side * 1.35, 0, bed.z - 0.8);
  await moveNurse(dest);
  nurse.lookAt(bed.x - side * 2, 0, bed.z - 0.8); nurse.rotateX(0.18); nurse.userData.headG.rotation.x = 0.7; nurseSide = side; // 고개를 숙여 환자를 내려다봄 // 환자 위로 몸을 숙임 (얼굴이 시야에 들어오도록)
  await wait(500); say('살짝 따끔해요.', 1600);
  syringe.visible = true;
  for (let k = 0; k < b.shots; k++) {
    // 시야(얼굴) 주변 랜덤 지점으로 주사
    const tx = rnd(-0.22, 0.22), ty = rnd(-0.1, 0.22);
    await jab(tx, ty);
    shotsTotal++; $('#shots b').textContent = shotsTotal; try { localStorage.setItem('lineon.shots', shotsTotal); } catch (e) {}
    await wait(rnd(380, 720));
  }
  syringe.visible = false; await wait(500);
  say('다 됐어요. 쿨링팩 올려드릴게요.', 2600); await wait(1200);
  me.state = 'cooling'; net.push();
  coolFade(1); nurse.rotation.set(0, nurse.rotation.y, 0); nurse.position.y = 0; nurse.userData.headG.rotation.x = 0; nurseSide = 0; await moveNurse(new THREE.Vector3(ROOM.w / 2 - 0.6, 0, 3.5)); nurse.visible = false;
  startRest(); busy = false;
}
function moveNurse(dest) {
  return new Promise(res => {
    const from = nurse.position.clone(); const d = from.distanceTo(dest); const dur = Math.max(600, d / 1.6 * 1000); const t0 = performance.now();
    nurse.lookAt(dest.x, 0, dest.z);
    const step = () => { const t = Math.min(1, (performance.now() - t0) / dur); const e = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t; nurse.position.lerpVectors(from, dest, e); nurse.position.y = Math.abs(Math.sin(t * d * 6)) * 0.03; if (t < 1) requestAnimationFrame(step); else { nurse.position.y = 0; res(); } };
    step();
  });
}
let jabAnim = null, nurseSide = 0;
function jab(tx, ty) {
  return new Promise(res => {
    // 주사기는 카메라 기준 좌표로 움직임 (1인칭)
    const start = new THREE.Vector3(tx * 1.6 + nurseSide * 0.5, ty * 1.6 + 0.3, -0.9); const end = new THREE.Vector3(tx, ty, -0.38);
    const t0 = performance.now(); const dur = 420;
    jabAnim = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const p = t < 0.7 ? t / 0.7 : 1 - (t - 0.7) / 0.3 * 0.6; // 다가왔다가 살짝 물러남
      const pos = start.clone().lerp(end, Math.min(1, p)); pos.applyMatrix4(camera.matrixWorld); syringe.position.copy(pos);
      syringe.quaternion.copy(camera.quaternion); syringe.rotateX(-Math.PI / 2 + 0.5); syringe.rotateZ(0.3);
      if (t >= 0.7 && !jabAnim.hit) { jabAnim.hit = true; tick(); jolt(); const wp = end.clone().applyMatrix4(camera.matrixWorld); for (let i = 0; i < 4; i++) spark(wp); }
      if (t < 1) return; jabAnim = null; res();
    };
  });
}
let joltT = 0; function jolt() { joltT = 1; }
function coolFade(to) { const from = coolPack.material.opacity; const t0 = performance.now(); const step = () => { const t = Math.min(1, (performance.now() - t0) / 1400); coolPack.material.opacity = lerp(from, to * 0.55, t); if (t < 1) requestAnimationFrame(step); }; step(); }
function startRest() {
  $('#cool').hidden = false; let s = 600; const el = $('#timer');
  const f = () => { el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); if (s <= 0) { clearInterval(coolTimer); say('이제 일어나셔도 돼요.', 4000); } s--; };
  f(); clearInterval(coolTimer); coolTimer = setInterval(f, 1000);
}

/* ---------- UI ---------- */
function say(t, ms = 2400) { const s = $('#say'); s.textContent = t; s.hidden = false; clearTimeout(say.t); if (ms) say.t = setTimeout(() => { s.hidden = true; }, ms); }
function toast(t) { const s = $('#toast'); s.textContent = t; s.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { s.hidden = true; }, 1800); }
BOOSTERS.forEach(b => { const el = document.createElement('button'); el.className = 'booster'; el.innerHTML = `<b></b><span></span><i>${b.shots} SHOTS</i>`; el.querySelector('b').textContent = b.n; el.querySelector('span').textContent = b.d; el.onclick = () => inject(b); $('#boosters').appendChild(el); });
$('#standup').onclick = standUp; $('#getup').onclick = standUp;
$('#shots b').textContent = shotsTotal;
$('#kakao').href = CFG.kakao || '#';
$('#nick').value = randomName();
$('#mute').setAttribute('aria-pressed', muted);
$('#mute').onclick = () => { muted = !muted; $('#mute').setAttribute('aria-pressed', muted); try { localStorage.setItem('lineon.muted', muted ? '1' : '0'); } catch (e) {} audioApply(); };
$('#enter').onclick = () => {
  me.name = ($('#nick').value.trim() || randomName()).slice(0, 12); setAvatarName(myAvatar, me.name);
  $('#entry').classList.add('out'); setTimeout(() => { $('#entry').hidden = true; }, 900);
  audioStart(); net.connect();
};

/* ---------- 오디오 ---------- */
let ac, bgm, bgmGain;
function audioStart() {
  if (ac) { ac.resume().catch(() => {}); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)(); ac.resume().catch(() => {});
  bgmGain = ac.createGain(); bgmGain.gain.value = 0; bgmGain.connect(ac.destination);
  if (CFG.bgm) {
    bgm = new Audio(CFG.bgm); bgm.loop = true; bgm.crossOrigin = 'anonymous';
    bgm.addEventListener('canplay', () => { try { const src = ac.createMediaElementSource(bgm); src.connect(bgmGain); bgm.play().catch(() => {}); audioApply(); } catch (e) {} }, { once: true });
    bgm.addEventListener('error', () => { bgm = null; }, { once: true });
    bgm.load();
  }
  document.addEventListener('pointerdown', () => ac.resume().catch(() => {}), { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ac.resume().catch(() => {}); });
}
function audioApply() { if (!bgmGain) return; bgmGain.gain.linearRampToValueAtTime(muted ? 0 : 0.35, ac.currentTime + 0.8); }
function tick() {
  if (!ac || muted) return;
  const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle';
  o.frequency.setValueAtTime(880, ac.currentTime); o.frequency.exponentialRampToValueAtTime(220, ac.currentTime + .08);
  g.gain.setValueAtTime(.18, ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .14);
  o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + .15);
}

/* ---------- 네트워크 (Supabase Realtime) ---------- */
const peers = new Map(); // id -> {avatar, data, tx, tz, try}
const net = {
  sb: null, ch: null, room: 1, lastPos: 0, dirty: false,
  async connect() {
    if (!window.supabase || !CFG.supabaseUrl || !CFG.supabaseKey) { $('#count b').textContent = '1'; return; }
    try { this.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { realtime: { params: { eventsPerSecond: 12 } } }); } catch (e) { return; }
    this.join(1);
  },
  join(n) {
    if (this.ch) { try { this.sb.removeChannel(this.ch); } catch (e) {} }
    this.room = n; $('#roomname').textContent = n === 1 ? '시술실' : `시술실 ${n}`;
    const ch = this.sb.channel(`lineon-room-${n}`, { config: { presence: { key: me.id }, broadcast: { self: false, ack: false } } });
    this.ch = ch;
    ch.on('presence', { event: 'sync' }, () => this.sync());
    ch.on('broadcast', { event: 'pos' }, ({ payload }) => { const p = peers.get(payload.id); if (p) { p.tx = payload.x; p.tz = payload.z; p.try = payload.ry; } });
    this.checked = false;
    ch.subscribe(async status => { if (status === 'SUBSCRIBED') await this.track(); });
  },
  payload() { return { id: me.id, name: me.name, color: me.color, x: +me.x.toFixed(2), z: +me.z.toFixed(2), ry: +me.ry.toFixed(2), bed: me.bed, state: me.state, t: Date.now() }; },
  async track() { if (!this.ch) return; try { await this.ch.track(this.payload()); } catch (e) {} },
  push() { this.track(); },
  pos() { // 이동 중 위치 브로드캐스트 (초당 ~8회)
    if (!this.ch) return; const now = performance.now(); if (now - this.lastPos < 120) return; this.lastPos = now;
    try { this.ch.send({ type: 'broadcast', event: 'pos', payload: { id: me.id, x: +me.x.toFixed(2), z: +me.z.toFixed(2), ry: +me.ry.toFixed(2) } }); } catch (e) {}
  },
  sync() {
    const st = this.ch.presenceState(); const ids = new Set();
    // 첫 동기화에서 정원 초과면 다음 방으로 이동
    if (!this.checked) { this.checked = true; const others = Object.keys(st).filter(k => k !== me.id).length; if (others >= (CFG.roomCapacity || 40) && this.room < 20) { this.join(this.room + 1); return; } }
    for (const key of Object.keys(st)) {
      const d = st[key][st[key].length - 1]; if (!d || d.id === me.id) continue; ids.add(d.id);
      let p = peers.get(d.id);
      if (!p) { const av = makeAvatar({ color: safeColor(d.color), name: String(d.name || '').slice(0, 12) }); av.position.set(+d.x || 0, 0, +d.z || 0); scene.add(av); p = { avatar: av, data: d, tx: +d.x || 0, tz: +d.z || 0, try: +d.ry || 0 }; peers.set(d.id, p); }
      p.data = d; p.tx = +d.x || p.tx; p.tz = +d.z || p.tz; p.try = +d.ry || p.try;
      applyPeerPose(p);
    }
    for (const [id, p] of peers) if (!ids.has(id)) { scene.remove(p.avatar); peers.delete(id); const b = beds.find(b => b.occupant === id); if (b) b.occupant = null; }
    $('#count b').textContent = String(Object.keys(st).length || 1);
  },
};
function safeColor(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c)) ? c : '#EA660D'; }
function applyPeerPose(p) {
  const d = p.data; const bedIdx = Number.isInteger(d.bed) ? d.bed : -1;
  // 베드 점유 갱신
  beds.forEach(b => { if (b.occupant === d.id && beds.indexOf(b) !== bedIdx) b.occupant = null; });
  if (bedIdx >= 0 && beds[bedIdx]) {
    const b = beds[bedIdx]; if (!b.occupant) b.occupant = d.id;
    poseLying(p.avatar, b); p.avatar.userData.label.visible = true;
    p.lying = true;
  } else if (p.lying) { poseStanding(p.avatar); p.lying = false; }
  if (p.avatar.userData.name !== d.name) { setAvatarName(p.avatar, String(d.name || '').slice(0, 12)); p.avatar.userData.name = d.name; if (p.lying) p.avatar.userData.label.position.set(0, -0.2, -0.9); }
}

/* ---------- 루프 ---------- */
let last = performance.now();
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;

  // 내 이동
  if (me.state === 'walk' && walk.target) {
    const dx = walk.target.x - me.x, dz = walk.target.z - me.z; const d = Math.hypot(dx, dz);
    if (d < 0.08) { me.x = walk.target.x; me.z = walk.target.z; const then = walk.target.then; walk.target = null; me.state = 'idle'; net.push(); if (then) then(); }
    else { const sp = 2.2 * dt; me.x += dx / d * sp; me.z += dz / d * sp; me.ry = Math.atan2(dx, dz); net.pos(); }
    myAvatar.position.set(me.x, Math.abs(Math.sin(now * 0.012)) * 0.03, me.z);
    myAvatar.rotation.y = lerpAngle(myAvatar.rotation.y, me.ry, 0.2);
  } else if (me.state === 'idle') { myAvatar.position.y = Math.sin(now * 0.002) * 0.006; }

  // 다른 사람 보간
  for (const p of peers.values()) {
    if (p.lying) continue;
    p.avatar.position.x = lerp(p.avatar.position.x, p.tx, 0.12); p.avatar.position.z = lerp(p.avatar.position.z, p.tz, 0.12);
    p.avatar.rotation.y = lerpAngle(p.avatar.rotation.y, p.try, 0.15);
    const moving = Math.hypot(p.tx - p.avatar.position.x, p.tz - p.avatar.position.z) > 0.05;
    p.avatar.position.y = moving ? Math.abs(Math.sin(now * 0.012)) * 0.03 : 0;
  }

  // 베드 하이라이트 (빈 베드만)
  beds.forEach(b => { const target = (me.state === 'idle' || me.state === 'walk') && !b.occupant ? 0.35 + Math.sin(now * 0.003) * 0.15 : 0; b.ring.material.opacity = lerp(b.ring.material.opacity, target, 0.1); });

  // 카메라
  const lying = me.state === 'lying' || me.state === 'injecting' || me.state === 'cooling';
  const fovT = lying ? 62 : 50; if (Math.abs(camera.fov - fovT) > 0.1) { camera.fov = lerp(camera.fov, fovT, 0.1); camera.updateProjectionMatrix(); }
  if (!lying) {
    cam.target.lerp(new THREE.Vector3(me.x, 1.0, me.z), 0.12);
    const px = cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, pz = cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist, py = cam.target.y + Math.sin(cam.pitch) * cam.dist;
    camera.position.lerp(new THREE.Vector3(px, clamp(py, 0.6, ROOM.h + 4), pz), 0.12); // 벽은 안쪽면만 그려서 바깥에서 들여다볼 수 있음
    camera.lookAt(cam.target);
  } else {
    const b = beds[currentBed];
    const eye = new THREE.Vector3(b.x, 0.98, b.z - 0.82);
    camera.position.lerp(eye, 0.12);
    // 천장을 보되 드래그로 살짝 둘러보기
    const look = nurseSide
      ? new THREE.Vector3(eye.x + nurseSide * 2.2 + lookYaw * 1.2, eye.y + 1.4, eye.z - 0.5 + lookPitch * 1.6)
      : new THREE.Vector3(eye.x + lookYaw * 1.6, eye.y + 3, eye.z - 0.9 + lookPitch * 2.2);
    const q = new THREE.Quaternion(); const m = new THREE.Matrix4().lookAt(camera.position, look, new THREE.Vector3(0, 0, -1)); q.setFromRotationMatrix(m); camera.quaternion.slerp(q, 0.16);
    if (joltT > 0) { camera.position.y += Math.sin(joltT * 20) * 0.006 * joltT; joltT = Math.max(0, joltT - dt * 5); }
  }
  camera.updateMatrixWorld();
  if (jabAnim) jabAnim();

  // 입자
  for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.userData.t += dt; s.position.addScaledVector(s.userData.v, dt); s.material.opacity = 1 - s.userData.t / 0.5; s.scale.setScalar(1 + s.userData.t * 2); if (s.userData.t > 0.5) { scene.remove(s); sparks.splice(i, 1); } }

  // 라벨은 항상 카메라 쪽 (스프라이트라 자동) — 누운 사람 라벨 위치 보정은 포즈에서 처리
  renderer.render(scene, camera);
}
function lerpAngle(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; }

buildRoom(); buildBeds();
requestAnimationFrame(animate);
setTimeout(() => $('#hint').classList.add('fade'), 14000);
