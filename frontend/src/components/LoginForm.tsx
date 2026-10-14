"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { AnimatePresence, motion, EASE_OUT, Reveal, Segmented } from "@/components/ui/motion";
import AmbientBackdrop from "@/components/ui/AmbientBackdrop";
import BrandMark from "@/components/ui/BrandMark";

const IrisScene = dynamic(() => import("@/components/ui/IrisScene"), { ssr: false });

const inputCls =
  "nv-input appearance-none block w-full px-3.5 py-2.5 rounded-xl text-[#30251F] placeholder-[#A2948B] text-sm font-medium";
const labelCls = "block text-[11px] uppercase tracking-[0.08em] font-medium text-[#75665D]";

function Field({ label, children, aside }: { label: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className={labelCls}>{label}</label>
        {aside}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");

  // Login form state
  const [identifier, setIdentifier] = useState("nurse");
  const [loginPassword, setLoginPassword] = useState("nurse123");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState("nurse");

  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      await login(identifier, loginPassword);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      const res = await register(regName, regEmail, regPassword, regRole);
      if (res.status === "success") {
        setInfoMessage("Registration successful! A verification link has been sent to your inbox.");
        setMode("login");
        setIdentifier(regEmail);
        setLoginPassword("");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: "login" | "register") => {
    setMode(m);
    setError(null);
    setInfoMessage(null);
  };

  return (
    <div className="relative min-h-screen text-[#30251F] selection:bg-[#EED9CD] overflow-hidden">
      <AmbientBackdrop />

      <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6 px-5 sm:px-8">
        {/* ---------- Left: brand + live 3D iris ---------- */}
        <div className="relative flex flex-col justify-between pt-8 lg:py-12">
          <Reveal className="flex items-center gap-3">
            <BrandMark size={40} />
            <div className="leading-tight">
              <span className="font-semibold tracking-tight text-lg text-[#30251F]">NetraVaani</span>
              <span className="block nv-eyebrow !text-[9px]">Clinical Assistive Suite</span>
            </div>
          </Reveal>

          <div className="relative my-6 lg:my-0">
            <div className="pointer-events-none absolute -inset-x-10 -top-10 h-[300px] sm:h-[380px] lg:h-[460px] lg:-top-24">
              <IrisScene tone="light" className="h-full w-full" />
            </div>
            <div className="relative pt-[260px] sm:pt-[330px] lg:pt-[360px]">
              <Reveal delay={0.1}>
                <span className="nv-eyebrow">Issue 04 &bull; Gaze &amp; Gesture Communication</span>
              </Reveal>
              <Reveal delay={0.18}>
                <h1 className="nv-engraved mt-3 font-semibold text-5xl sm:text-6xl lg:text-7xl tracking-[-0.03em] text-[#30251F]">
                  NetraVaani
                </h1>
              </Reveal>
              <Reveal delay={0.26}>
                <p className="mt-3 max-w-md text-lg text-[#75665D]">
                  Assistive Communication &amp; Nurse Station Gateway
                </p>
              </Reveal>
            </div>
          </div>

          <Reveal delay={0.34} className="hidden lg:grid grid-cols-3 gap-3 max-w-lg">
            {[
              ["Input", "Blink & squeeze"],
              ["Link", "ESP32 Wi-Fi"],
              ["Response", "Live nurse queue"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-[#E7DFD4] bg-[#FFFCF7]/60 backdrop-blur px-3 py-2.5">
                <span className="nv-eyebrow !text-[9px]">{k}</span>
                <span className="block text-xs font-medium text-[#30251F] mt-0.5">{v}</span>
              </div>
            ))}
          </Reveal>
        </div>

        {/* ---------- Right: auth card ---------- */}
        <div className="relative flex items-center justify-center pb-12 lg:py-12 [perspective:1600px]">
          <motion.div
            initial={{ opacity: 0, rotateY: -18, rotateX: 6, y: 30 }}
            animate={{ opacity: 1, rotateY: 0, rotateX: 0, y: 0 }}
            transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.15 }}
            className="nv-card w-full max-w-md rounded-3xl p-6 sm:p-8"
            style={{ boxShadow: "var(--shadow-3)" }}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="nv-eyebrow">Secure access</span>
                <h2 className="font-semibold tracking-tight text-2xl text-[#30251F] mt-1">
                  {mode === "login" ? "Welcome back" : "Create staff account"}
                </h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#E7DFD4] bg-[#F5F0E8] px-2.5 py-1 text-[10px] font-medium text-[#75665D]">
                <span className="nv-live-dot !w-1.5 !h-1.5" />
                TLS
              </span>
            </div>

            <Segmented
              layoutId="auth-mode"
              className="w-full grid grid-cols-2 mb-6"
              value={mode}
              onChange={switchMode}
              items={[
                { value: "login", label: "Sign In" },
                { value: "register", label: "Register Account" },
              ]}
            />

            <AnimatePresence mode="popLayout">
              {infoMessage && (
                <motion.div
                  key="info"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-5 p-3.5 bg-[#EED9CD]/60 border border-[#C56845]/40 text-[#30251F] rounded-xl text-xs font-medium leading-relaxed"
                >
                  {infoMessage}
                </motion.div>
              )}
              {error && (
                <motion.div
                  key="err"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: [0, -6, 6, -3, 3, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45 }}
                  className="mb-5 p-3.5 bg-[#F9ECE7] border border-[#C56845]/60 text-[#8C3A1E] rounded-xl text-xs font-medium leading-relaxed"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="[perspective:1200px]">
              <AnimatePresence mode="wait" initial={false}>
                {mode === "login" ? (
                  <motion.form
                    key="login"
                    className="space-y-4"
                    onSubmit={handleLoginSubmit}
                    initial={{ opacity: 0, rotateY: 70 }}
                    animate={{ opacity: 1, rotateY: 0 }}
                    exit={{ opacity: 0, rotateY: -70 }}
                    transition={{ duration: 0.35, ease: EASE_OUT }}
                    style={{ transformOrigin: "50% 50%" }}
                  >
                    <Field label="Email or Username">
                      <input
                        type="text"
                        required
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="nurse or nurse@hospital.org"
                        className={inputCls}
                      />
                      <p className="mt-1.5 text-[11px] text-[#A2948B]">
                        Quick access: <code className="bg-[#F5F0E8] px-1 py-0.5 rounded text-[#30251F]">nurse</code> or{" "}
                        <code className="bg-[#F5F0E8] px-1 py-0.5 rounded text-[#30251F]">admin</code>
                      </p>
                    </Field>

                    <Field
                      label="Password"
                      aside={
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                          className="text-[11px] font-mono text-[#C56845] hover:text-[#B05534] transition"
                        >
                          {showLoginPassword ? "Hide" : "Show"}
                        </button>
                      }
                    >
                      <input
                        type={showLoginPassword ? "text" : "password"}
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className={inputCls}
                      />
                      <p className="mt-1.5 text-[11px] text-[#A2948B]">
                        Default key: <code className="bg-[#F5F0E8] px-1 py-0.5 rounded text-[#30251F]">nurse123</code> or your registered password
                      </p>
                    </Field>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="nv-btn-primary w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-xs uppercase tracking-[0.14em] font-semibold disabled:opacity-60"
                      >
                        {loading && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                        {loading ? "Authenticating..." : "Sign in to Platform"}
                      </button>
                    </div>
                  </motion.form>
                ) : (
                  <motion.form
                    key="register"
                    className="space-y-4"
                    onSubmit={handleRegisterSubmit}
                    initial={{ opacity: 0, rotateY: -70 }}
                    animate={{ opacity: 1, rotateY: 0 }}
                    exit={{ opacity: 0, rotateY: 70 }}
                    transition={{ duration: 0.35, ease: EASE_OUT }}
                  >
                    <Field label="Full Name">
                      <input
                        type="text"
                        required
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="Sister Priya or Dr. Sharma"
                        className={inputCls}
                      />
                    </Field>

                    <Field label="Email Address">
                      <input
                        type="email"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="priya@hospital.org"
                        className={inputCls}
                      />
                    </Field>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Password">
                        <input
                          type="password"
                          required
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="••••••••"
                          className={inputCls}
                        />
                      </Field>

                      <Field label="Clinical Role">
                        <select
                          value={regRole}
                          onChange={(e) => setRegRole(e.target.value)}
                          className={inputCls}
                        >
                          <option value="nurse">Nurse / Station Staff</option>
                          <option value="doctor">Attending Physician</option>
                          <option value="admin">Platform Administrator</option>
                        </select>
                      </Field>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="nv-btn-primary w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-xs uppercase tracking-[0.14em] font-semibold disabled:opacity-60"
                      >
                        {loading && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                        {loading ? "Registering..." : "Register & Dispatch Verification"}
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

            <div className="nv-divider mt-7 mb-4" />
            <div className="flex items-center justify-between text-[11px] text-[#A2948B]">
              <span>No Tracking</span>
              <span>HTTP-Only Session Token</span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
