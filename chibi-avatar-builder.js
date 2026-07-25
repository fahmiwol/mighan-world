/**
 * ChibiAvatarBuilder.js — Procedural 3D Chibi Avatar Generator
 *
 * Builds cute 3D chibi characters from Three.js primitives.
 * Style: big head, small body (~2.5 heads), rounded shapes, pastel colors.
 *
 * Usage:
 *   import { ChibiAvatarBuilder } from './ChibiAvatarBuilder.js?v=8';
 *   const avatar = ChibiAvatarBuilder.build({ skin: '#ffdbac', hair: '#4a2000', shirt: '#7c3aed', pants: '#1e293b' });
 *   scene.add(avatar);
 */

import * as THREE from 'three';

export const ChibiAvatarBuilder = {

  /**
   * Build a chibi avatar group
   * @param {Object} opts — appearance options
   * @returns {THREE.Group}
   */
  build: function(opts) {
    opts = opts || {};
    const g = new THREE.Group();
    g.name = 'chibi-avatar';

    // Materials
    const skinMat  = new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.skin  || '#ffdbac'), roughness: 0.4, metalness: 0 });
    const hairMat  = new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.hair  || '#4a2000'), roughness: 0.7, metalness: 0 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.shirt || '#7c3aed'), roughness: 0.6, metalness: 0 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.pants || '#1e293b'), roughness: 0.6, metalness: 0 });
    const shoeMat  = new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.shoes || '#ffffff'), roughness: 0.5, metalness: 0 });
    const eyeMat   = new THREE.MeshStandardMaterial({ color: new THREE.Color('#111111'), roughness: 0.2, metalness: 0.1 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffffff'), roughness: 0.3, metalness: 0 });

    // ─── HEAD ─── (big sphere, radius 0.25)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), skinMat);
    head.position.y = 1.05;
    head.castShadow = true;
    g.add(head);

    // ─── FACE ─── (expression: normal | happy | wink | cool ; eyeColor)
    const expression = opts.expression || 'normal';
    const eyeM = new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.eyeColor || '#1a1a1a'), roughness: 0.25, metalness: 0.1 });
    const mkEye = (x, closed) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), eyeM);
      e.position.set(x, 1.08, 0.225);
      if (closed) e.scale.set(1.5, 0.22, 0.5);                 // mata garis melengkung (happy/wink)
      else e.scale.set(0.95, 1.2, 0.6);                        // mata bulat besar chibi
      g.add(e);
      if (!closed) { const hl = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 6), whiteMat); hl.position.set(x + 0.013, 1.10, 0.25); g.add(hl); }
    };
    if (expression === 'happy') { mkEye(-0.085, true); mkEye(0.085, true); }
    else if (expression === 'wink') { mkEye(-0.085, false); mkEye(0.085, true); }
    else if (expression === 'cool') {                          // kacamata hitam
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.085, 0.04), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.15, metalness: 0.3 }));
      sh.position.set(0, 1.08, 0.235); g.add(sh);
    } else { mkEye(-0.085, false); mkEye(0.085, false); }

    // Blush
    const blushMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ff9999'), roughness: 0.5, transparent: true, opacity: 0.4 });
    [-0.15, 0.15].forEach((x) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), blushMat); b.position.set(x, 0.985, 0.18); g.add(b); });

    // Mouth (smile; lebih lebar kalau happy)
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), eyeM);
    mouth.position.set(0, 0.955, 0.232); mouth.scale.set(1.6, expression === 'happy' ? 0.95 : 0.6, 0.5);
    g.add(mouth);

    // ─── HAIR ─── (style: default = rounded top)
    const hairStyle = opts.hairStyle || 'default';
    this._addHair(g, hairStyle, hairMat, opts);

    // ─── BODY ─── (oval sphere, radius 0.18, stretched)
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), shirtMat);
    body.position.y = 0.62;
    body.scale.set(1, 1.25, 0.8);
    body.castShadow = true;
    g.add(body);

    // ─── ARMS ───
    // Left arm (cylinder + sphere cap)
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), shirtMat);
    armL.position.set(-0.22, 0.7, 0);
    armL.rotation.z = 0.3;
    armL.castShadow = true;
    g.add(armL);
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skinMat);
    handL.position.set(-0.28, 0.52, 0);
    g.add(handL);

    // Right arm
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), shirtMat);
    armR.position.set(0.22, 0.7, 0);
    armR.rotation.z = -0.3;
    armR.castShadow = true;
    g.add(armR);
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skinMat);
    handR.position.set(0.28, 0.52, 0);
    g.add(handR);

    // ─── LEGS ───
    // Left leg
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.35, 8), pantsMat);
    legL.position.set(-0.1, 0.28, 0);
    legL.castShadow = true;
    g.add(legL);
    const footL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), shoeMat);
    footL.position.set(-0.1, 0.08, 0.03);
    footL.scale.set(1, 0.6, 1.3);
    g.add(footL);

    // Right leg
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.35, 8), pantsMat);
    legR.position.set(0.1, 0.28, 0);
    legR.castShadow = true;
    g.add(legR);
    const footR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), shoeMat);
    footR.position.set(0.1, 0.08, 0.03);
    footR.scale.set(1, 0.6, 1.3);
    g.add(footR);

    // ─── ACCESSORIES ───
    if (opts.accessories) {
      this._addAccessories(g, opts.accessories, { skinMat, hairMat, shirtMat, pantsMat, shoeMat });
    }

    // Store materials for runtime color updates
    g.userData = {
      avatar: true,
      materials: { skin: skinMat, hair: hairMat, shirt: shirtMat, pants: pantsMat, shoes: shoeMat },
      limbs: { armL: armL, armR: armR, legL: legL, legR: legR },
      opts: opts
    };

    // Scale entire avatar to fit in tile (chibi ~1.3m tall)
    g.scale.set(0.7, 0.7, 0.7);

    return g;
  },

  /**
   * Update avatar colors without rebuilding
   */
  updateColors: function(group, opts) {
    if (!group || !group.userData.materials) return;
    const m = group.userData.materials;
    if (opts.skin  && m.skin)  m.skin.color.set(opts.skin);
    if (opts.hair  && m.hair)  m.hair.color.set(opts.hair);
    if (opts.shirt && m.shirt) m.shirt.color.set(opts.shirt);
    if (opts.pants && m.pants) m.pants.color.set(opts.pants);
    if (opts.shoes && m.shoes) m.shoes.color.set(opts.shoes);
  },

  /**
   * Add hair based on style
   */
  _addHair: function(g, style, hairMat, opts) {
    if (style === 'mohawk') {
      // Mohawk: central strip of spheres
      for (let i = 0; i < 5; i++) {
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.08 - i * 0.01, 8, 8), hairMat);
        h.position.set(0, 1.32 + i * 0.06, 0);
        g.add(h);
      }
    } else if (style === 'long') {
      // Long hair: back covering
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
      back.position.set(0, 1.0, -0.05);
      back.scale.set(1, 1.3, 1.1);
      g.add(back);
    } else if (style === 'ponytail') {
      // Ponytail: bun at back
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), hairMat);
      bun.position.set(0, 1.15, -0.28);
      g.add(bun);
      // Base hair
      const base = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
      base.position.set(0, 1.05, 0);
      g.add(base);
    } else if (style === 'bald') {
      // no hair
    } else if (style === 'short') {
      // Short crop: tight cap, no bangs
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.265, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
      cap.position.set(0, 1.05, 0); g.add(cap);
    } else if (style === 'bun') {
      const base = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
      base.position.set(0, 1.05, 0); g.add(base);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), hairMat);
      bun.position.set(0, 1.34, -0.02); g.add(bun);
    } else if (style === 'spiky') {
      const base = new THREE.Mesh(new THREE.SphereGeometry(0.255, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
      base.position.set(0, 1.05, 0); g.add(base);
      const tips = [[0,1.34,0],[-0.14,1.28,0.05],[0.14,1.28,0.05],[-0.08,1.3,-0.12],[0.08,1.3,-0.12]];
      tips.forEach((p) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8), hairMat); c.position.set(p[0], p[1], p[2]); g.add(c); });
    } else if (style === 'afro') {
      const afro = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 14), hairMat);
      afro.position.set(0, 1.16, 0); afro.scale.set(1, 0.95, 1); g.add(afro);
    } else {
      // Default: rounded top hair
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
      hair.position.set(0, 1.08, 0);
      g.add(hair);
      // Side bangs
      const bangL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), hairMat);
      bangL.position.set(-0.2, 1.12, 0.1);
      g.add(bangL);
      const bangR = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), hairMat);
      bangR.position.set(0.2, 1.12, 0.1);
      g.add(bangR);
    }
  },

  /**
   * Add accessories (hat, glasses, etc)
   */
  _addAccessories: function(g, accs, mats) {
    if (!Array.isArray(accs)) accs = [accs];
    accs.forEach(function(acc) {
      if (acc === 'hat') {
        const hat = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.35), mats.shirt);
        hat.position.set(0, 1.3, 0);
        g.add(hat);
      } else if (acc === 'glasses') {
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3 });
        const lensMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, transparent: true, opacity: 0.4 });
        const frame = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 16), frameMat);
        frame.position.set(-0.08, 1.08, 0.24);
        g.add(frame);
        const frame2 = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 16), frameMat);
        frame2.position.set(0.08, 1.08, 0.24);
        g.add(frame2);
        const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.04, 6), frameMat);
        bridge.rotation.z = Math.PI / 2;
        bridge.position.set(0, 1.08, 0.24);
        g.add(bridge);
      } else if (acc === 'headphones') {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 8, 16, Math.PI), mats.shoes);
        band.position.set(0, 1.15, 0);
        g.add(band);
        const cupL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), mats.shoes);
        cupL.rotation.z = Math.PI / 2;
        cupL.position.set(-0.28, 1.05, 0);
        g.add(cupL);
        const cupR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), mats.shoes);
        cupR.rotation.z = Math.PI / 2;
        cupR.position.set(0.28, 1.05, 0);
        g.add(cupR);
      }
    });
  }

};

export default ChibiAvatarBuilder;


