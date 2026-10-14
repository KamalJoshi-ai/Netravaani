"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Real-time WebGL iris: radial particle fibres, a pupil that breathes,
 * and orbiting instrument rings. Tilts toward the cursor.
 * `tone="light"` is drawn for beige surfaces, `tone="dark"` for espresso panels.
 */
export default function IrisScene({
  tone = "light",
  className,
  interactive = true,
}: {
  tone?: "light" | "dark";
  className?: string;
  interactive?: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      return; // WebGL unavailable: the decorative scene is simply skipped.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    const palette =
      tone === "light"
        ? { inner: "#30251F", mid: "#C56845", outer: "#D9AE96", ring: "#C56845", ring2: "#75665D", pupil: "#1C140F", dust: "#A2948B" }
        : { inner: "#7A361E", mid: "#E07B52", outer: "#F3D9C8", ring: "#E58A62", ring2: "#EED9CD", pupil: "#0E0907", dust: "#EED9CD" };

    // Soft round sprite so points look like light, not squares
    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = spriteCanvas.height = 64;
    const sctx = spriteCanvas.getContext("2d")!;
    const grad = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.85)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 64, 64);
    const sprite = new THREE.CanvasTexture(spriteCanvas);

    const root = new THREE.Group();
    scene.add(root);

    /* ---------- Iris fibres ---------- */
    const FIBRES = 340;
    const PER = 26;
    const count = FIBRES * PER;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    const cInner = new THREE.Color(palette.inner);
    const cMid = new THREE.Color(palette.mid);
    const cOuter = new THREE.Color(palette.outer);
    const tmp = new THREE.Color();
    let i = 0;
    for (let f = 0; f < FIBRES; f++) {
      const a0 = (f / FIBRES) * Math.PI * 2 + (Math.random() - 0.5) * 0.02;
      const curl = (Math.random() - 0.5) * 0.35;
      for (let p = 0; p < PER; p++) {
        const t = p / (PER - 1);
        const r = 0.52 + t * 1.15 + (Math.random() - 0.5) * 0.04;
        const a = a0 + curl * t * t;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        const z = Math.sin(t * Math.PI) * 0.18 + (Math.random() - 0.5) * 0.05;
        positions[i * 3] = base[i * 3] = x;
        positions[i * 3 + 1] = base[i * 3 + 1] = y;
        positions[i * 3 + 2] = base[i * 3 + 2] = z;
        if (t < 0.45) tmp.copy(cInner).lerp(cMid, t / 0.45);
        else tmp.copy(cMid).lerp(cOuter, (t - 0.45) / 0.55);
        colors[i * 3] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
        i++;
      }
    }
    const irisGeo = new THREE.BufferGeometry();
    irisGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    irisGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const irisMat = new THREE.PointsMaterial({
      size: 0.04,
      map: sprite,
      vertexColors: true,
      transparent: true,
      opacity: tone === "light" ? 0.9 : 0.95,
      depthWrite: false,
      blending: tone === "light" ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const iris = new THREE.Points(irisGeo, irisMat);
    root.add(iris);

    /* ---------- Pupil ---------- */
    const pupil = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 96),
      new THREE.MeshBasicMaterial({ color: palette.pupil, transparent: true, opacity: 0.96 })
    );
    pupil.position.z = 0.02;
    root.add(pupil);

    const pupilRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.53, 128),
      new THREE.MeshBasicMaterial({ color: palette.ring, transparent: true, opacity: 0.85 })
    );
    pupilRing.position.z = 0.03;
    root.add(pupilRing);

    // Specular catch-light
    const glint = new THREE.Mesh(
      new THREE.CircleGeometry(0.06, 48),
      new THREE.MeshBasicMaterial({ color: "#FFFCF7", transparent: true, opacity: 0.7 })
    );
    glint.position.set(0.17, 0.17, 0.12);
    root.add(glint);

    /* ---------- Instrument rings ---------- */
    const makeRing = (radius: number, color: string, opacity: number, dashed = false, segments = 256) => {
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= segments; s++) {
        const a = (s / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const m = dashed
        ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.06, gapSize: 0.08 })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      const line = new THREE.Line(g, m);
      if (dashed) line.computeLineDistances();
      return line;
    };

    const ringA = makeRing(2.05, palette.ring, 0.55);
    const ringB = makeRing(2.35, palette.ring2, 0.35, true);
    const ringC = makeRing(2.65, palette.ring, 0.18);
    ringA.rotation.x = 1.15;
    ringB.rotation.y = 1.0;
    ringC.rotation.x = -0.5;
    ringC.rotation.y = 0.6;
    root.add(ringA, ringB, ringC);

    // Tick marks on the inner ring, like a measuring instrument
    const tickPts: number[] = [];
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2;
      const r1 = 1.82;
      const r2 = k % 6 === 0 ? 1.95 : 1.88;
      tickPts.push(Math.cos(a) * r1, Math.sin(a) * r1, 0, Math.cos(a) * r2, Math.sin(a) * r2, 0);
    }
    const tickGeo = new THREE.BufferGeometry();
    tickGeo.setAttribute("position", new THREE.Float32BufferAttribute(tickPts, 3));
    const ticks = new THREE.LineSegments(
      tickGeo,
      new THREE.LineBasicMaterial({ color: palette.ring2, transparent: true, opacity: 0.45 })
    );
    root.add(ticks);

    // Orbiting satellite beads
    const beadMat = new THREE.MeshBasicMaterial({ color: palette.ring });
    const beadA = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), beadMat);
    const beadB = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 16), beadMat);
    ringA.add(beadA);
    ringB.add(beadB);

    /* ---------- Dust field ---------- */
    const DUST = 260;
    const dustPos = new Float32Array(DUST * 3);
    for (let d = 0; d < DUST; d++) {
      const r = 2.4 + Math.random() * 2.6;
      const a = Math.random() * Math.PI * 2;
      dustPos[d * 3] = Math.cos(a) * r;
      dustPos[d * 3 + 1] = Math.sin(a) * r * 0.7;
      dustPos[d * 3 + 2] = (Math.random() - 0.5) * 3;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        size: 0.03,
        map: sprite,
        color: palette.dust,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
    );
    scene.add(dust);

    /* ---------- Sizing ---------- */
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // keep the iris framed on narrow containers
      camera.position.z = w / h < 1 ? 6.2 / (w / h) ** 0.6 : 6.2;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    /* ---------- Interaction ---------- */
    const target = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const r = mount.getBoundingClientRect();
      target.x = ((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * 2;
      target.y = ((e.clientY - (r.top + r.height / 2)) / window.innerHeight) * 2;
    };
    if (interactive && !reduce) window.addEventListener("pointermove", onMove, { passive: true });

    /* ---------- Loop ---------- */
    let visible = true;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(mount);

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      const t = clock.getElapsedTime();

      // Breathing pupil + gentle fibre shimmer
      const breathe = 1 + Math.sin(t * 0.9) * 0.06;
      pupil.scale.setScalar(breathe);
      pupilRing.scale.setScalar(breathe);
      const pos = irisGeo.attributes.position.array as Float32Array;
      for (let k = 0; k < count; k++) {
        const bx = base[k * 3];
        const by = base[k * 3 + 1];
        const rr = Math.hypot(bx, by);
        const push = 1 + (breathe - 1) * (1.7 - rr) * 0.35;
        pos[k * 3] = bx * push;
        pos[k * 3 + 1] = by * push;
        pos[k * 3 + 2] = base[k * 3 + 2] + Math.sin(t * 1.4 + rr * 6) * 0.02;
      }
      irisGeo.attributes.position.needsUpdate = true;

      iris.rotation.z = t * 0.04;
      ticks.rotation.z = -t * 0.05;
      ringA.rotation.z = t * 0.25;
      ringB.rotation.z = -t * 0.18;
      ringC.rotation.z = t * 0.1;
      beadA.position.set(Math.cos(t * 0.8) * 2.05, Math.sin(t * 0.8) * 2.05, 0);
      beadB.position.set(Math.cos(-t * 0.6 + 2) * 2.35, Math.sin(-t * 0.6 + 2) * 2.35, 0);
      dust.rotation.z = t * 0.012;

      // Ease toward cursor
      root.rotation.y += (target.x * 0.45 - root.rotation.y) * 0.05;
      root.rotation.x += (target.y * 0.35 - root.rotation.x) * 0.05;
      glint.position.x = 0.17 - root.rotation.y * 0.12;
      glint.position.y = 0.17 + root.rotation.x * 0.12;

      renderer.render(scene, camera);
    };
    if (reduce) {
      renderer.render(scene, camera);
    } else {
      tick();
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      scene.traverse((obj) => {
        const o = obj as THREE.Mesh;
        o.geometry?.dispose?.();
        const mat = o.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
      sprite.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [tone, interactive]);

  return <div ref={mountRef} className={className} aria-hidden />;
}
