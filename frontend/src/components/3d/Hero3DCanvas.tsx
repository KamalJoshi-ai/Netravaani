"use client";

import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import Eyewear3DModel from "./Eyewear3DModel";

interface Hero3DCanvasProps {
  exploded?: boolean;
  activeSensor?: string | null;
}

export default function Hero3DCanvas({ exploded = false, activeSensor }: Hero3DCanvasProps) {
  return (
    <div className="w-full h-full min-h-[380px] sm:min-h-[460px] relative select-none cursor-grab active:cursor-grabbing">
      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 6, 4]} intensity={1.8} color="#FFFFFF" />
        <directionalLight position={[-5, -4, -3]} intensity={0.6} color="#94A3B8" />
        <pointLight position={[0, 2, 2]} intensity={0.8} color="#38BDF8" />

        <Suspense fallback={null}>
          <Eyewear3DModel exploded={exploded} activeSensor={activeSensor} />
        </Suspense>
      </Canvas>
    </div>
  );
}

