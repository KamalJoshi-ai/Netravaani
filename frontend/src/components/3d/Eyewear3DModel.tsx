"use client";

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface EyewearProps {
  exploded?: boolean;
  activeSensor?: string | null;
}

/**
 * Procedural 3D Model of the NetraVaani NPG Smart Eyewear & Gaze Tracker.
 * Built with pure Three.js geometries for 60FPS performance and 0 asset latency.
 * Smoothly follows visitor gaze and pointer movements in real-time.
 */
export default function Eyewear3DModel({ exploded = false, activeSensor }: EyewearProps) {
  const rootGroup = useRef<THREE.Group>(null);
  const leftLensRef = useRef<THREE.Mesh>(null);
  const rightLensRef = useRef<THREE.Mesh>(null);
  const leftEogSensorRef = useRef<THREE.Mesh>(null);
  const rightEogSensorRef = useRef<THREE.Mesh>(null);
  const leftTempleRef = useRef<THREE.Group>(null);
  const rightTempleRef = useRef<THREE.Group>(null);

  useFrame(({ pointer, clock }) => {
    if (!rootGroup.current) return;

    // Smooth cursor-driven gaze tracking rotation
    const targetRotX = (-pointer.y * 0.35);
    const targetRotY = (pointer.x * 0.55);

    rootGroup.current.rotation.x = THREE.MathUtils.lerp(rootGroup.current.rotation.x, targetRotX, 0.08);
    rootGroup.current.rotation.y = THREE.MathUtils.lerp(rootGroup.current.rotation.y, targetRotY, 0.08);

    // Subtle breathing float animation
    const t = clock.getElapsedTime();
    rootGroup.current.position.y = Math.sin(t * 1.5) * 0.08;

    // Exploded view animation when triggered
    const explodeOffset = exploded ? 0.6 : 0;
    if (leftTempleRef.current) {
      leftTempleRef.current.position.x = THREE.MathUtils.lerp(
        leftTempleRef.current.position.x,
        -1.3 - explodeOffset,
        0.1
      );
    }
    if (rightTempleRef.current) {
      rightTempleRef.current.position.x = THREE.MathUtils.lerp(
        rightTempleRef.current.position.x,
        1.3 + explodeOffset,
        0.1
      );
    }
  });

  const frameColor = "#1E293B";
  const electrodeColor = activeSensor === "eog" ? "#10B981" : "#059669";
  const emgColor = activeSensor === "emg" ? "#F59E0B" : "#D97706";
  const bleColor = activeSensor === "ble" ? "#3B82F6" : "#2563EB";

  return (
    <group ref={rootGroup} scale={[1.4, 1.4, 1.4]} dispose={null}>
      {/* Central Bridge */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.45, 16]} />
        <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.8} />
      </mesh>

      {/* Nose Pads */}
      <mesh position={[-0.18, -0.05, -0.08]} rotation={[0.2, 0.3, 0]}>
        <capsuleGeometry args={[0.03, 0.12, 8, 16]} />
        <meshStandardMaterial color="#64748B" roughness={0.6} />
      </mesh>
      <mesh position={[0.18, -0.05, -0.08]} rotation={[0.2, -0.3, 0]}>
        <capsuleGeometry args={[0.03, 0.12, 8, 16]} />
        <meshStandardMaterial color="#64748B" roughness={0.6} />
      </mesh>

      {/* LEFT EYE FRAME & LENS */}
      <group position={[-0.75, 0.1, 0]}>
        {/* Frame Ring */}
        <mesh>
          <torusGeometry args={[0.48, 0.045, 16, 48]} />
          <meshStandardMaterial color={frameColor} roughness={0.25} metalness={0.7} />
        </mesh>
        {/* Lens */}
        <mesh ref={leftLensRef} position={[0, 0, 0.01]}>
          <cylinderGeometry args={[0.46, 0.46, 0.02, 32]} />
          <meshPhysicalMaterial
            color="#38BDF8"
            transparent
            opacity={0.35}
            roughness={0.1}
            transmission={0.85}
            thickness={0.5}
          />
        </mesh>
        {/* EOG Gaze Electrode Nodes (Inner rim) */}
        <mesh ref={leftEogSensorRef} position={[0, 0.46, 0.06]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshStandardMaterial color={electrodeColor} emissive={electrodeColor} emissiveIntensity={0.6} metalness={0.9} />
        </mesh>
        <mesh position={[0, -0.46, 0.06]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshStandardMaterial color={electrodeColor} emissive={electrodeColor} emissiveIntensity={0.6} metalness={0.9} />
        </mesh>
      </group>

      {/* RIGHT EYE FRAME & LENS */}
      <group position={[0.75, 0.1, 0]}>
        {/* Frame Ring */}
        <mesh>
          <torusGeometry args={[0.48, 0.045, 16, 48]} />
          <meshStandardMaterial color={frameColor} roughness={0.25} metalness={0.7} />
        </mesh>
        {/* Lens */}
        <mesh ref={rightLensRef} position={[0, 0, 0.01]}>
          <cylinderGeometry args={[0.46, 0.46, 0.02, 32]} />
          <meshPhysicalMaterial
            color="#38BDF8"
            transparent
            opacity={0.35}
            roughness={0.1}
            transmission={0.85}
            thickness={0.5}
          />
        </mesh>
        {/* EOG Gaze Electrode Nodes (Inner rim) */}
        <mesh ref={rightEogSensorRef} position={[0, 0.46, 0.06]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshStandardMaterial color={electrodeColor} emissive={electrodeColor} emissiveIntensity={0.6} metalness={0.9} />
        </mesh>
        <mesh position={[0, -0.46, 0.06]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshStandardMaterial color={electrodeColor} emissive={electrodeColor} emissiveIntensity={0.6} metalness={0.9} />
        </mesh>
      </group>

      {/* LEFT TEMPLE & SQUEEZE SENSORS */}
      <group ref={leftTempleRef} position={[-1.25, 0.1, 0]}>
        {/* Temple Arm */}
        <mesh position={[0, 0, -0.8]} rotation={[0, 0.1, 0]}>
          <boxGeometry args={[0.06, 0.1, 1.6]} />
          <meshStandardMaterial color={frameColor} roughness={0.4} metalness={0.5} />
        </mesh>
        {/* EMG Micro-Squeeze Detector Pad */}
        <mesh position={[-0.04, -0.01, -1.1]}>
          <boxGeometry args={[0.03, 0.08, 0.35]} />
          <meshStandardMaterial color={emgColor} emissive={emgColor} emissiveIntensity={0.5} metalness={0.8} />
        </mesh>
        {/* BLE Telemetry Node */}
        <mesh position={[-0.02, 0.02, -0.3]}>
          <cylinderGeometry args={[0.04, 0.04, 0.05, 16]} />
          <meshStandardMaterial color={bleColor} emissive={bleColor} emissiveIntensity={0.8} />
        </mesh>
      </group>

      {/* RIGHT TEMPLE & SQUEEZE SENSORS */}
      <group ref={rightTempleRef} position={[1.25, 0.1, 0]}>
        {/* Temple Arm */}
        <mesh position={[0, 0, -0.8]} rotation={[0, -0.1, 0]}>
          <boxGeometry args={[0.06, 0.1, 1.6]} />
          <meshStandardMaterial color={frameColor} roughness={0.4} metalness={0.5} />
        </mesh>
        {/* EMG Micro-Squeeze Detector Pad */}
        <mesh position={[0.04, -0.01, -1.1]}>
          <boxGeometry args={[0.03, 0.08, 0.35]} />
          <meshStandardMaterial color={emgColor} emissive={emgColor} emissiveIntensity={0.5} metalness={0.8} />
        </mesh>
        {/* Clinical Status Indicator LED (Solid Emerald) */}
        <mesh position={[0.04, 0.03, -0.2]}>
          <sphereGeometry args={[0.03, 16, 16]} />
          <meshStandardMaterial color="#059669" emissive="#10B981" emissiveIntensity={1.2} />
        </mesh>
      </group>
    </group>
  );
}

