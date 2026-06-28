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

    // Flagstone rim rocks.
    const rockMat = new THREE.MeshToonMaterial({ color: rockC });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const rr = radius + 0.2 + Math.random() * 0.3;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.3, 0), rockMat);
      rock.position.set(Math.cos(a) * rr, 0.05 + Math.random() * 0.1, Math.sin(a) * rr * 0.78);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.scale.y = 0.7;
      rock.castShadow = true; rock.receiveShadow = true;
      this.group.add(rock);
    }
    this.group.scale.z = 0.78; // elliptical glade pool
    scene.add(this.group);
  }

  update(dt) {
    this._t += dt;
    if (this._uTime) this._uTime.value = this._t;
    this.surface.material.emissiveIntensity = 0.5 + Math.sin(this._t * 1.4) * 0.18;
  }
}
