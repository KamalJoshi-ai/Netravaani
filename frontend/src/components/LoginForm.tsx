"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth";

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

  return (
    <div className="min-h-screen bg-[#F5F0E8] text-[#30251F] flex flex-col justify-center py-16 px-4 sm:px-6 lg:px-8 selection:bg-[#EED9CD]">
      {/* Editorial Header / Masthead */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="inline-flex items-center gap-2 border-b border-[#E7DFD4] pb-1 mb-2">
          <span className="text-[10px] uppercase font-mono tracking-widest text-[#75665D]">
            Issue 04 &bull; Clinical Assistive Suite
          </span>
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl font-normal text-[#30251F] tracking-tight">
          NetraVaani
        </h1>
        <p className="font-serif italic text-sm text-[#75665D]">
          Assistive Communication &amp; Nurse Station Gateway
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#FFFCF7] py-8 px-6 sm:px-10 rounded-2xl border border-[#E7DFD4] shadow-sm">
          {/* Editorial Tabs */}
          <div className="flex border-b border-[#E7DFD4] mb-6">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setInfoMessage(null);
              }}
              className={`flex-1 pb-3 text-center text-xs font-semibold uppercase tracking-wider transition relative ${
                mode === "login"
                  ? "text-[#C56845]"
                  : "text-[#75665D] hover:text-[#30251F]"
              }`}
            >
              Sign In
              {mode === "login" && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#C56845]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
                setInfoMessage(null);
              }}
              className={`flex-1 pb-3 text-center text-xs font-semibold uppercase tracking-wider transition relative ${
                mode === "register"
                  ? "text-[#C56845]"
                  : "text-[#75665D] hover:text-[#30251F]"
              }`}
            >
              Register Account
              {mode === "register" && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#C56845]" />
              )}
            </button>
          </div>

          {infoMessage && (
            <div className="mb-5 p-3.5 bg-[#EED9CD]/60 border border-[#C56845]/40 text-[#30251F] rounded-xl text-xs font-medium leading-relaxed">
              {infoMessage}
            </div>
          )}

          {error && (
            <div className="mb-5 p-3.5 bg-[#F9ECE7] border border-[#C56845]/60 text-[#8C3A1E] rounded-xl text-xs font-medium leading-relaxed">
              {error}
            </div>
          )}

          {mode === "login" ? (
            <form className="space-y-4" onSubmit={handleLoginSubmit}>
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#75665D]">
                  Email or Username
                </label>
                <div className="mt-1.5">
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="nurse or nurse@hospital.org"
                    className="appearance-none block w-full px-3.5 py-2.5 bg-[#FFFCF7] border border-[#E7DFD4] rounded-xl text-[#30251F] placeholder-[#A2948B] focus:outline-none focus:border-[#C56845] focus:ring-1 focus:ring-[#C56845] text-sm font-medium transition"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-[#A2948B]">
                  Quick access: <code className="bg-[#F5F0E8] px-1 py-0.5 rounded text-[#30251F]">nurse</code> or <code className="bg-[#F5F0E8] px-1 py-0.5 rounded text-[#30251F]">admin</code>
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#75665D]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="text-[11px] font-mono text-[#C56845] hover:text-[#B05534] transition"
                  >
                    {showLoginPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <div className="mt-1.5">
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="appearance-none block w-full px-3.5 py-2.5 bg-[#FFFCF7] border border-[#E7DFD4] rounded-xl text-[#30251F] placeholder-[#A2948B] focus:outline-none focus:border-[#C56845] focus:ring-1 focus:ring-[#C56845] text-sm font-medium transition"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-[#A2948B]">
                  Default key: <code className="bg-[#F5F0E8] px-1 py-0.5 rounded text-[#30251F]">nurse123</code> or your registered password
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider font-bold text-white bg-[#C56845] hover:bg-[#B05534] focus:outline-none shadow-xs transition disabled:opacity-50"
                >
                  {loading ? "Authenticating..." : "Sign in to Platform"}
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleRegisterSubmit}>
              <div>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#75665D]">
                  Full Name
                </label>
                <div className="mt-1.5">
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Sister Priya or Dr. Sharma"
                    className="appearance-none block w-full px-3.5 py-2.5 bg-[#FFFCF7] border border-[#E7DFD4] rounded-xl text-[#30251F] placeholder-[#A2948B] focus:outline-none focus:border-[#C56845] focus:ring-1 focus:ring-[#C56845] text-sm font-medium transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#75665D]">
                  Email Address
                </label>
                <div className="mt-1.5">
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="priya@hospital.org"
                    className="appearance-none block w-full px-3.5 py-2.5 bg-[#FFFCF7] border border-[#E7DFD4] rounded-xl text-[#30251F] placeholder-[#A2948B] focus:outline-none focus:border-[#C56845] focus:ring-1 focus:ring-[#C56845] text-sm font-medium transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#75665D]">
                  Password
                </label>
                <div className="mt-1.5">
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    className="appearance-none block w-full px-3.5 py-2.5 bg-[#FFFCF7] border border-[#E7DFD4] rounded-xl text-[#30251F] placeholder-[#A2948B] focus:outline-none focus:border-[#C56845] focus:ring-1 focus:ring-[#C56845] text-sm font-medium transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-[#75665D]">
                  Clinical Role
                </label>
                <div className="mt-1.5">
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value)}
                    className="appearance-none block w-full px-3.5 py-2.5 bg-[#FFFCF7] border border-[#E7DFD4] rounded-xl text-[#30251F] focus:outline-none focus:border-[#C56845] focus:ring-1 focus:ring-[#C56845] text-sm font-medium transition"
                  >
                    <option value="nurse">Nurse / Station Staff</option>
                    <option value="doctor">Attending Physician</option>
                    <option value="admin">Platform Administrator</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider font-bold text-white bg-[#C56845] hover:bg-[#B05534] focus:outline-none shadow-xs transition disabled:opacity-50"
                >
                  {loading ? "Registering..." : "Register & Dispatch Verification"}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-[#E7DFD4] flex items-center justify-between text-[11px] text-[#A2948B]">
            <span>Editorial UI &bull; No Tracking</span>
            <span>HTTP-Only Session Token</span>
          </div>
        </div>
      </div>
    </div>
  );
}
