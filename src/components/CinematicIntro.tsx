// src/components/CinematicIntro.tsx
// Cinematic 3D intro scene for 7dotIT Solutions.
// 7 glowing crimson orbs fly in from deep space and assemble into the company
// logo cluster, then the brand name reveals. Plays once per session.

import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { motion } from "framer-motion";

// ── Timing (seconds) ──────────────────────────────────────────────────────────
const PHASE1_END   = 1.8;  // all dots settled
const TEXT_FADE_IN = 2.0;  // text starts appearing
const PHASE2_END   = 3.6;  // fade-out begins
const TOTAL_END    = 4.6;  // call onDone

// ── Colors ────────────────────────────────────────────────────────────────────
const DOT_CORE    = new THREE.Color("#c62222");
const DOT_EMIT    = new THREE.Color("#8B1A1A");
const GLOW_INNER  = new THREE.Color("#6B0000");
const GLOW_OUTER  = new THREE.Color("#2d0000");

// ── The 7 orb configs ─────────────────────────────────────────────────────────
interface OrbCfg {
  target: THREE.Vector3;
  start:  THREE.Vector3;
  r:      number;
  arrive: number; // seconds into scene
}

const ORBS: OrbCfg[] = [
  { target: new THREE.Vector3( 0.0,  0.0,  0.0 ), start: new THREE.Vector3(-13,  9,  -7), r: 0.50, arrive: 0.75 },
  { target: new THREE.Vector3( 1.85, 0.85, 0.3 ), start: new THREE.Vector3( 11, -6,   9), r: 0.32, arrive: 0.95 },
  { target: new THREE.Vector3( 2.9, -0.4, -0.2 ), start: new THREE.Vector3(  7, 13,  -5), r: 0.22, arrive: 1.15 },
  { target: new THREE.Vector3(-0.8,  1.25, 0.4 ), start: new THREE.Vector3( -9,-11,   6), r: 0.28, arrive: 0.85 },
  { target: new THREE.Vector3(-1.7, -0.6,  0.5 ), start: new THREE.Vector3(  5,  8, -13), r: 0.18, arrive: 1.25 },
  { target: new THREE.Vector3( 0.4, -1.6, -0.4 ), start: new THREE.Vector3( -6, -9,  10), r: 0.20, arrive: 1.10 },
  { target: new THREE.Vector3( 2.1, -1.3,  0.6 ), start: new THREE.Vector3( 10,  4,   7), r: 0.16, arrive: 1.35 },
];

// ── Easing ────────────────────────────────────────────────────────────────────
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
    const count = 900;
    const pos   = new Float32Array(count * 3);
    const col   = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 22 + Math.random() * 28;

      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      const b = 0.45 + Math.random() * 0.55;
      const red = Math.random() < 0.35;
      col[i * 3]     = b;
      col[i * 3 + 1] = red ? b * 0.4 : b * 0.85;
      col[i * 3 + 2] = red ? b * 0.4 : b * 0.85;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color",    new THREE.BufferAttribute(col, 3));
    return g;
  }, []);

  useFrame((_, dt) => {
    ref.current.rotation.y += dt * 0.018;
    ref.current.rotation.x += dt * 0.004;
  });

  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial
        size={0.055}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  );
}

