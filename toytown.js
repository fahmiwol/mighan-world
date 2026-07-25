/*
 * @mighan/toytown — komposer scene "toy island" di atas WorldLite.
 *
 * Style target (referensi Fahmi 2026-07-14): diorama pulau mainan malam hari —
 * bangunan rounded-bevel pastel jenuh, jendela glow hangat, neon sign, lampu jalan,
 * island base berlapis (rumput + tanah, sudut membulat), pohon chunky, bulan+bintang+awan,
 * air mancur glowing. Tema 'day' dipakai hero landing (terang, tanpa bloom).
 *
 * ADDITIVE: tidak menyentuh API WorldLite — hanya menambah objek ke wl.scene dan
 * mengganti rig lampu. Semua posisi pakai koordinat tile WorldLite (wl._world).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const THEMES = {
  night: {
    sky: 0x16163a, fogNear: 30, fogFar: 60,
    hemiSky: 0x7a7ac0, hemiGround: 0x232345, hemiInt: 0.38,
    moonColor: 0xaab6f0, moonInt: 0.7,
    ambient: 0x3a3a68, ambientInt: 0.38,
    grass: 0x5da84e, grassEdge: 0x4c9440, dirt: 0x84644a, dirtDark: 0x644834,
    road: 0x3c3c50, sidewalk: 0x9a8c74, roadMark: 0xd8d8c8,
    windowOn: 0xffd98a, windowEmissive: 0xffc966, windowInt: 1.7,
    lampGlow: 0xffd9a0, exposure: 1.3, bloom: true,
  },
  day: {
    sky: null /* transparan (embed hero) */, fogNear: 0, fogFar: 0,
    hemiSky: 0xffffff, hemiGround: 0xcfeecf, hemiInt: 1.0,
    moonColor: 0xfff4e0, moonInt: 1.0,          // = matahari
    ambient: 0xffffff, ambientInt: 0.4,
    grass: 0x8fd97a, grassEdge: 0x76c464, dirt: 0x9a7a5c, dirtDark: 0x7d6046,
    road: 0x8b8ba0, sidewalk: 0xd8cdbd, roadMark: 0xffffff,
    windowOn: 0xfff4d2, windowEmissive: 0xffe6a0, windowInt: 0.35,
    lampGlow: 0xffe9c0, exposure: 1.35, bloom: false,
  },
};

export class ToyTown {
  constructor(wl, opts = {}) {
    this.wl = wl;
    this.theme = THEMES[opts.theme || 'night'];
    this.themeName = opts.theme || 'night';
    this.buildings = {};                 // key → { grp, def, door(world Vector3) }
    this._drift = [];                    // awan yang drift
    this._geo = {};                      // cache geometry shared
    this._mat = {};                      // cache material shared
    this._setupEnvironment(opts);
  }

  _w(tile, y = 0) { return this.wl._world(tile, y); }

  // ── environment: buang rig lampu default WorldLite, pasang rig tema ──
  _setupEnvironment(opts) {
    const wl = this.wl, T = this.theme;
    // lampu bawaan _initThree (ambient/dir/neon) tidak cocok tema → cabut semua Light
    const lights = [];
    wl.scene.traverse((o) => { if (o.isLight) lights.push(o); });
    lights.forEach((l) => l.parent && l.parent.remove(l));
    if (T.sky != null) {
      wl.scene.background = new THREE.Color(T.sky);
      wl.scene.fog = T.fogFar > 0 ? new THREE.Fog(T.sky, T.fogNear, T.fogFar) : null;
    } else { wl.scene.background = null; wl.scene.fog = null; try { wl.renderer.setClearColor(0x000000, 0); } catch (e) {} }
    wl.renderer.toneMappingExposure = T.exposure;
    wl.scene.environmentIntensity = this.themeName === 'night' ? 0.25 : 0.45;
    wl.scene.add(new THREE.HemisphereLight(T.hemiSky, T.hemiGround, T.hemiInt));
    wl.scene.add(new THREE.AmbientLight(T.ambient, T.ambientInt));
    const key = new THREE.DirectionalLight(T.moonColor, T.moonInt);   // bulan (night) / matahari (day)
    key.position.set(8, 14, 6); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const s = (this.wl.grid.w || 16) * 0.75;
    key.shadow.camera.left = -s; key.shadow.camera.right = s; key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
    key.shadow.camera.far = 50; key.shadow.bias = -0.0005;
    wl.scene.add(key);
    // grid helper bawaan (garis cyan) tidak cocok gaya toy — sembunyikan floor group lama
    if (wl._floor) wl._floor.visible = false;
    if (opts.island !== false) this._island();
  }

