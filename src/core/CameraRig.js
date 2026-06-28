import * as THREE from 'three';
import { CAMERA, RECOIL } from '../config/Constants.js';
import { clamp, damp } from '../util/MathUtils.js';

// Owns the perspective camera and three view modes (first / third / top).
// Yaw/pitch are driven by mouse-look and shared as the player's aim direction.
// Trauma-based shake + recoil hooks are included now for later combat milestones.
export class CameraRig {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.FOV, aspect, 0.05, 600);
    this.mode = CAMERA.TP;
    // Around world Y; 0 looks toward -Z. Player spawns at the west end (-Z) so
    // start facing +Z toward the arena center (origin). Hero idle-facing follows.
    this.yaw = Math.PI;
    this.pitch = -0.15;
    this.trauma = 0;       // 0..1, decays; shake = trauma^2
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.fovPunch = 0;

    this._target = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  setMode(mode) { this.mode = mode; }
  cycleMode() {
    this.mode = this.mode === CAMERA.FP ? CAMERA.TP : this.mode === CAMERA.TP ? CAMERA.TOP : CAMERA.FP;
  }

  applyMouse(dx, dy) {
    this.yaw -= dx * CAMERA.MOUSE_SENS;
    this.pitch -= dy * CAMERA.MOUSE_SENS;
    this.pitch = clamp(this.pitch, CAMERA.PITCH_MIN, CAMERA.PITCH_MAX);
  }

  addShake(amount) { this.trauma = clamp(this.trauma + amount, 0, 1); }
  // Per-weapon recoil kick (JUICE_SPEC §2): `mult` is the weapon's recoil intensity.
  // Camera snaps up (pitch), random horizontal kick (yaw), and a brief FOV punch.
  addRecoil(mult = 1) {
    this.recoilPitch += RECOIL.PITCH * mult;
    this.recoilYaw += (Math.random() * 2 - 1) * RECOIL.YAW * mult;
    this.fovPunch += RECOIL.FOV * mult;
  }

  // Aim direction in world space (used by weapons / facing).
  getAimDirection(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    out.set(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp).normalize();
    return out;
  }

  // playerPos = feet position of the hero.
  update(dt, playerPos) {
    // Decay shake & recoil.
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.recoilPitch = damp(this.recoilPitch, 0, RECOIL.RETURN, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, RECOIL.RETURN, dt);
    this.fovPunch = damp(this.fovPunch, 0, 9, dt);

    const aim = this.getAimDirection(this._tmp);
    const eye = this._target.copy(playerPos);

    if (this.mode === CAMERA.FP) {
      // Eye at head height; Player hides the hero mesh in FP so the camera isn't
      // looking at the inside of the head's (black) outline shell.
      eye.y = playerPos.y + CAMERA.EYE_HEIGHT;
      this.camera.position.copy(eye);
      this._desired.copy(eye).addScaledVector(aim, 1);
      this.camera.lookAt(this._desired);
    } else if (this.mode === CAMERA.TOP) {
      this.camera.position.set(playerPos.x, playerPos.y + CAMERA.TOP_HEIGHT, playerPos.z + 0.01);
      this.camera.lookAt(playerPos.x, playerPos.y, playerPos.z);
    } else {
      // Third-person over-shoulder: orbit behind hero based on yaw/pitch.
      const pivot = this._desired.copy(playerPos);
      pivot.y += CAMERA.TP_HEIGHT;
      const back = this.camera.position
        .copy(pivot)
        .addScaledVector(aim, -CAMERA.TP_DISTANCE);
      back.y = Math.max(back.y, playerPos.y + 0.5); // keep above ground
      this.camera.lookAt(playerPos.x, playerPos.y + 1.1, playerPos.z);
    }

    // Apply recoil kick by nudging the camera's rotation (pitch up + yaw chaos).
    this.camera.rotateX(this.recoilPitch);
    this.camera.rotateY(this.recoilYaw);

    // Trauma shake: jittery offset that decays quickly.
    const shake = this.trauma * this.trauma;
    if (shake > 0.0001) {
      this.camera.position.x += (Math.random() * 2 - 1) * shake * 0.4;
      this.camera.position.y += (Math.random() * 2 - 1) * shake * 0.4;
      this.camera.rotation.z += (Math.random() * 2 - 1) * shake * 0.05;
    }

    const targetFov = CAMERA.FOV + this.fovPunch;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
