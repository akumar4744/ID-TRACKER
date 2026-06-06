// src/components/CinematicIntro.tsx
// Cinematic 3D intro for 7dotIT Solutions.
// Uses meshBasicMaterial (no lighting dependency) so orbs are always bright.

import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { motion } from "framer-motion";

// ── Timing (seconds) ──────────────────────────────────────────────────────────
const PHASE1_END = 1.8;   // all orbs settled
const TEXT_IN    = 2.0;   // brand text starts appearing
const FADE_START = 3.6;   // fade-to-black begins
const TOTAL      = 4.6;   // call onDone

// ── Orb configs ───────────────────────────────────────────────────────────────
interface OrbCfg {
  target: [number, number, number];
  start:  [number, number, number];
  r:      number;
  arrive: number;
}

const ORBS: OrbCfg[] = [
  { target: [ 0.0,  0.0,  0.0 ], start: [-13,  9, -7 ], r: 0.70, arrive: 0.75 },
  { target: [ 2.4,  1.1,  0.4 ], start: [ 11, -6,  9 ], r: 0.45, arrive: 0.95 },
  { target: [ 3.8, -0.5, -0.3 ], start: [  7, 13, -5 ], r: 0.32, arrive: 1.15 },
  { target: [-1.1,  1.7,  0.5 ], start: [ -9,-11,  6 ], r: 0.38, arrive: 0.85 },
  { target: [-2.2, -0.8,  0.7 ], start: [  5,  8,-13 ], r: 0.26, arrive: 1.25 },
  { target: [ 0.5, -2.1, -0.5 ], start: [ -6, -9, 10 ], r: 0.28, arrive: 1.10 },
  { target: [ 2.8, -1.7,  0.8 ], start: [ 10,  4,  7 ], r: 0.22, arrive: 1.35 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ── Star field ────────────────────────────────────────────────────────────────
function Stars() {
  const ref = useRef<THREE.Points>(null!);

  const geo = useMemo(() => {
    const COUNT = 1400;
    const pos   = new Float32Array(COUNT * 3);
    const col   = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 25 + Math.random() * 30;
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      const b   = 0.55 + Math.random() * 0.45;
      const red = Math.random() < 0.3;
      col[i * 3]     = b;
      col[i * 3 + 1] = red ? b * 0.25 : b * 0.82;
      col[i * 3 + 2] = red ? b * 0.25 : b * 0.82;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color",    new THREE.BufferAttribute(col, 3));
    return g;
  }, []);

  useFrame((_, dt) => {
    ref.current.rotation.y += dt * 0.015;
    ref.current.rotation.x += dt * 0.004;
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        vertexColors
        size={0.065}
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
  );
}

// ── Single glowing orb ────────────────────────────────────────────────────────
function Orb({ cfg, elapsed }: { cfg: OrbCfg; elapsed: React.MutableRefObject<number> }) {
  const groupRef  = useRef<THREE.Group>(null!);
  const pulseRef  = useRef<THREE.Mesh>(null!);

  const tgt = useMemo(() => new THREE.Vector3(...cfg.target), [cfg]);
  const src = useMemo(() => new THREE.Vector3(...cfg.start),  [cfg]);
  const cur = useMemo(() => src.clone(), [src]);

  useFrame(() => {
    const t = elapsed.current;

    // Fly-in
    cur.lerpVectors(src, tgt, easeOutExpo(clamp01(t / cfg.arrive)));
    groupRef.current.position.copy(cur);

    // Pulse inner glow once settled
    if (t > cfg.arrive && pulseRef.current) {
      const p   = (Math.sin(t * 2.6 + cfg.arrive * 4.5) + 1) * 0.5;
      const mat = pulseRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.22 + p * 0.18;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Solid bright core */}
      <mesh>
        <sphereGeometry args={[cfg.r, 32, 32]} />
        <meshBasicMaterial color="#ff3333" />
      </mesh>

      {/* Hot white-pink highlight at centre */}
      <mesh>
        <sphereGeometry args={[cfg.r * 0.5, 16, 16]} />
        <meshBasicMaterial
          color="#ffbbbb"
          transparent
          opacity={0.75}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Inner crimson glow — pulsing */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[cfg.r * 2.5, 20, 20]} />
        <meshBasicMaterial
          color="#cc1111"
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Outer soft halo */}
      <mesh>
        <sphereGeometry args={[cfg.r * 4.8, 16, 16]} />
        <meshBasicMaterial
          color="#550000"
          transparent
          opacity={0.07}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Camera ────────────────────────────────────────────────────────────────────
function CameraRig({ elapsed }: { elapsed: React.MutableRefObject<number> }) {
  useFrame(({ camera }) => {
    const t   = elapsed.current;
    const p   = clamp01(t / PHASE1_END);
    const z   = 14 - easeOutExpo(p) * 5;      // pulls from z=14 → z=9
    const orb = t * 0.16;
    camera.position.set(
      Math.sin(orb) * 1.6,
      Math.cos(orb * 0.55) * 0.8,
      z,
    );
    camera.lookAt(0.6, 0, 0);
  });
  return null;
}

// ── Scene root ────────────────────────────────────────────────────────────────
function Scene({ elapsed }: { elapsed: React.MutableRefObject<number> }) {
  return (
    <>
      <Stars />
      {ORBS.map((cfg, i) => (
        <Orb key={i} cfg={cfg} elapsed={elapsed} />
      ))}
      <CameraRig elapsed={elapsed} />
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
interface Props { onDone: () => void; }

export default function CinematicIntro({ onDone }: Props) {
  const elapsed    = useRef(0);
  const startRef   = useRef(Date.now());
  const onDoneRef  = useRef(onDone);
  const didText    = useRef(false);
  const didFade    = useRef(false);
  const didDone    = useRef(false);

  const [showText, setShowText] = useState(false);
  const [fadeOut,  setFadeOut]  = useState(false);

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    let raf: number;
    function tick() {
      const t = (Date.now() - startRef.current) / 1000;
      elapsed.current = t;
      if (t >= TEXT_IN    && !didText.current)  { didText.current = true;  setShowText(true); }
      if (t >= FADE_START && !didFade.current)  { didFade.current = true;  setFadeOut(true);  }
      if (t >= TOTAL      && !didDone.current)  { didDone.current = true;  onDoneRef.current(); return; }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  function skip() {
    if (!didDone.current) { didDone.current = true; onDoneRef.current(); }
  }

  return (
    <div style={{
      position:   "fixed",
      top: 0, left: 0,
      width:      "100vw",
      height:     "100vh",
      background: "#060606",
      zIndex:     9999,
      overflow:   "hidden",
    }}>

      {/* ── Three.js canvas ── */}
      <Canvas
        camera={{ position: [0, 0, 14], fov: 60 }}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
      >
        <Scene elapsed={elapsed} />
      </Canvas>

      {/* ── Vignette ── */}
      <div style={{
        position:      "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        background:    "radial-gradient(ellipse at 50% 50%, transparent 32%, rgba(0,0,0,0.78) 100%)",
        pointerEvents: "none",
      }} />

      {/* ── Brand text overlay ── */}
      <div style={{
        position:       "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            10,
        pointerEvents:  "none",
      }}>

        {/* "Powered by" */}
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={showText ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.9 }}
          style={{
            color:         "#cc3333",
            fontSize:      11,
            fontFamily:    "'Inter', -apple-system, sans-serif",
            letterSpacing: 7,
            textTransform: "uppercase" as const,
          }}
        >
          Powered by
        </motion.div>

        {/* 7dotIT */}
        <motion.div
          initial={{ opacity: 0, scale: 0.84 }}
          animate={showText ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 1.05, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
          style={{
            fontFamily:    "'Inter', -apple-system, sans-serif",
            fontWeight:    800,
            fontSize:      70,
            letterSpacing: -2,
            lineHeight:    1,
            color:         "#ffffff",
            textShadow:    [
              "0 0 30px rgba(255,60,60,1)",
              "0 0 70px rgba(220,20,20,0.75)",
              "0 0 130px rgba(160,10,10,0.45)",
            ].join(", "),
          }}
        >
          7dot<span style={{ color: "#ff3333" }}>IT</span>
        </motion.div>

        {/* Solutions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={showText ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.85, delay: 0.28 }}
          style={{
            color:         "rgba(255,255,255,0.38)",
            fontSize:      13,
            fontFamily:    "'Inter', -apple-system, sans-serif",
            letterSpacing: 5.5,
            textTransform: "uppercase" as const,
            fontWeight:    300,
          }}
        >
          Solutions
        </motion.div>

        {/* Red divider line */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={showText ? { scaleX: 1, opacity: 1 } : {}}
          transition={{ duration: 0.85, ease: "easeOut", delay: 0.22 }}
          style={{
            width:           140,
            height:          1,
            background:      "linear-gradient(90deg, transparent, #ff3333 40%, #ff3333 60%, transparent)",
            transformOrigin: "center",
            marginTop:       4,
          }}
        />

        {/* Domain */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={showText ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.55 }}
          style={{
            color:         "rgba(210, 55, 55, 0.5)",
            fontSize:      11,
            fontFamily:    "'Inter', -apple-system, sans-serif",
            letterSpacing: 3,
            marginTop:     4,
          }}
        >
          7dotit.com
        </motion.div>
      </div>

      {/* ── Fade-to-black ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: fadeOut ? 1 : 0 }}
        transition={{ duration: 1.0, ease: "easeIn" }}
        style={{
          position:      "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          background:    "#000",
          pointerEvents: "none",
        }}
      />

      {/* ── Skip button ── */}
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.45 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        whileHover={{ opacity: 0.85 }}
        onClick={skip}
        style={{
          position:      "absolute",
          bottom:        24,
          right:         28,
          background:    "transparent",
          border:        "1px solid rgba(255,255,255,0.18)",
          borderRadius:  6,
          color:         "rgba(255,255,255,0.65)",
          fontSize:      10,
          fontFamily:    "'Inter', sans-serif",
          letterSpacing: 2.5,
          cursor:        "pointer",
          textTransform: "uppercase" as const,
          padding:       "6px 14px",
        }}
      >
        Skip ›
      </motion.button>
    </div>
  );
}
