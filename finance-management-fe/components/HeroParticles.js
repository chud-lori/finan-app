'use client';
import { useEffect, useRef } from 'react';

const PARTICLE_COUNT  = 72;
const CONNECT_DIST    = 110;   // px in 3D space
const SPEED           = 0.28;
const W               = 320;   // world width
const H               = 200;   // world height
const DEPTH           = 60;    // world depth

export default function HeroParticles() {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    let animId;
    let renderer, scene, camera;
    const mouse = { x: 0, y: 0 };
    let hidden = false;

    const onResize = () => {
      if (!renderer || !camera) return;
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const onMouseMove = (e) => {
      mouse.x = (e.clientX / window.innerWidth  - 0.5) * 2;
      mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2;
    };

    const onVisibility = () => { hidden = document.hidden; };

    import('three').then((THREE) => {
      const w = el.clientWidth, h = el.clientHeight;

      // ── Scene setup ──────────────────────────────────────
      scene    = new THREE.Scene();
      camera   = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
      camera.position.z = 220;

      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);

      // ── Particles ─────────────────────────────────────────
      const positions  = new Float32Array(PARTICLE_COUNT * 3);
      const velocities = [];

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        positions[i * 3]     = (Math.random() - 0.5) * W;
        positions[i * 3 + 1] = (Math.random() - 0.5) * H;
        positions[i * 3 + 2] = (Math.random() - 0.5) * DEPTH;
        velocities.push({
          x: (Math.random() - 0.5) * SPEED,
          y: (Math.random() - 0.5) * SPEED,
        });
      }

      const pgeo = new THREE.BufferGeometry();
      pgeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const pmat = new THREE.PointsMaterial({
        color: 0x0d9488,
        size: 2.8,
        transparent: true,
        opacity: 0.65,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(pgeo, pmat);
      scene.add(points);

      // ── Connection lines (dynamic) ─────────────────────────
      const maxPairs    = (PARTICLE_COUNT * (PARTICLE_COUNT - 1)) / 2;
      const linePositions = new Float32Array(maxPairs * 6);

      const lgeo = new THREE.BufferGeometry();
      lgeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

      const lmat = new THREE.LineBasicMaterial({
        color: 0x0d9488,
        transparent: true,
        opacity: 0.18,
      });

      const lines = new THREE.LineSegments(lgeo, lmat);
      scene.add(lines);

      // ── Animate ───────────────────────────────────────────
      const animate = () => {
        animId = requestAnimationFrame(animate);
        if (hidden) return;

        // Move particles, bounce at world edges
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          positions[i * 3]     += velocities[i].x;
          positions[i * 3 + 1] += velocities[i].y;
          if (Math.abs(positions[i * 3])     > W / 2) velocities[i].x *= -1;
          if (Math.abs(positions[i * 3 + 1]) > H / 2) velocities[i].y *= -1;
        }
        pgeo.attributes.position.needsUpdate = true;

        // Rebuild connection segments
        let lineIdx = 0;
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          for (let j = i + 1; j < PARTICLE_COUNT; j++) {
            const dx = positions[i * 3]     - positions[j * 3];
            const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
            const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
            if (dx * dx + dy * dy + dz * dz < CONNECT_DIST * CONNECT_DIST) {
              linePositions[lineIdx * 6]     = positions[i * 3];
              linePositions[lineIdx * 6 + 1] = positions[i * 3 + 1];
              linePositions[lineIdx * 6 + 2] = positions[i * 3 + 2];
              linePositions[lineIdx * 6 + 3] = positions[j * 3];
              linePositions[lineIdx * 6 + 4] = positions[j * 3 + 1];
              linePositions[lineIdx * 6 + 5] = positions[j * 3 + 2];
              lineIdx++;
            }
          }
        }
        lgeo.setDrawRange(0, lineIdx * 2);
        lgeo.attributes.position.needsUpdate = true;

        // Gentle mouse parallax
        camera.position.x += (mouse.x * 18 - camera.position.x) * 0.04;
        camera.position.y += (mouse.y * 12 - camera.position.y) * 0.04;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
      };

      animate();

      window.addEventListener('resize',           onResize);
      window.addEventListener('mousemove',        onMouseMove);
      document.addEventListener('visibilitychange', onVisibility);
    });

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize',            onResize);
      window.removeEventListener('mousemove',         onMouseMove);
      document.removeEventListener('visibilitychange', onVisibility);
      if (renderer) {
        renderer.dispose();
        const canvas = el.querySelector('canvas');
        if (canvas) el.removeChild(canvas);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden
    />
  );
}
