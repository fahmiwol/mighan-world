/**
 * ObjectBuilder.js — compose a low-poly 3D object from a primitive "spec".
 * Spec (dari /api/gen/object, ADR-003 Phase 1):
 *   { name, parts:[{shape:'box|cylinder|sphere|cone', size:[...], pos:[x,y,z], color:'#hex', rot:[x,y,z]?}], footprint:[w,d] }
 *   box size=[w,h,d] · cylinder/cone size=[radius,height] · sphere size=[radius]
 * Plain Three.js → bisa dipakai world-lite, ops engine, ATAU migancore (R3F: <primitive object={ObjectBuilder.build(spec)} />).
 */
import * as THREE from 'three';

export const ObjectBuilder = {
  build: function (spec) {
    const g = new THREE.Group();
    g.name = (spec && spec.name) || 'object';
    const parts = (spec && Array.isArray(spec.parts)) ? spec.parts : [];
    parts.slice(0, 24).forEach(function (p) {
      const s = p.size || [0.5, 0.5, 0.5];
      let geo;
      if (p.shape === 'cylinder') geo = new THREE.CylinderGeometry(s[0] || 0.2, s[0] || 0.2, s[1] || 0.4, 18);
      else if (p.shape === 'cone') geo = new THREE.ConeGeometry(s[0] || 0.2, s[1] || 0.4, 18);
      else if (p.shape === 'sphere') geo = new THREE.SphereGeometry(s[0] || 0.3, 18, 14);
      else geo = new THREE.BoxGeometry(s[0] || 0.5, s[1] || 0.5, s[2] || 0.5);
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color || '#cccccc'), roughness: 0.6, metalness: 0.05 });
      const m = new THREE.Mesh(geo, mat);
      const pos = p.pos || [0, 0, 0];
      m.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
      if (p.rot) m.rotation.set(p.rot[0] || 0, p.rot[1] || 0, p.rot[2] || 0);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    });
    g.userData = { asset: true, spec: spec };
    return g;
  },

  // bounding-box (mesh-only) → util untuk auto-frame / normalisasi
  measure: function (obj) {
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3(), tmp = new THREE.Box3();
    let found = false;
    obj.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox; if (!bb) return;
      tmp.copy(bb).applyMatrix4(o.matrixWorld);
      if (isFinite(tmp.max.y)) { box.union(tmp); found = true; }
    });
    return found ? box : null;
  }
};

export default ObjectBuilder;
