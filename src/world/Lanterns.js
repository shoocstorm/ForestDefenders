import * as THREE from 'three';
import { ARENA, BLOOM_LAYER } from '../config/Constants.js';

// Fairy lanterns alternating along the stone path (LEVELS_SPEC §5.4). Each is a
// little caged storybook lamp: a footed mossy post, a decorative collar, a warm
// glowing orb framed by four ribs, a faceted roof hat and a glowing gold finial.
// Every lantern is lit (emissive orb + point light + bloom layer) and pulses
// gently — the orbs and finials are the path's main bloom accents.
export class Lanterns {
  constructor(scene, pal) {
    this.scene = scene;
    this._t = 0;
    this.lit = [];
    this.groups = [];        // one group per lantern (cleanup)
    this.sharedGeo = [];     // geometries shared across all lanterns
    this.sharedMat = [];     // materials shared across all lanterns
    const p = pal || {};

    // --- Shared materials (built once, reused by every lantern) ---
    const postMat = new THREE.MeshToonMaterial({ color: p.post ?? 0x4a5a3a });
    const metalMat = new THREE.MeshToonMaterial({ color: p.cap ?? 0x6b4a2e }); // bronze fittings
    const roofMat = new THREE.MeshToonMaterial({ color: p.roof ?? 0x8a4a3a });  // warm clay roof
    const finialMat = new THREE.MeshStandardMaterial({
      color: 0xffe6a0, emissive: 0xffc24a, emissiveIntensity: 1.2,
    });
    this.sharedMat.push(postMat, metalMat, roofMat, finialMat);

    // --- Shared geometries ---
    const footGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.12, 8);   // splayed base
    const postGeo = new THREE.CylinderGeometry(0.055, 0.085, 1.45, 6); // tapered shaft
    const collarGeo = new THREE.TorusGeometry(0.085, 0.025, 6, 10);    // ring under lamp
    const holderGeo = new THREE.ConeGeometry(0.16, 0.16, 6);           // cup the orb sits in
    const orbGeo = new THREE.IcosahedronGeometry(0.17, 1);
    const ribGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.36, 4);  // cage bar
    const roofGeo = new THREE.ConeGeometry(0.27, 0.24, 6);             // faceted hat
    const brimGeo = new THREE.TorusGeometry(0.2, 0.022, 5, 6);         // little roof brim
    const finialGeo = new THREE.IcosahedronGeometry(0.05, 0);          // glowing knob on top
    this.sharedGeo.push(footGeo, postGeo, collarGeo, holderGeo, orbGeo,
      ribGeo, roofGeo, brimGeo, finialGeo);

    const litColor = p.lit ?? 0xffd98a;
    const litEmissive = p.litEmissive ?? 0xffb24a;
    const lightColor = p.light ?? 0xffb86a;
    const lightI = p.lightI ?? 3.0;

    let idx = 0;
    for (let z = -ARENA.LENGTH / 2 + 8; z <= ARENA.LENGTH / 2 - 8; z += 6, idx++) {
      const side = idx % 2 === 0 ? -1 : 1;
      const x = side * 2.8;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = Math.random() * Math.PI * 2; // break up the repetition

      const foot = new THREE.Mesh(footGeo, postMat); foot.position.y = 0.06;
      foot.castShadow = true; g.add(foot);

      const post = new THREE.Mesh(postGeo, postMat); post.position.y = 0.845;
      post.castShadow = true; g.add(post);

      const collar = new THREE.Mesh(collarGeo, metalMat); collar.position.y = 1.56;
      g.add(collar);

      const holder = new THREE.Mesh(holderGeo, metalMat); holder.position.y = 1.62;
      g.add(holder);

      // Glowing orb — its own material so each can pulse independently.
      const orb = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({
        color: litColor, emissive: litEmissive, emissiveIntensity: 1.6,
      }));
      orb.position.y = 1.78;
      orb.layers.enable(BLOOM_LAYER);
      g.add(orb);

      // Four cage ribs framing the orb.
      for (let r = 0; r < 4; r++) {
        const a = (r / 4) * Math.PI * 2 + Math.PI / 4;
        const rib = new THREE.Mesh(ribGeo, metalMat);
        rib.position.set(Math.cos(a) * 0.16, 1.78, Math.sin(a) * 0.16);
        g.add(rib);
      }

      const roof = new THREE.Mesh(roofGeo, roofMat); roof.position.y = 2.06;
      roof.castShadow = true; g.add(roof);
      const brim = new THREE.Mesh(brimGeo, roofMat); brim.position.y = 1.95;
      brim.rotation.x = Math.PI / 2; g.add(brim);

      const finial = new THREE.Mesh(finialGeo, finialMat); finial.position.y = 2.24;
      finial.layers.enable(BLOOM_LAYER);
      g.add(finial);

      const light = new THREE.PointLight(lightColor, lightI, 7, 2);
      light.position.y = 1.78;
      g.add(light);

      scene.add(g);
      this.groups.push(g);
      this.lit.push({ orb, light, phase: Math.random() * Math.PI * 2, baseE: 1.6, baseI: lightI });
    }
  }

  update(dt) {
    this._t += dt;
    for (const l of this.lit) {
      const p = 0.85 + Math.sin(this._t * 2.2 + l.phase) * 0.15;
      l.orb.material.emissiveIntensity = l.baseE * p;
      l.light.intensity = l.baseI * p;
    }
  }

  dispose() {
    for (const g of this.groups) this.scene.remove(g);
    this.groups.length = 0;
    // Per-orb materials are unique; shared geos/mats disposed once.
    for (const l of this.lit) l.orb.material.dispose();
    this.lit.length = 0;
    for (const geo of this.sharedGeo) geo.dispose();
    for (const mat of this.sharedMat) mat.dispose();
    this.sharedGeo.length = 0;
    this.sharedMat.length = 0;
  }
}