// ── Single orb with glow layers ───────────────────────────────────────────────
function Orb({ cfg, elapsed }: { cfg: OrbCfg; elapsed: React.MutableRefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null!);
  const coreRef  = useRef<THREE.Mesh>(null!);
  const curPos   = useMemo(() => cfg.start.clone(), [cfg]);

  useFrame(() => {
    const t  = elapsed.current;
    const p  = clamp01(t / cfg.arrive);
    curPos.lerpVectors(cfg.start, cfg.target, easeOutExpo(p));
    groupRef.current.position.copy(curPos);

    // pulse glow once settled
    if (t > cfg.arrive) {
      const pulse = Math.sin(t * 2.8 + cfg.arrive * 7) * 0.5 + 0.5;
      const mat = coreRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.2 + pulse * 1.2;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[cfg.r, 32, 32]} />
        <meshStandardMaterial
          color={DOT_CORE}
          emissive={DOT_EMIT}
          emissiveIntensity={1.2}
          roughness={0.15}
          metalness={0.7}
        />
      </mesh>
      {/* Inner glow halo */}
      <mesh>
        <sphereGeometry args={[cfg.r * 2.2, 16, 16]} />
        <meshBasicMaterial
          color={GLOW_INNER}
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
      {/* Outer glow halo */}
      <mesh>
        <sphereGeometry args={[cfg.r * 4.0, 16, 16]} />
        <meshBasicMaterial
          color={GLOW_OUTER}
          transparent
          opacity={0.07}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}

// ── Camera controller ─────────────────────────────────────────────────────────
function CameraRig({ elapsed }: { elapsed: React.MutableRefObject<number> }) {
  useFrame(({ camera }) => {
    const t = elapsed.current;

    // Slowly zoom in as dots assemble, then gentle orbit
    const zoomP = clamp01(t / PHASE1_END);
    const z = 13 - easeOutExpo(zoomP) * 4.5; // 13 → 8.5

    const orbit = t * 0.18;
    camera.position.set(
      Math.sin(orbit) * 1.8,
      Math.cos(orbit * 0.6) * 0.9,
      z,
    );
    camera.lookAt(0.6, 0, 0);
  });
  return null;
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene({ elapsed }: { elapsed: React.MutableRefObject<number> }) {
  return (
    <>
      <fog attach="fog" args={["#050000", 14, 55]} />
      <ambientLight intensity={0.25} color="#1a0000" />
      <pointLight position={[0, 0, 4]}  intensity={3}   color="#ff2222" decay={2} />
      <pointLight position={[3, 2, 2]}  intensity={1.2} color="#cc0000" decay={2} />
      <pointLight position={[-2,-1, 3]} intensity={0.8} color="#ff4444" decay={2} />
      <Stars />
      {ORBS.map((cfg, i) => <Orb key={i} cfg={cfg} elapsed={elapsed} />)}
      <CameraRig elapsed={elapsed} />
    </>
  );
}

// ── Root component ────────────────────────────────────────────────────────────
interface Props {
  onDone: () => void;
}

export default function CinematicIntro({ onDone }: Props) {
  const elapsed       = useRef(0);
  const startRef      = useRef(Date.now());
  const onDoneRef     = useRef(onDone);
  const showTextFlag  = useRef(false);
  const fadeOutFlag   = useRef(false);
  const doneFlag      = useRef(false);

  const [showText, setShowText] = useState(false);
  const [fadeOut,  setFadeOut]  = useState(false);

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    let raf: number;

    function tick() {
      const t = (Date.now() - startRef.current) / 1000;
      elapsed.current = t;

      if (t >= TEXT_FADE_IN && !showTextFlag.current) {
        showTextFlag.current = true;
        setShowText(true);
      }
      if (t >= PHASE2_END && !fadeOutFlag.current) {
        fadeOutFlag.current = true;
        setFadeOut(true);
      }
      if (t >= TOTAL_END && !doneFlag.current) {
        doneFlag.current = true;
        onDoneRef.current();
        return;
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  function skip() {
    if (!doneFlag.current) {
      doneFlag.current = true;
      onDoneRef.current();
    }
  }

  return (
    <div
      style={{
        position:   "fixed",
        inset:      0,
        background: "#000",
        zIndex:     9999,
        overflow:   "hidden",
        cursor:     "default",
      }}
    >
      {/* 3D canvas */}
      <Canvas
        camera={{ position: [0, 0, 13], fov: 58 }}
        style={{ width: "100%", height: "100%" }}
        gl={{
          antialias:           true,
          toneMapping:         THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.6,
        }}
      >
        <Scene elapsed={elapsed} />
      </Canvas>

      {/* Vignette */}
      <div style={{
        position:       "absolute",
        inset:          0,
        background:     "radial-gradient(ellipse at 50% 50%, transparent 38%, rgba(0,0,0,0.75) 100%)",
        pointerEvents:  "none",
      }} />

      {/* Subtle scanline texture */}
      <div style={{
        position:        "absolute",
        inset:           0,
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)",
        pointerEvents:   "none",
      }} />

      {/* Brand text overlay */}
      <div style={{
        position:       "absolute",
        inset:          0,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        pointerEvents:  "none",
        gap:            10,
      }}>
        {/* "Powered by" label */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={showText ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.9, ease: "easeOut" }}
          style={{
            color:         "rgba(180, 40, 40, 0.65)",
            fontSize:      11,
            fontFamily:    "'Inter', -apple-system, sans-serif",
            letterSpacing: 7,
            textTransform: "uppercase",
            fontWeight:    400,
          }}
        >
          Powered by
        </motion.div>

        {/* Main logo text */}
        <motion.div
          initial={{ opacity: 0, scale: 0.88, y: 6 }}
          animate={showText ? { opacity: 1, scale: 1, y: 0 } : {}}
          transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          style={{
            fontFamily:    "'Inter', -apple-system, sans-serif",
            fontWeight:    800,
            fontSize:      60,
            letterSpacing: -2,
            lineHeight:    1,
            color:         "#ffffff",
            textShadow:    "0 0 50px rgba(180,30,30,0.9), 0 0 100px rgba(139,26,26,0.5), 0 0 160px rgba(100,10,10,0.3)",
          }}
        >
          7dot<span style={{ color: "#c62222" }}>IT</span>
        </motion.div>

        {/* "Solutions" subtitle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={showText ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.85, ease: "easeOut", delay: 0.28 }}
          style={{
            color:         "rgba(255,255,255,0.35)",
            fontSize:      13,
            fontFamily:    "'Inter', -apple-system, sans-serif",
            letterSpacing: 5,
            textTransform: "uppercase",
            fontWeight:    300,
          }}
        >
          Solutions
        </motion.div>

        {/* Domain */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={showText ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.55 }}
          style={{
            color:         "rgba(180, 40, 40, 0.45)",
            fontSize:      11,
            fontFamily:    "'Inter', -apple-system, sans-serif",
            letterSpacing: 2.5,
            marginTop:     10,
          }}
        >
          7dotit.com
        </motion.div>

        {/* Thin red divider line */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={showText ? { scaleX: 1, opacity: 1 } : {}}
          transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
          style={{
            width:           120,
            height:          1,
            background:      "linear-gradient(90deg, transparent, #8B1A1A, transparent)",
            transformOrigin: "center",
            marginTop:       4,
          }}
        />
      </div>

      {/* Fade-to-black overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={fadeOut ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 1.0, ease: "easeIn" }}
        style={{
          position:      "absolute",
          inset:         0,
          background:    "#000",
          pointerEvents: "none",
        }}
      />

      {/* Skip button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.35 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        whileHover={{ opacity: 0.7 }}
        onClick={skip}
        style={{
          position:       "absolute",
          bottom:         24,
          right:          28,
          background:     "transparent",
          border:         "none",
          color:          "rgba(255,255,255,0.6)",
          fontSize:       10,
          fontFamily:     "'Inter', sans-serif",
          letterSpacing:  2,
          cursor:         "pointer",
          textTransform:  "uppercase",
          padding:        "6px 10px",
        }}
      >
        Skip ›
      </motion.button>
    </div>
  );
}
