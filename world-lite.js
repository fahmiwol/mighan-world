/*
 * @mighan/world-lite — renderer dunia isometrik "lite" untuk customer.
 *
 * PENTING: file ini SENGAJA tidak tahu apa-apa soal AgentBrain / LLM / ops logic.
 * Ia hanya: (1) render scene dari JSON deklaratif, (2) drag-drop tile, (3) emit event.
 *
 * NPC = model glTF rigged + animasi idle (game NPC beneran), bukan box/billboard.
 * Demo model: three.js RobotExpressive (CC0). Produksi: Quaternius Universal Base
 * Characters (CC0, recolor + part-swap) + Tripo3D (premium custom). RPM sudah mati 2026.
 * Style world disetel mirip ops.mighan.com (isometrik dark-cyberpunk + neon).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { ChibiAvatarBuilder } from './chibi-avatar-builder.js';   // chibi kanonik (sama dgn Avatar Studio + ops)
import { ObjectBuilder } from './object-builder.js';              // objek dari spec primitif (Asset Studio)
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// base API generatif (library avatar/asset). dev lokal → ops.mighan.com; di mighan.com → relative
const GEN_BASE = /localhost|127\.0\.0\.1|:8\d{3}/.test(location.host) ? 'https://ops.mighan.com' : '';

const PALETTE = {
  desk: { color: 0x4a7bd8, h: 0.4 }, chair: { color: 0xd85a8a, h: 0.5 },
  plant: { color: 0x3ddc84, h: 0.7 }, board: { color: 0xffc955, h: 0.9 },
  portal: { color: 0x33d6e0, h: 0.6 }, shelf: { color: 0x9a7b4f, h: 1.0 },
};
// model NPC rigged+animasi low-poly (CC0). Default = manusia (cocok dgn portrait chibi-human
// di hire panel). Alternatif mascot bisa dipilih lewat avatar-customize (a.baseModel = key/URL).
// Per-agent likeness sebenarnya dari pipeline 2D→3D (Jadikan 3D) → setAgentModel(GLB).
const NPC_MODELS = {
  character: 'models/character.glb',  // Quaternius "Adventurer" (CC0) — default human NPC (textured, rigged, idle)
  bunny:     'models/bunny.glb',      // Quaternius "Platformer" (CC0) — maskot chibi lucu (alt)
  mako:      'models/mako.glb',       // Quaternius "Mako" (CC0) — makhluk hiu stylized (alt)
  robot: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
};

// Bounding box ANDAL untuk model rigged. THREE.Box3.setFromObject SALAH-ukur skinned mesh
// dengan armature scale 100× (Quaternius) — ia ikut menghitung posisi node tulang sehingga box
// jadi ~73u → model auto-scale menyusut jadi speck tak terlihat. Helper ini hanya mengukur
// GEOMETRY bind-pose tiap mesh × world-matrix (abaikan node tulang).
// CATATAN: SENGAJA TIDAK pakai SkinnedMesh.computeBoundingBox() — saat load (skeleton belum
// di-pose, model belum di-scene) ia menghasilkan box meledak/NaN dan ikut merusak geometry.boundingBox.
// Geometry bind-pose bersifat pose-independent → stabil & cukup akurat (~1.5u utk Quaternius).
function measureMeshBox(obj) {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  let found = false;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    if (!bb || !isFinite(bb.min.y) || !isFinite(bb.max.y)) return;
    tmp.copy(bb).applyMatrix4(o.matrixWorld);
    if (isFinite(tmp.min.y) && isFinite(tmp.max.y) && tmp.max.y > tmp.min.y) { box.union(tmp); found = true; }
  });
  return found ? box : new THREE.Box3().setFromObject(obj);  // fallback model non-mesh aneh
}

export class WorldLite {
  constructor(container, opts = {}) {
    this.container = container;
    this.mode = opts.mode || 'view';
    this._bloom = opts.bloom === true;   // post-fx bloom opt-in (mahal di low-end; IBL tetap selalu nyala)
    this.tile = 1; this.grid = { w: 12, h: 12 };
    this.objects = []; this.agents = [];
    this._tiles = {}; this._zones = []; this._paint = null; this._zone = null; this._zoneA = null;   // S4(B) floor painter + zones
    this._tickFns = [];   // per-frame hooks (t, dt) — e.g. city-hero walking NPCs
    this.placing = null; this._cbs = {}; this._mixers = []; this._modelCache = {};
    this._clock = new THREE.Clock();
    this._initThree();
    this._raycaster = new THREE.Raycaster();
    window.addEventListener('resize', () => this._resize());
    this._loop();
  }

  on(evt, cb) { (this._cbs[evt] = this._cbs[evt] || []).push(cb); return this; }
  _emit(evt, detail) {
    (this._cbs[evt] || []).forEach((cb) => { try { cb(detail); } catch (e) {} });
    try { window.parent && window.parent.postMessage({ source: 'world-lite', evt, detail }, '*'); } catch (e) {}
  }

  _initThree() {
    const w = this.container.clientWidth || 800, h = this.container.clientHeight || 500;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08081a);          // dark cyberpunk (match ops)
    this.scene.fog = new THREE.Fog(0x08081a, 22, 46);
    const aspect = w / h, d = 9;
    this.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 100);
    this.camera.position.set(12, 12, 12); this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;     // match ops grading
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false; this.controls.minZoom = 0.5; this.controls.maxZoom = 2.5;
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.scene.add(new THREE.AmbientLight(0x5566aa, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1); dir.position.set(8, 16, 6); dir.castShadow = true; this.scene.add(dir);
    this.scene.add(this._neon(0x00f5ff, -6, 4, -6));            // cyan neon
    this.scene.add(this._neon(0x9b59b6, 7, 4, 5));              // purple neon
    this.renderer.domElement.addEventListener('click', (e) => this._onClick(e));
    // IBL studio environment → PBR reflections (no external asset)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    // post-processing bloom — OPT-IN (opts.bloom). Mahal di low-end/mobile/headless,
    // jadi default OFF; IBL + tone mapping + PBR sudah kasih look pro tanpa ini.
    if (this._bloom) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(Math.max(256, (w / 2) | 0), Math.max(256, (h / 2) | 0)), 0.45, 0.6, 0.82));
      this.composer.addPass(new OutputPass());
    }
  }
  _neon(color, x, y, z) { const l = new THREE.PointLight(color, 0.6, 30); l.position.set(x, y, z); return l; }

  _ndc(cx, cy) { const r = this.renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); }
  _tileFromPoint(cx, cy) {
    this._raycaster.setFromCamera(this._ndc(cx, cy), this.camera);
    const hit = this._raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (!hit) return null;
    const half = this.grid.w / 2, tx = Math.floor(hit.x + half), ty = Math.floor(hit.z + half);
    if (tx < 0 || ty < 0 || tx >= this.grid.w || ty >= this.grid.h) return null;
    return [tx, ty];
  }
  _world(tile, y = 0) { return new THREE.Vector3(tile[0] - this.grid.w / 2 + 0.5, y, tile[1] - this.grid.h / 2 + 0.5); }

  loadScene(scene) {
    scene = scene || {};
    // clear existing scene dulu (idempotent) — biar load ulang/dua-kali tak menumpuk objek
    this.objects.forEach((x) => { if (x.mesh) this.scene.remove(x.mesh); }); this.objects = [];
    this.agents.forEach((x) => { if (x.grp.userData && x.grp.userData.mixer) this._mixers = this._mixers.filter((m) => m !== x.grp.userData.mixer); this.scene.remove(x.grp); }); this.agents = [];
    this.grid = scene.grid || this.grid;
    if (scene.theme && scene.theme.bg) { const c = new THREE.Color(scene.theme.bg); this.scene.background = c; if (this.scene.fog) this.scene.fog.color = c; }
    this._buildFloor(scene.theme || {});
    this._clearTiles(); this._clearZones();
    (scene.floors || []).forEach((f) => this.paintTile(f.tile, f.color, true));
    (scene.zones || []).forEach((z) => this.addZone(z, true));
    (scene.objects || []).forEach((o) => this.placeObject(o, true));
    (scene.agents || []).forEach((a) => this.placeAgent(a, true));
    this._emit('scene:loaded', { objects: this.objects.length, agents: this.agents.length });
    return this;
  }
  _buildFloor(theme) {
    if (this._floor) this.scene.remove(this._floor);
    const g = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(this.grid.w, this.grid.h), new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.floor || 0x14182a), metalness: 0.35, roughness: 0.55 }));
    plane.rotation.x = -Math.PI / 2; plane.receiveShadow = true; g.add(plane);
    const grid = new THREE.GridHelper(this.grid.w, this.grid.w, 0x00f5ff, 0x222a44); grid.position.y = 0.01; g.add(grid);
    this._floor = g; this.scene.add(g);
  }

  // ═══════ S4(B): FLOOR PAINTER + ZONES ═══════
  _tileKey(t) { return t[0] + ',' + t[1]; }
  setPaint(color) { this._paint = color || null; this._zone = null; this._zoneA = null; }   // color | '__erase__' | null
  setZone(opts) { this._zone = opts || null; this._zoneA = null; this._paint = null; }       // {color,label} | null
  paintTile(tile, color, silent) {
    const k = this._tileKey(tile); let rec = this._tiles[k];
    if (!rec) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: 0.2, roughness: 0.75, emissive: new THREE.Color(color).multiplyScalar(0.12) }));
      m.rotation.x = -Math.PI / 2; m.position.copy(this._world(tile, 0.02)); m.receiveShadow = true; m.userData = { kind: 'floor' };
      this.scene.add(m); rec = this._tiles[k] = { mesh: m, color };
    } else { rec.color = color; rec.mesh.material.color.set(color); rec.mesh.material.emissive.set(new THREE.Color(color).multiplyScalar(0.12)); }
    if (!silent) this._emit('paint', { tile, color });
    return rec;
  }
  clearTile(tile) { const k = this._tileKey(tile), rec = this._tiles[k]; if (!rec) return; this.scene.remove(rec.mesh); delete this._tiles[k]; }
  _clearTiles() { Object.keys(this._tiles).forEach((k) => this.scene.remove(this._tiles[k].mesh)); this._tiles = {}; }
  _rectFromCorners(a, b) { const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]); return { x, y, w: Math.abs(a[0] - b[0]) + 1, h: Math.abs(a[1] - b[1]) + 1 }; }
  addZone(z, silent) {
    const grp = new THREE.Group();
    const cx = z.x + z.w / 2 - this.grid.w / 2, cz = z.y + z.h / 2 - this.grid.h / 2;
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.h), new THREE.MeshBasicMaterial({ color: new THREE.Color(z.color || 0x00f5ff), transparent: true, opacity: 0.16, depthWrite: false }));
    fill.rotation.x = -Math.PI / 2; fill.position.set(cx, 0.03, cz); grp.add(fill);
    if (z.label) { const s = this._zoneSprite(z.label, z.color); s.position.set(cx, 1.7, cz); grp.add(s); }
    grp.userData = { kind: 'zone' }; this.scene.add(grp);
    this._zones.push({ x: z.x, y: z.y, w: z.w, h: z.h, color: z.color, label: z.label, grp });
    if (!silent) this._emit('zone:add', z);
  }
  removeLastZone() { const z = this._zones.pop(); if (z) this.scene.remove(z.grp); }
  _clearZones() { this._zones.forEach((z) => this.scene.remove(z.grp)); this._zones = []; }
  _zoneSprite(text, color) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d');
    x.fillStyle = 'rgba(8,10,22,0.78)'; x.fillRect(0, 0, 256, 64);
    x.strokeStyle = color || '#00f5ff'; x.lineWidth = 3; x.strokeRect(2, 2, 252, 60);
    x.fillStyle = '#eaf2ff'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(text).slice(0, 16), 128, 34);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true })); s.scale.set(2.4, 0.6, 1); return s;
  }

  placeObject(o, silent) {
    let mesh;
    if (o.spec && Array.isArray(o.spec.parts)) {          // objek hasil Asset Studio (primitif)
      mesh = ObjectBuilder.build(o.spec);
      mesh.position.copy(this._world(o.tile, 0));
      mesh.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    } else {                                              // objek palet sederhana (box)
      const def = PALETTE[o.type] || { color: 0x888888, h: 0.5 };
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, def.h, 0.7), new THREE.MeshStandardMaterial({ color: o.color != null ? o.color : def.color, emissive: new THREE.Color(o.color != null ? o.color : def.color).multiplyScalar(0.18), metalness: 0.35, roughness: 0.45 }));
      mesh.position.copy(this._world(o.tile, def.h / 2)); mesh.castShadow = true;
    }
    mesh.userData = { kind: 'object', ref: o };
    this.scene.add(mesh); this.objects.push({ o, mesh });
    if (!silent) this._emit('place', { kind: 'object', type: o.type || 'custom', tile: o.tile });
    return mesh;
  }

  // sprite portrait avatar + label nama (melayang di atas model)
  _label(text) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const x = cv.getContext('2d'); x.fillStyle = 'rgba(8,10,26,.8)'; x.fillRect(0, 0, 256, 64);
    x.fillStyle = '#33d6e0'; x.font = 'bold 30px Segoe UI, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text || '', 128, 32);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true })); s.scale.set(1.4, 0.35, 1); return s;
  }

  // terima key preset (NPC_MODELS) ATAU URL GLB langsung → bisa drop base chibi/low-poly custom
  _loadModel(keyOrUrl) {
    var url = NPC_MODELS[keyOrUrl] || keyOrUrl;
    if (this._modelCache[url]) return this._modelCache[url];
    this._modelCache[url] = new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));
    return this._modelCache[url];
  }

  // appearance chibi acak-deterministik dari seed (id/nama) → NPC marketplace tampil variatif
  _seedAppearance(seed) {
    const SK = ['#ffdbac','#f1c27d','#e0ac69','#c68642','#8d5524','#d4a5a5','#c8956c','#e8b88a'];
    const HR = ['#2a1a00','#4a2000','#1a0a00','#8B4513','#c0c0c0','#ff69b4','#7c3aed','#800020','#d4a017'];
    const SH = ['#7c3aed','#06b6d4','#f59e0b','#ef4444','#10b981','#3b82f6','#ec4899','#14b8a6'];
    const PA = ['#1e293b','#334155','#0f172a','#1e3a5f','#374151','#312e81'];
    const ST = ['default','long','ponytail','mohawk'];
    let h = 0; const s = String(seed || 'npc'); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return { skin: SK[h % SK.length], hair: HR[(h >> 3) % HR.length], shirt: SH[(h >> 6) % SH.length], pants: PA[(h >> 9) % PA.length], hairStyle: ST[(h >> 12) % ST.length] };
  }

  placeAgent(a, silent) {
    const grp = new THREE.Group(); grp.position.copy(this._world(a.tile, 0));
    // base ring (warna identitas agent)
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.06, 24), new THREE.MeshStandardMaterial({ color: a.color != null ? a.color : 0x33d6e0, emissive: new THREE.Color(a.color != null ? a.color : 0x33d6e0).multiplyScalar(0.5) }));
    grp.add(ring);
    // portrait billboard HANYA kalau ada avatarUrl (chibi 3D = avatar utama)
    let portrait = null;
    if (a.avatarUrl) {
      portrait = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      portrait.position.y = 2.0; grp.add(portrait);
      new THREE.TextureLoader().load(a.avatarUrl, (t) => { portrait.material.map = t; portrait.material.needsUpdate = true; });
    }
    // label hanya bila ada nama — NPC anonim (walker dekorasi) tanpa chip gelap kosong
    let label = null;
    if (a.name) { label = this._label(a.name); label.position.y = a.avatarUrl ? 2.7 : 1.5; grp.add(label); }
    grp.userData = { kind: 'agent', ref: a, billboard: portrait, label };
    this.scene.add(grp); this.agents.push({ a, grp });

    if (a.baseModel) {
      // GLB path (Quaternius/robot/TripoSR/custom) — auto-scale + ground-align
      this._loadModel(a.baseModel).then((g) => {
        const model = skeletonClone(g.scene);
        const box = measureMeshBox(model), sz = new THREE.Vector3(); box.getSize(sz);
        model.scale.setScalar(1.4 / (sz.y || 1));
        const box2 = measureMeshBox(model); model.position.y = -box2.min.y + 0.03;
        model.traverse((m) => { if (m.isMesh) { m.castShadow = true; if (m.material && m.material.emissive) m.material.emissive = new THREE.Color(a.color != null ? a.color : 0x33d6e0).multiplyScalar(0.12); } });
        grp.add(model); grp.userData.model = model;
        if (g.animations && g.animations.length) {
          const mixer = new THREE.AnimationMixer(model);
          const idle = g.animations.find((c) => /idle/i.test(c.name)) || g.animations[0];
          if (idle) mixer.clipAction(idle).play();
          this._mixers.push(mixer); grp.userData.mixer = mixer;
        }
      }).catch(() => {/* fallback: ring saja */});
    } else {
      // DEFAULT: chibi kanonik dari appearance (sama persis dgn Avatar Studio & dunia ops)
      const chibi = ChibiAvatarBuilder.build(a.appearance || this._seedAppearance(a.id || a.name));
      chibi.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      grp.add(chibi); grp.userData.model = chibi;
      grp.userData.bob = true; grp.userData.bobPhase = Math.random() * 6.28;   // idle bob biar hidup
    }

    if (!silent) this._emit('place', { kind: 'agent', id: a.id, tile: a.tile });
    return grp;
  }

  // ── Library: spawn dari aset/avatar yang disimpan di /api/gen/* (studio → world) ──
  async placeAgentFromLibrary(id, tile, extra) {
    try {
      const r = await fetch(GEN_BASE + '/api/gen/avatar/' + encodeURIComponent(id)); const d = await r.json();
      if (d.ok && d.rec) return this.placeAgent(Object.assign({ id: 'lib_' + id, name: d.rec.name || 'NPC', tile: tile, appearance: d.rec.appearance }, extra || {}));
    } catch (e) {}
    return null;
  }
  async placeObjectFromLibrary(id, tile, extra) {
    try {
      const r = await fetch(GEN_BASE + '/api/gen/asset/' + encodeURIComponent(id)); const d = await r.json();
      if (d.ok && d.rec && d.rec.spec) return this.placeObject(Object.assign({ type: 'custom', tile: tile, spec: d.rec.spec, name: d.rec.name }, extra || {}));
      if (d.ok && d.rec && d.rec.modelUrl) {                       // aset GLB (TripoSR) → muat sebagai objek
        const g = await this._loadModel((d.rec.modelUrl.charAt(0) === '/' ? GEN_BASE : '') + d.rec.modelUrl);
        const m = skeletonClone(g.scene); const box = measureMeshBox(m), sz = new THREE.Vector3(); box.getSize(sz);
        m.scale.setScalar(1.0 / (sz.y || 1)); m.position.copy(this._world(tile, 0)); const b2 = measureMeshBox(m); m.position.y = -b2.min.y;
        m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.scene.add(m); this.objects.push({ o: { type: 'custom', tile: tile, modelUrl: d.rec.modelUrl }, mesh: m }); return m;
      }
    } catch (e) {}
    return null;
  }

  // place ANY GLB url at a tile (e.g. result of /api/gen/model prompt→3D). Auto-scale + ground-align.
  async placeModelUrl(url, tile, meta) {
    try {
      const g = await this._loadModel(url);
      const m = skeletonClone(g.scene); const box = measureMeshBox(m), sz = new THREE.Vector3(); box.getSize(sz);
      const target = (meta && meta.height) || 2;                       // world-appropriate size (buildings ~2 units)
      m.scale.setScalar(target / (sz.y || 1)); m.position.copy(this._world(tile, 0));
      const b2 = measureMeshBox(m); m.position.y = -b2.min.y;
      m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(m); this.objects.push({ o: { type: 'custom', tile: tile, modelUrl: url, name: (meta && meta.name) || '' }, mesh: m });
      this._emit('object:add', { url, tile }); return m;
    } catch (e) { return null; }
  }

  // ── hire / customize ──
  startPlacing(p) { this.placing = p; this.renderer.domElement.style.cursor = 'copy'; }
  cancelPlacing() { this.placing = null; this.renderer.domElement.style.cursor = ''; }
  getAgent(id) { return this.agents.find((x) => x.a.id === id); }
  updateAgent(id, patch) { const e = this.getAgent(id); if (e) { Object.assign(e.a, patch); if (patch.name) { if (e.grp.userData.label) e.grp.remove(e.grp.userData.label); const l = this._label(patch.name); l.position.y = 2.7; e.grp.add(l); e.grp.userData.label = l; } this._emit('agent:update', { id, patch }); } }
  updateAgentAvatar(id, url) { const e = this.getAgent(id); if (!e) return; const bb = e.grp.userData.billboard; if (bb) new THREE.TextureLoader().load(url, (t) => { bb.material.map = t; bb.material.needsUpdate = true; }); e.a.avatarUrl = url; }
  removeAgent(id) { const e = this.getAgent(id); if (!e) return; if (e.grp.userData.mixer) this._mixers = this._mixers.filter((m) => m !== e.grp.userData.mixer); this.scene.remove(e.grp); this.agents = this.agents.filter((x) => x.a.id !== id); this._emit('agent:remove', { id }); }

  // Ganti model NPC dengan GLB custom (mis. hasil 2D→3D /api/gen/3d). Auto-scale + ground-align.
  setAgentModel(id, url) {
    var self = this, e = this.getAgent(id);
    if (!e) return Promise.reject(new Error('agent tidak ada'));
    return new Promise(function (res, rej) {
      new GLTFLoader().load(url, function (g) {
        var u = e.grp.userData;
        if (u.model) { e.grp.remove(u.model); }
        if (u.mixer) { self._mixers = self._mixers.filter(function (m) { return m !== u.mixer; }); }
        var m = g.scene;
        var box = measureMeshBox(m), sz = new THREE.Vector3(); box.getSize(sz);
        var s = 1.5 / (sz.y || 1); m.scale.setScalar(s);                 // normalkan tinggi ~1.5 unit
        var box2 = measureMeshBox(m); m.position.y = -box2.min.y + 0.03; // duduk di lantai
        m.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
        e.grp.add(m); u.model = m;
        if (g.animations && g.animations.length) {
          var mx = new THREE.AnimationMixer(m);
          var idle = g.animations.find(function (c) { return /idle/i.test(c.name); }) || g.animations[0];
          if (idle) mx.clipAction(idle).play();
          self._mixers.push(mx); u.mixer = mx;
        }
        e.a.modelUrl = url; self._emit('agent:model', { id: id, url: url }); res(true);
      }, undefined, function (err) { rej(err); });
    });
  }

  dropAt(cx, cy, payload) {
    if (this.mode !== 'build') return;
    const tile = this._tileFromPoint(cx, cy); if (!tile) return;
    if (payload.kind === 'agent') this.placeAgent({ id: payload.id || ('npc-' + Date.now().toString(36)), name: payload.name, tile, avatarUrl: payload.avatarUrl, color: payload.color, role: payload.role, persona: payload.persona, controllerModel: payload.controllerModel, executorModel: payload.executorModel, tools: payload.tools });
    else this.placeObject({ type: payload.type, tile, color: payload.color });
  }

  _onClick(e) {
    if (this.placing) {
      const tile = this._tileFromPoint(e.clientX, e.clientY);
      if (tile) { const p = this.placing; if (p.kind === 'agent') this.placeAgent({ id: p.id || ('npc-' + Date.now().toString(36)), name: p.name, tile, avatarUrl: p.avatarUrl, color: p.color, role: p.role, persona: p.persona, controllerModel: p.controllerModel, executorModel: p.executorModel, tools: p.tools }); else this.placeObject({ type: p.type, tile, color: p.color }); }
      this.cancelPlacing(); return;
    }
    // S4(B): zone (two-click rectangle) + paint modes intercept ground clicks
    if (this._zone) {
      const t = this._tileFromPoint(e.clientX, e.clientY); if (!t) return;
      if (!this._zoneA) { this._zoneA = t; this._emit('zone:corner', { tile: t }); }
      else { const z = this._rectFromCorners(this._zoneA, t); z.color = this._zone.color; z.label = this._zone.label; this.addZone(z); this._zoneA = null; this._emit('zone:done', z); }
      return;
    }
    if (this._paint) {
      const t = this._tileFromPoint(e.clientX, e.clientY); if (!t) return;
      if (this._paint === '__erase__') this.clearTile(t); else this.paintTile(t, this._paint);
      return;
    }
    this._raycaster.setFromCamera(this._ndc(e.clientX, e.clientY), this.camera);
    const hits = this._raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      let o = h.object; while (o && !o.userData.kind) o = o.parent;
      if (o && o.userData.kind === 'agent') { this._emit('agent:click', { id: o.userData.ref.id, name: o.userData.ref.name }); return; }
      if (o && o.userData.kind === 'object') { this._emit('object:click', { type: o.userData.ref.type, tile: o.userData.ref.tile }); return; }
    }
  }

  toJSON() { return { grid: this.grid, objects: this.objects.map((x) => x.o), agents: this.agents.map((x) => x.a), floors: Object.keys(this._tiles).map((k) => ({ tile: k.split(',').map(Number), color: this._tiles[k].color })), zones: this._zones.map((z) => ({ x: z.x, y: z.y, w: z.w, h: z.h, color: z.color, label: z.label })) }; }
  _resize() { const w = this.container.clientWidth, h = this.container.clientHeight, aspect = w / h, d = 9; this.camera.left = -d * aspect; this.camera.right = d * aspect; this.camera.top = d; this.camera.bottom = -d; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h); if (this.composer) this.composer.setSize(w, h); }
  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = this._clock.getDelta(); this._mixers.forEach((m) => m.update(dt));
    const t = this._clock.getElapsedTime();
    this.agents.forEach((x) => {
      const u = x.grp.userData;
      if (u.billboard) u.billboard.quaternion.copy(this.camera.quaternion);
      if (u.label) u.label.quaternion.copy(this.camera.quaternion);
      if (u.bob && u.model) u.model.position.y = Math.sin(t * 2 + (u.bobPhase || 0)) * 0.04;   // chibi idle bob
    });
    for (var ti = 0; ti < this._tickFns.length; ti++) { try { this._tickFns[ti](t, dt); } catch (e) {} }
    this.controls.update();
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  onTick(fn) { if (typeof fn === 'function') this._tickFns.push(fn); return this; }
}
