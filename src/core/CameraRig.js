import * as THREE from 'three';
import { CAMERA } from '../config/Constants.js';
import { clamp, damp } from '../util/MathUtils.js';

// Owns the perspective camera and three view modes (first / third / top).
// Yaw/pitch are driven by mouse-look and shared as the player's aim direction.
// Trauma-based shake + recoil hooks are included now for later combat milestones.
export class CameraRig {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.FOV, aspect, 0.05, 600);
    this.mode = CAMERA.TP;
    this.yaw = 0;          // around world Y; 0 looks toward -Z (game forward)
    this.pitch = -0.15;
    this.trauma = 0;       // 0..1, decays; shake = trauma^2
    this.recoilPitch = 0;
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
  addRecoil(amount) { this.recoilPitch += amount; this.fovPunch += amount * 6; }

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
    this.recoilPitch = damp(this.recoilPitch, 0, 12, dt);
    this.fovPunch = damp(this.fovPunch, 0, 9, dt);

    const aim = this.getAimDirection(this._tmp);
    const eye = this._target.copy(playerPos);

    if (this.mode === CAMERA.FP) {
      eye.y += CAMERA.EYE_HEIGHT ?? 0.95;
      eye.y = playerPos.y + 0.95;
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

    // Apply recoil pitch by nudging the camera's rotation.
    this.camera.rotateX(this.recoilPitch);

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