  // ── island base: slab rumput rounded + lapisan tanah (referensi: pulau melayang) ──
  _island() {
    const T = this.theme, G = this.wl.grid, pad = 0.9;
    const g = new THREE.Group();
    const grass = new THREE.Mesh(
      new RoundedBoxGeometry(G.w + pad, 0.5, G.h + pad, 4, 0.18),
      new THREE.MeshStandardMaterial({ color: T.grass, roughness: 0.95, metalness: 0 }));
    grass.position.y = -0.25; grass.receiveShadow = true; g.add(grass);
    const dirt = new THREE.Mesh(
      new RoundedBoxGeometry(G.w + pad - 0.25, 0.85, G.h + pad - 0.25, 4, 0.22),
      new THREE.MeshStandardMaterial({ color: T.dirt, roughness: 1 }));
    dirt.position.y = -0.85; g.add(dirt);
    const bottom = new THREE.Mesh(
      new RoundedBoxGeometry(G.w + pad - 0.7, 0.5, G.h + pad - 0.7, 4, 0.2),
      new THREE.MeshStandardMaterial({ color: T.dirtDark, roughness: 1 }));
    bottom.position.y = -1.45; g.add(bottom);
    this.wl.scene.add(g); this.islandGroup = g;
    return g;
  }

  // ── material/geometry shared ──
  _windowMat() {
    if (!this._mat.win) this._mat.win = new THREE.MeshStandardMaterial({
      color: this.theme.windowOn, emissive: this.theme.windowEmissive,
      emissiveIntensity: this.theme.windowInt, roughness: 0.4 });
    return this._mat.win;
  }
  _windowDimMat() {                                    // jendela "mati" — variasi hidup
    if (!this._mat.winDim) this._mat.winDim = new THREE.MeshStandardMaterial({
      color: 0x2e3450, emissive: 0x38406a, emissiveIntensity: 0.25, roughness: 0.5 });
    return this._mat.winDim;
  }
  _windowGeo() {
    if (!this._geo.win) this._geo.win = new RoundedBoxGeometry(0.26, 0.3, 0.05, 2, 0.06);
    return this._geo.win;
  }

