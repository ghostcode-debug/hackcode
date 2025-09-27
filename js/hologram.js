// Three.js hologram scene with revolving product and projection base
import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import { EffectComposer } from 'https://unpkg.com/three@0.161.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.161.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.161.0/examples/jsm/postprocessing/UnrealBloomPass.js';

export function initHologram({ canvas }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  camera.position.set(0, 1.2, 6.2);

  // Lights
  const ambient = new THREE.AmbientLight(0x88bbff, 0.5);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xaaddff, 0.6);
  dir.position.set(2, 4, 3);
  scene.add(dir);

  // Group
  const group = new THREE.Group();
  scene.add(group);

  // Hologram product plane with shader scanlines/fresnel
  const productImageUrl = 'https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?q=80&w=1200&auto=format&fit=crop';
  const textureLoader = new THREE.TextureLoader();
  const productTex = textureLoader.load(productImageUrl);
  productTex.colorSpace = THREE.SRGBColorSpace;

  const uniforms = {
    uTime: { value: 0 },
    uTex: { value: productTex },
    uColorA: { value: new THREE.Color(0x00f0ff) },
    uColorB: { value: new THREE.Color(0x7a5cff) }
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTex;
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
      
      void main() {
        vec2 uv = vUv;
        vec4 base = texture2D(uTex, uv);
        // Scanlines
        float lines = smoothstep(0.0, 0.6, sin((uv.y + uTime * 0.8) * 220.0) * 0.5 + 0.5);
        // Fresnel glow
        float fres = pow(1.0 - abs(uv.x - 0.5) * 2.0, 2.0) * 0.25 + pow(1.0 - abs(uv.y - 0.5) * 2.0, 2.0) * 0.25;
        vec3 glow = mix(uColorA, uColorB, 0.5 + 0.5 * sin(uTime * 0.6)) * (lines * 0.35 + fres * 0.9);
        // Subtle noise shimmer
        float n = hash(uv * (uTime * 0.2 + 1.0));
        vec3 color = base.rgb * 0.9 + glow * 0.8 + n * 0.03;
        float alpha = base.a * 0.98;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });

  const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.9), mat);
  plane.position.y = 1.5;
  group.add(plane);

  // Projection base: rings & emitter
  const baseGroup = new THREE.Group();
  baseGroup.position.y = 0.0;
  group.add(baseGroup);

  const ringGeo = new THREE.RingGeometry(0.6, 1.8, 64, 1);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  baseGroup.add(ring);

  const ring2 = ring.clone();
  ring2.material = ringMat.clone();
  ring2.material.opacity = 0.14;
  baseGroup.add(ring2);

  const emitter = new THREE.CylinderGeometry(0.18, 0.18, 0.1, 32);
  const emitterMat = new THREE.MeshBasicMaterial({ color: 0x7a5cff });
  const emitterMesh = new THREE.Mesh(emitter, emitterMat);
  baseGroup.add(emitterMesh);

  // Vertical light beam
  const beamGeo = new THREE.CylinderGeometry(0.02, 0.35, 2.2, 32, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x7a5cff, transparent: true, opacity: 0.16, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 1.2;
  baseGroup.add(beam);

  // Particles
  const partGeo = new THREE.BufferGeometry();
  const count = 400;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = Math.random() * 1.8;
    const a = Math.random() * Math.PI * 2;
    positions[i * 3 + 0] = Math.cos(a) * r;
    positions[i * 3 + 1] = Math.random() * 2.4;
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const partMat = new THREE.PointsMaterial({ color: 0x00f0ff, size: 0.025, transparent: true, opacity: 0.7 });
  const particles = new THREE.Points(partGeo, partMat);
  baseGroup.add(particles);

  // Composer with bloom for hologram glow
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.8, 0.85);
  composer.addPass(bloom);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    composer.setSize(width, height);
  }
  window.addEventListener('resize', resize);
  resize();

  let t = 0;
  function tick(dt) {
    t += dt;
    uniforms.uTime.value = t;
    plane.rotation.y = t * 0.35; // revolving
    ring.scale.setScalar(1.0 + Math.sin(t * 1.2) * 0.05 + 0.05);
    ring2.scale.setScalar(1.2 + Math.sin(t * 0.9 + 0.6) * 0.04);
    beam.material.opacity = 0.14 + Math.sin(t * 1.6) * 0.06;

    // gently float
    group.position.y = Math.sin(t * 0.9) * 0.05;

    // animate particles upward
    const pos = partGeo.attributes.position;
    for (let i = 0; i < count; i++) {
      let y = pos.getY(i) + (0.35 + Math.random() * 0.1) * 0.016;
      if (y > 2.4) y = 0.0;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }

  let last = performance.now();
  function animate(now) {
    const dt = (now - last) / 1000;
    last = now;
    tick(dt);
    composer.render();
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

