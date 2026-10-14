/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { motion, AnimatePresence, EASE_OUT, Reveal } from "@/components/ui/motion";
import AmbientBackdrop from "@/components/ui/AmbientBackdrop";
import BrandMark from "@/components/ui/BrandMark";

export default function VerifyEmailPage() {
  const params = useParams();
  const router = useRouter();
  const { refreshAuth } = useAuth();
  const token = params?.token as string;

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("Verifying your email token...");

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setMessage("Verification token is missing in URL.");
      return;
    }

    let isMounted = true;

    async function verify() {
      try {
        const res = await apiClient.verifyEmail(token);
        if (!isMounted) return;

        if (res.status === "success") {
          setSuccess(true);
          setMessage("Email verified successfully! Your account is active.");
          await refreshAuth();
        } else {
          setSuccess(false);
          setMessage(res.message || "Failed to verify email token.");
        }
      } catch (err: any) {
        if (!isMounted) return;
        setSuccess(false);
        setMessage(err?.message || "Invalid or expired verification token.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [token, refreshAuth]);

  return (
    <div className="relative min-h-screen text-[#30251F] flex flex-col justify-center py-16 px-4 sm:px-6 selection:bg-[#EED9CD]">
      <AmbientBackdrop />

      <div className="relative z-10 mx-auto w-full max-w-md text-center space-y-2">
        <Reveal className="flex justify-center mb-3">
          <BrandMark size={52} />
        </Reveal>
        <Reveal delay={0.05}>
          <span className="nv-eyebrow">Official Verification Dispatch</span>
        </Reveal>
        <Reveal delay={0.1}>
          <h1 className="nv-engraved font-semibold text-5xl text-[#30251F] tracking-tight">NetraVaani</h1>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="text-sm text-[#75665D]">Account Authentication &bull; Medical Staff Onboarding</p>
        </Reveal>
      </div>

      <div className="relative z-10 mt-8 mx-auto w-full max-w-md [perspective:1400px]">
        <motion.div
          initial={{ opacity: 0, rotateX: 16, y: 24 }}
          animate={{ opacity: 1, rotateX: 0, y: 0 }}
          transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.15 }}
          className="nv-card rounded-3xl py-8 px-6 sm:px-10 text-center"
          style={{ boxShadow: "var(--shadow-3)" }}
        >
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" exit={{ opacity: 0, scale: 0.95 }} className="py-8 space-y-5">
                <div className="mx-auto h-14 w-14 [perspective:300px]">
                  <motion.div
                    className="h-full w-full rounded-full border-2 border-[#E7DFD4] border-t-[#C56845] border-r-[#C56845]"
                    animate={{ rotateZ: 360, rotateX: [0, 60, 0] }}
                    transition={{ rotateZ: { repeat: Infinity, duration: 1, ease: "linear" }, rotateX: { repeat: Infinity, duration: 2 } }}
                  />
                </div>
                <p className="text-sm text-[#75665D]">{message}</p>
              </motion.div>
            ) : success ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, rotateY: 90 }}
                animate={{ opacity: 1, rotateY: 0 }}
                transition={{ duration: 0.6, ease: EASE_OUT }}
                className="py-2 space-y-5"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.2 }}
                  className="mx-auto h-14 w-14 rounded-full grid place-items-center nv-btn-primary"
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45, duration: 0.5 }} />
                  </svg>
                </motion.div>
                <div className="p-4 bg-[#EED9CD]/60 border border-[#C56845]/40 text-[#30251F] rounded-2xl text-sm font-medium">
                  {message}
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="nv-btn-primary w-full flex justify-center py-3 px-4 rounded-xl text-xs uppercase tracking-[0.14em] font-semibold"
                >
                  Proceed to NetraVaani Dashboard &rarr;
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="error"
                initial={{ opacity: 0, x: 0 }}
                animate={{ opacity: 1, x: [0, -8, 8, -4, 4, 0] }}
                transition={{ duration: 0.5 }}
                className="py-2 space-y-5"
              >
                <div className="p-4 bg-[#F9ECE7] border border-[#C56845]/50 text-[#8C3A1E] rounded-2xl text-sm font-medium">
                  {message}
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="nv-btn-ghost w-full flex justify-center py-3 px-4 rounded-xl text-xs uppercase tracking-[0.14em] font-medium text-[#75665D]"
                >
                  Back to Sign In
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
