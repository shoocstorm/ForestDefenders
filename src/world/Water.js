import * as THREE from 'three';
import { BLOOM_LAYER } from '../config/Constants.js';

// Scenic enchanted pond (LEVELS_SPEC §5.1) tucked in the SW glade — no collision.
// Stylized analytic water: a toon teal disc with shared multi-wave vertex ripple
// (a small nod to threejs-water-optics) + a slow emissive pulse + a flagstone rim.
// Marked on the bloom layer so the glow reads in the post pipeline.
export class Water {
  constructor(scene, x, z, radius = 5, palette) {
    this.scene = scene;
    this._t = 0;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);

    const c = palette?.color ?? 0x2f8fa6;
    const e = palette?.emissive ?? 0x0e5566;
    const rockC = palette?.rock ?? 0x8a8475;

    const geo = new THREE.CircleGeometry(radius, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshToonMaterial({
      color: c, emissive: e, emissiveIntensity: 0.6, transparent: true, opacity: 0.92,
    });
    // Shared wave displacement: two crossing sines → gentle living surface.
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this._uTime = { value: 0 };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\n' +
          'transformed.y += sin(position.x*0.9 + uTime*1.6)*0.06 + cos(position.z*1.1 + uTime*1.2)*0.05;');
    };
    this.surface = new THREE.Mesh(geo, mat);
    this.surface.position.y = 0.06;
    this.surface.receiveShadow = true;
    this.surface.layers.enable(BLOOM_LAYER);
    this.group.add(this.surface);

    // Flagstone rim rocks — one shared unit geometry + one InstancedMesh (was
    // 14 unique DodecahedronGeometry allocations and 14 separate draws).
    const rockMat = new THREE.MeshToonMaterial({ color: rockC });
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockCount = 14;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    const rm = new THREE.Matrix4();
    const rq = new THREE.Quaternion();
    const rpos = new THREE.Vector3();
    const rscl = new THREE.Vector3();
    for (let i = 0; i < rockCount; i++) {
      const a = (i / rockCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const rr = radius + 0.2 + Math.random() * 0.3;
      const s = 0.3 + Math.random() * 0.3;
      rpos.set(Math.cos(a) * rr, 0.05 + Math.random() * 0.1, Math.sin(a) * rr * 0.78);
      rq.setFromEuler(new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2));
      rscl.set(s, s * 0.7, s);
      rocks.setMatrixAt(i, rm.compose(rpos, rq, rscl));
    }
    rocks.castShadow = true; rocks.receiveShadow = true;
    rocks.instanceMatrix.needsUpdate = true;
    this.rocks = rocks;
    this.group.add(rocks);
    this.group.scale.z = 0.78; // elliptical glade pool
    scene.add(this.group);
  }

  update(dt) {
    this._t += dt;
    if (this._uTime) this._uTime.value = this._t;
    this.surface.material.emissiveIntensity = 0.5 + Math.sin(this._t * 1.4) * 0.18;
  }

  dispose() {
    this.scene.remove(this.group);
    this.surface.geometry.dispose();
    this.surface.material.dispose();
    // Dispose rock materials + free the InstancedMesh's instance-matrix buffer.
    this.group.traverse((c) => {
      if (c.isMesh) {
        c.geometry?.dispose?.();
        c.material?.dispose?.();
        c.dispose?.();
      }
    });
  }
}