  // sprite glow radial (murah, additive) — halo lampu/bulan/air mancur tanpa light nyata
  _glowSprite(hex, size, opacity) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const x = cv.getContext('2d'), c = new THREE.Color(hex);
    const grd = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    const rgb = (a) => `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`;
    grd.addColorStop(0, rgb(opacity != null ? opacity : 0.85)); grd.addColorStop(0.4, rgb(0.25)); grd.addColorStop(1, rgb(0));
    x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending }));
    sp.scale.setScalar(size || 1); return sp;
  }

  // papan neon: teks glow di plakat rounded gelap (canvas texture, toneMapped off → nendang di bloom).
  // Teks HARUS terbaca dari zoom default → font besar memenuhi plakat.
  _neonSign(text, hex, w) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
    const x = cv.getContext('2d'), col = '#' + new THREE.Color(hex).getHexString();
    x.fillStyle = 'rgba(16,12,30,0.94)';
    if (x.roundRect) { x.beginPath(); x.roundRect(4, 4, 504, 152, 30); x.fill(); }
    else x.fillRect(4, 4, 504, 152);
    x.strokeStyle = col; x.lineWidth = 6; x.shadowColor = col; x.shadowBlur = 16;
    if (x.roundRect) { x.beginPath(); x.roundRect(12, 12, 488, 136, 24); x.stroke(); }
    let fs = 108; x.font = '900 ' + fs + 'px "Segoe UI", Arial, sans-serif';
    while (x.measureText(text).width > 450 && fs > 40) { fs -= 6; x.font = '900 ' + fs + 'px "Segoe UI", Arial, sans-serif'; }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowBlur = 30; x.fillStyle = '#ffffff'; x.strokeStyle = col; x.lineWidth = 3;
    x.fillText(text, 256, 84); x.shadowBlur = 0; x.strokeText(text, 256, 84);
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w || 1.1, (w || 1.1) * 160 / 512),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    return m;
  }

  // ── bangunan toy: body rounded + jendela glow grid + roof cap + awning + sign + prop atap ──
  // def: { key, tile:[x,y], w,d,h, color, accent, sign, roof:'flat'|'dome', prop:'gem'|'star'|'antenna',
  //        windows:{cols,rows}, door:true, link:{label,href,desc} }
  building(def) {
    const T = this.theme, grp = new THREE.Group();
    const w = def.w || 1.4, d = def.d || 1.4, h = def.h || 2.0;
    const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.12, w * 0.09)),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.85, metalness: 0.02 }));
    body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true; grp.add(body);

    // jendela grid glow (depan + samping kiri/kanan) — RoundedBox tipis emissive,
    // sebagian "mati" (seeded dari posisi) biar hidup; sisakan band atas utk sign
    const win = def.windows || { cols: Math.max(2, Math.round(w / 0.62)), rows: Math.max(2, Math.round(h / 0.95)) };
    const wm = this._windowMat(), wmDim = this._windowDimMat(), wg = this._windowGeo();
    const yTop = def.sign ? 0.62 : 0.78;
    let seed = 0; for (const ch of String(def.key || def.sign || 'b')) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const face = (nx, nz, span, fi) => {
      for (let r = 0; r < win.rows; r++) for (let c = 0; c < win.cols; c++) {
        const lit = ((seed >> ((r * win.cols + c + fi * 5) % 28)) & 3) !== 0;   // ~75% nyala
        const m = new THREE.Mesh(wg, lit ? wm : wmDim);
        const u = (c + 0.5) / win.cols - 0.5;
        const y = h * (0.3 + (yTop - 0.3) * (win.rows > 1 ? r / (win.rows - 1) : 0.5));
        if (nz) m.position.set(u * span * 0.78, y, nz * (d / 2 + 0.01));
        else { m.position.set(nx * (w / 2 + 0.01), y, u * span * 0.78); m.rotation.y = Math.PI / 2; }
        grp.add(m);
      }
    };
    face(0, 1, w, 0); face(1, 0, d, 1); face(-1, 0, d, 2);

    // roof: flat cap gelap rounded ATAU kubah emas (bank)
    if (def.roof === 'dome') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(Math.min(w, d) * 0.52, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xd8a84e, roughness: 0.35, metalness: 0.55, emissive: 0x6a4a10, emissiveIntensity: this.themeName === 'night' ? 0.5 : 0.1 }));
      dome.position.y = h; dome.castShadow = true; grp.add(dome);
    } else {
      const cap = new THREE.Mesh(new RoundedBoxGeometry(w * 1.12, 0.22, d * 1.12, 3, 0.08),
        new THREE.MeshStandardMaterial({ color: def.roofColor || 0x35354e, roughness: 0.9 }));
      cap.position.y = h + 0.08; cap.castShadow = true; grp.add(cap);
    }

    // prop atap (identitas toy): gem / star / antenna / ac
    const propY = def.roof === 'dome' ? h + Math.min(w, d) * 0.52 : h + 0.2;
    if (def.prop === 'gem') {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.26),
        new THREE.MeshStandardMaterial({ color: def.accent, emissive: def.accent, emissiveIntensity: 1.4, roughness: 0.2 }));
      gem.position.y = propY + 0.34; gem.userData.spin = true; grp.add(gem);
      const ped = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.14, 0.34, 2, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xe8ecf5, roughness: 0.6 }));
      ped.position.y = propY + 0.06; grp.add(ped);
      const gl = this._glowSprite(def.accent, 1.4, 0.55); gl.position.y = propY + 0.36; grp.add(gl);
    } else if (def.prop === 'star') {
      const star = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffc23a, emissiveIntensity: 1.6 }));
      star.position.y = propY + 0.18; grp.add(star);
      const gl = this._glowSprite(0xffd76a, 1.0, 0.6); gl.position.y = propY + 0.18; grp.add(gl);
    } else if (def.prop === 'antenna') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x8890b0 }));
      pole.position.y = propY + 0.25; grp.add(pole);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xff5560, emissive: 0xff3040, emissiveIntensity: 2 }));
      tip.position.y = propY + 0.52; grp.add(tip);
    } else if (def.prop === 'ac') {
      const ac = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.22, 0.26, 2, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x9aa2c0, roughness: 0.7 }));
      ac.position.set(w * 0.22, propY + 0.11, -d * 0.1); grp.add(ac);
    }

    // awning strip warna di atas pintu + neon sign (papan besar melebihi facade — harus TERBACA dari kamera default)
    if (def.sign) {
      const sw = Math.max(1.6, Math.min(2.6, w * 1.45));
      const sign = this._neonSign(def.sign, def.accent, sw);
      sign.position.set(0, h * 0.82, d / 2 + 0.1); grp.add(sign);
      const back = new THREE.Mesh(new RoundedBoxGeometry(sw * 1.05, sw * 160 / 512 * 1.15, 0.1, 2, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x1a1530, roughness: 0.8 }));
      back.position.set(0, h * 0.82, d / 2 + 0.03); grp.add(back);
    }
    const aw = new THREE.Mesh(new RoundedBoxGeometry(w * 0.8, 0.08, 0.26, 2, 0.03),
      new THREE.MeshStandardMaterial({ color: def.accent, roughness: 0.55, emissive: def.accent, emissiveIntensity: this.themeName === 'night' ? 0.25 : 0.05 }));
    aw.position.set(0, h * 0.3, d / 2 + 0.12); grp.add(aw);

    // pintu (gelap hangat + glow tipis dari dalam)
    const door = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.44, 0.06, 2, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.8, emissive: this.theme.windowEmissive, emissiveIntensity: this.themeName === 'night' ? 0.35 : 0.08 }));
    door.position.set(0, 0.22, d / 2 + 0.02); grp.add(door);

    const p = this._w(def.tile, 0); grp.position.set(p.x, 0, p.z);
    if (def.rotY) grp.rotation.y = def.rotY;
    this.wl.scene.add(grp);
    const doorWorld = new THREE.Vector3(0, 0, d / 2 + 0.6).applyEuler(new THREE.Euler(0, def.rotY || 0, 0)).add(grp.position);
    this.buildings[def.key || def.sign || ('b' + Object.keys(this.buildings).length)] = { grp, def, door: doorWorld };
    return grp;
  }

  // ── jalan axis-aligned + marka putus-putus (y sedikit di atas rumput) ──
  road(a, b, width) {
    const T = this.theme, g = new THREE.Group();
    const pa = this._w(a, 0), pb = this._w(b, 0);
    const dx = pb.x - pa.x, dz = pb.z - pa.z, len = Math.max(Math.abs(dx), Math.abs(dz)) + (width || 1.4);
    const horiz = Math.abs(dx) >= Math.abs(dz);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : (width || 1.4), 0.04, horiz ? (width || 1.4) : len),
      new THREE.MeshStandardMaterial({ color: T.road, roughness: 0.95 }));
    bed.position.set((pa.x + pb.x) / 2, 0.02, (pa.z + pb.z) / 2); bed.receiveShadow = true; g.add(bed);
    // marka tengah putus-putus
    const markMat = new THREE.MeshStandardMaterial({ color: T.roadMark, roughness: 0.8, emissive: T.roadMark, emissiveIntensity: this.themeName === 'night' ? 0.12 : 0 });
    const n = Math.floor(len / 0.9);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 0.4 : 0.07, 0.012, horiz ? 0.07 : 0.4), markMat);
      const t = (i + 0.5) / n - 0.5;
      m.position.set((pa.x + pb.x) / 2 + (horiz ? t * len : 0), 0.045, (pa.z + pb.z) / 2 + (horiz ? 0 : t * len));
      g.add(m);
    }
    this.wl.scene.add(g); return g;
  }

  crosswalk(tile, horiz) {
    const g = new THREE.Group(), p = this._w(tile, 0);
    const mat = new THREE.MeshStandardMaterial({ color: this.theme.roadMark, roughness: 0.85 });
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 0.14 : 0.8, 0.012, horiz ? 0.8 : 0.14), mat);
      s.position.set(p.x + (horiz ? (i - 2) * 0.24 : 0), 0.048, p.z + (horiz ? 0 : (i - 2) * 0.24));
      g.add(s);
    }
    this.wl.scene.add(g); return g;
  }

  // trotoar slab (plaza / pedestrian) — warm stone
  plaza(tile, w, d) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, 0.08, d, 2, 0.04),
      new THREE.MeshStandardMaterial({ color: this.theme.sidewalk, roughness: 0.95 }));
    const p = this._w(tile, 0); m.position.set(p.x, 0.03, p.z); m.receiveShadow = true;
    this.wl.scene.add(m); return m;
  }

  // ── lampu jalan: tiang + bohlam emissive + glow sprite (light nyata opsional) ──
  lamp(tile, opts = {}) {
    const T = this.theme, g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: 0x2e2e44, roughness: 0.7 }));
    pole.position.y = 0.55; pole.castShadow = true; g.add(pole);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.09, 8),
      new THREE.MeshStandardMaterial({ color: 0x2e2e44, roughness: 0.7 }));
    cap.position.y = 1.16; g.add(cap);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10),
      new THREE.MeshStandardMaterial({ color: T.lampGlow, emissive: T.lampGlow, emissiveIntensity: this.themeName === 'night' ? 2.2 : 0.15 }));
    bulb.position.y = 1.08; g.add(bulb);
    if (this.themeName === 'night') {
      const gl = this._glowSprite(T.lampGlow, 1.2, 0.55); gl.position.y = 1.08; g.add(gl);
      if (opts.light) { const pl = new THREE.PointLight(T.lampGlow, 0.7, 5.5, 1.8); pl.position.y = 1.1; g.add(pl); }
    }
    const p = this._w(tile, 0); g.position.set(p.x, 0, p.z);
    this.wl.scene.add(g); return g;
  }

  // ── pohon chunky (2 bola daun bertumpuk) + varian pinus (kerucut) ──
  tree(tile, opts = {}) {
    const g = new THREE.Group(), scale = (opts.scale || 1) * 1.45;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.4, 7),
      new THREE.MeshStandardMaterial({ color: 0x7a5a3d, roughness: 0.95 }));
    trunk.position.y = 0.2; trunk.castShadow = true; g.add(trunk);
    const leaf = new THREE.MeshStandardMaterial({ color: opts.color || 0x5cb860, roughness: 0.9 });
    if (opts.pine) {
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 8), leaf); c1.position.y = 0.55; c1.castShadow = true; g.add(c1);
      const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.42, 8), leaf); c2.position.y = 0.85; c2.castShadow = true; g.add(c2);
      const c3 = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.34, 8), leaf); c3.position.y = 1.12; c3.castShadow = true; g.add(c3);
    } else {
      const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), leaf); b1.position.y = 0.62; b1.scale.y = 0.9; b1.castShadow = true; g.add(b1);
      const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 9, 7), leaf); b2.position.y = 0.88; b2.castShadow = true; g.add(b2);
    }
    const p = this._w(tile, 0); g.position.set(p.x, 0, p.z); g.scale.setScalar(scale);
    this.wl.scene.add(g); return g;
  }

  bush(tile, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 9, 7),
      new THREE.MeshStandardMaterial({ color: color || 0x69c26d, roughness: 0.95 }));
    const p = this._w(tile, 0); m.position.set(p.x, 0.13, p.z); m.scale.y = 0.7; m.castShadow = true;
    this.wl.scene.add(m); return m;
  }

  flowerPatch(tile) {
    const g = new THREE.Group(), cols = [0xff8ec9, 0xffffff, 0xffd76a, 0xc79bff];
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6),
        new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.7 }));
      f.position.set((Math.random() - 0.5) * 0.5, 0.05, (Math.random() - 0.5) * 0.5); g.add(f);
    }
    const p = this._w(tile, 0); g.position.set(p.x, 0, p.z);
    this.wl.scene.add(g); return g;
  }

  bench(tile, rotY) {
    const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x9a6b45, roughness: 0.9 });
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.06, 0.22, 2, 0.02), wood); seat.position.y = 0.18; seat.castShadow = true; g.add(seat);
    const back = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.2, 0.05, 2, 0.02), wood); back.position.set(0, 0.32, -0.09); g.add(back);
    [[-0.24], [0.24]].forEach(([x]) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.2), wood); leg.position.set(x, 0.09, 0); g.add(leg); });
    const p = this._w(tile, 0); g.position.set(p.x, 0, p.z); g.rotation.y = rotY || 0;
    this.wl.scene.add(g); return g;
  }

  fence(a, b) {
    const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, roughness: 0.8 });
    const pa = this._w(a, 0), pb = this._w(b, 0);
    const dx = pb.x - pa.x, dz = pb.z - pa.z, len = Math.sqrt(dx * dx + dz * dz), n = Math.max(2, Math.round(len / 0.4));
    for (let i = 0; i <= n; i++) {
      const post = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.3, 0.06, 1, 0.02), mat);
      post.position.set(pa.x + dx * i / n, 0.15, pa.z + dz * i / n); g.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.04), mat);
    rail.position.set((pa.x + pb.x) / 2, 0.24, (pa.z + pb.z) / 2); rail.rotation.y = -Math.atan2(dz, dx); g.add(rail);
    this.wl.scene.add(g); return g;
  }

  // ── air mancur oktagonal + air glowing (referensi: fountain cyan glow) ──
  fountain(tile) {
    const g = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: 0xc9bfae, roughness: 0.85 }));
    basin.position.y = 0.11; basin.castShadow = true; basin.receiveShadow = true; g.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.06, 8),
      new THREE.MeshStandardMaterial({ color: 0x7fe9ff, emissive: 0x38c8e8, emissiveIntensity: this.themeName === 'night' ? 1.5 : 0.3, roughness: 0.2 }));
    water.position.y = 0.2; g.add(water);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xc9bfae, roughness: 0.85 }));
    column.position.y = 0.4; g.add(column);
    const jet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xaff4ff, emissive: 0x5fd8f0, emissiveIntensity: this.themeName === 'night' ? 1.8 : 0.4, roughness: 0.2 }));
    jet.position.y = 0.64; jet.userData.pulse = true; g.add(jet);
    if (this.themeName === 'night') {
      const gl = this._glowSprite(0x63e8ff, 2.2, 0.5); gl.position.y = 0.45; g.add(gl);
      const pl = new THREE.PointLight(0x63e8ff, 0.9, 6, 1.8); pl.position.y = 0.8; g.add(pl);
    }
    const p = this._w(tile, 0); g.position.set(p.x, 0, p.z);
    this.wl.scene.add(g); this._fountain = g; return g;
  }

  // ── langit: bulan + bintang + awan drift ──
  moon(opts = {}) {
    if (this.themeName !== 'night') return null;
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.SphereGeometry(1.05, 22, 18),
      new THREE.MeshBasicMaterial({ color: 0xffe089 }));
    g.add(disc);
    const halo = this._glowSprite(0xffe9a8, 4.2, 0.4); g.add(halo);
    // default: dihitung supaya MASUK frustum ortho default (d=9, kamera 12,12,12):
    // screen-y = p·(-1,2,-1)/√6 harus < ~8; screen-x = (x−z)/√2 → geser kiri-atas, di belakang island
    g.position.set(opts.x != null ? opts.x : -14, opts.y != null ? opts.y : -0.5, opts.z != null ? opts.z : -6);
    this.wl.scene.add(g); return g;
  }

  stars(n = 90) {
    if (this.themeName !== 'night') return null;
    const pos = [], G = this.wl.grid.w;
    for (let i = 0; i < n; i++) {
      const r = 14 + Math.random() * 18, th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45;
      pos.push(r * Math.sin(ph) * Math.cos(th), 4 + r * Math.cos(ph) * 0.55, r * Math.sin(ph) * Math.sin(th));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xfff6d8, size: 0.16, sizeAttenuation: true, transparent: true, opacity: 1, depthWrite: false }));
    this.wl.scene.add(pts); return pts;
  }

  // Awan drift dikunci ke "band langit" layar utk kamera default (ortho iso 12,12,12):
  // screen-y T = (−x+2y−z)/√6 dipatok 5.5–8.5 (di atas island), screen-x u drift + wrap.
  // Dari (T,u,y) dihitung balik posisi dunia: x+z = 2y − T√6 ; x−z = u√2.
  _cloudPos(g) {
    const { T, u, y } = g.userData;
    const k = 2 * y - T * Math.sqrt(6);
    g.position.set((u * Math.SQRT2 + k) / 2, y, (k - u * Math.SQRT2) / 2);
  }
  clouds(n = 4) {
    const dark = this.themeName === 'night';
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: dark ? 0x4a4488 : 0xffffff, emissive: dark ? 0x241f4a : 0x000000, roughness: 1, transparent: true, opacity: dark ? 0.96 : 0.9 });
      const k = 2 + (i % 3);
      for (let j = 0; j <= k; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.32 + Math.random() * 0.22, 9, 7), mat);
        s.position.set(j * 0.4 - k * 0.2, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.2);
        s.scale.y = 0.72; g.add(s);
      }
      g.userData = { T: 6.6 + Math.random() * 2.2, u: -10 + Math.random() * 20, y: 3.5 + Math.random() * 3.5,
        speed: (0.1 + Math.random() * 0.12) * (i % 2 ? 1 : -1), limit: 11 };
      this._cloudPos(g);
      this.wl.scene.add(g); this._drift.push(g);
    }
  }

  // per-frame: awan drift + gem spin + air mancur pulse — daftarkan sekali via wl.onTick
  attachTick() {
    const self = this;
    this.wl.onTick((t, dt) => {
      for (const c of self._drift) {
        c.userData.u += c.userData.speed * dt;
        if (c.userData.u > c.userData.limit) c.userData.u = -c.userData.limit;
        if (c.userData.u < -c.userData.limit) c.userData.u = c.userData.limit;
        self._cloudPos(c);
      }
      for (const key in self.buildings) {
        self.buildings[key].grp.traverse((o) => { if (o.userData && o.userData.spin) { o.rotation.y = t * 0.8; o.position.y += Math.sin(t * 2) * 0.0008; } });
      }
      if (self._fountain) self._fountain.traverse((o) => { if (o.userData && o.userData.pulse) o.scale.setScalar(1 + Math.sin(t * 3) * 0.08); });
    });
    return this;
  }
}
