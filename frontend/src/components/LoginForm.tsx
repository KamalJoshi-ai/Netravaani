"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/lib/theme";
import { Shield, Bed, Mail } from "@/lib/noIcons";

export default function LoginForm() {
  const { login, register } = useAuth();

  // Mode: Sign In or Sign Up
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  // Role for Sign Up: Strictly Patient or Nurse
  const [signupRole, setSignupRole] = useState<"patient" | "nurse">("patient");

  // Form Fields
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Status
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (authMode === "signup") {
        if (!name.trim()) throw new Error("Full name is required");
        const normalizedUsername = username.trim().toLowerCase();
        if (!normalizedUsername) throw new Error("Unique username is required");
        if (!/^[a-zA-Z0-9_-]{3,30}$/.test(normalizedUsername)) {
          throw new Error("Username must be 3-30 characters with letters, numbers, underscores, or hyphens only");
        }
        if (!identifier.trim()) throw new Error("Email address is required");
        if (!password || password.length < 6) {
          throw new Error("Password must be at least 6 characters");
        }

        await register(name.trim(), identifier.trim(), password, signupRole, normalizedUsername);
        setSuccessMsg(
          `Account registered for @${normalizedUsername} (${
            signupRole === "patient" ? "Patient" : "Nurse"
          })! Please check your email to verify your account.`
        );
        // Switch to login tab so user can immediately sign in
        setAuthMode("login");
      } else {
        // Sign In (Unified credentials - role is automatically determined by account)
        if (!identifier.trim()) throw new Error("Please enter your email or username");
        if (!password) throw new Error("Password is required");

        await login(identifier.trim(), password);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      if (
        msg.includes("USERNAME_TAKEN") ||
        msg.toLowerCase().includes("username already taken") ||
        msg.toLowerCase().includes("username is already taken")
      ) {
        setError("This username is already taken. Please choose a different username.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] text-[#0F172A] dark:text-[#F8FAFC] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative transition-colors duration-150">
      {/* Top-Right Theme Toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="flex items-center justify-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#059669] text-white flex items-center justify-center font-heading font-black text-sm shadow-xs">
            NV
          </div>
          <h1 className="font-heading text-3xl font-extrabold text-[#0F172A] dark:text-[#F8FAFC] tracking-tight">
            Netra<span className="font-wordmark font-normal text-[#059669]">Vaani</span>
          </h1>
        </div>
        <p className="text-xs sm:text-sm font-medium text-[#64748B] dark:text-[#94A3B8]">
          Assistive Gaze &amp; Gesture Clinical Platform
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-[#131B2E] py-6 sm:py-7 px-6 sm:px-8 rounded-2xl border border-[#CBD5E1] dark:border-[#1E293B] shadow-card space-y-5">
          
          {/* Main Auth Mode Tabs: Sign In / Sign Up */}
          <div className="grid grid-cols-2 p-1 bg-[#F8FAFC] dark:bg-[#0B0F19] border border-[#CBD5E1] dark:border-[#1E293B] rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setError(null);
                setSuccessMsg(null);
              }}
              className={`py-2 rounded-lg transition ${
                authMode === "login"
                  ? "bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] shadow-xs border border-[#CBD5E1] dark:border-[#334155]"
                  : "text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC]"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("signup");
                setError(null);
                setSuccessMsg(null);
              }}
              className={`py-2 rounded-lg transition ${
                authMode === "signup"
                  ? "bg-[#FFFCF7] text-[#211C19] shadow-xs border border-[#E5D9CA]"
                  : "text-[#76685F] hover:text-[#211C19]"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Feedback Alerts */}
          {error && (
            <div className="p-3 bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318] rounded-xl text-xs font-semibold leading-relaxed">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-[#EDF5F0] border border-[#C5DDCF] text-[#42765A] rounded-xl text-xs font-semibold leading-relaxed flex items-start gap-2.5 shadow-xs">
              <Mail className="w-4 h-4 text-[#42765A] mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-[#211C19]">Please check your email</p>
                <p className="text-[11px] text-[#42765A] mt-0.5 leading-relaxed">{successMsg}</p>
              </div>
            </div>
          )}

          {/* Sign Up Role Selection (Only shown when signing up) */}
          {authMode === "signup" && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#76685F] mb-1.5 text-center">
                Register Account As
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSignupRole("patient");
                    setError(null);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition text-center gap-1 ${
                    signupRole === "patient"
                      ? "bg-[#EDF5F0] border-[#42765A] text-[#42765A] shadow-xs ring-1 ring-[#42765A]"
                      : "bg-[#FFFCF7] border-[#E5D9CA] text-[#76685F] hover:border-[#42765A]/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-extrabold text-sm">
                    <Bed className="w-4 h-4" />
                    <span>Patient</span>
                  </div>
                  <span className="text-[10px] font-normal text-[#76685F]">
                    Bedside Gaze Interface
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSignupRole("nurse");
                    setError(null);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-bold transition text-center gap-1 ${
                    signupRole === "nurse"
                      ? "bg-[#F5ECE6] border-[#AD5D3D] text-[#AD5D3D] shadow-xs ring-1 ring-[#AD5D3D]"
                      : "bg-[#FFFCF7] border-[#E5D9CA] text-[#76685F] hover:border-[#AD5D3D]/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-extrabold text-sm">
                    <Shield className="w-4 h-4" />
                    <span>Nurse</span>
                  </div>
                  <span className="text-[10px] font-normal text-[#76685F]">
                    Clinical Station Desk
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {authMode === "signup" && (
              <>
                <div>
                  <label className="block text-xs font-bold text-[#211C19] mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={signupRole === "patient" ? "e.g. John Doe" : "e.g. Staff Nurse Maya"}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5D9CA] bg-[#FFFCF7] text-[#211C19] placeholder-[#9E9086] text-xs sm:text-sm focus:outline-none focus:border-[#AD5D3D] transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#211C19] mb-1.5 flex items-center justify-between">
                    <span>Unique Username</span>
                    <span className="text-[10px] text-[#76685F] font-normal">Lowercase, 3-30 chars</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-[#9E9086] text-xs sm:text-sm font-semibold select-none">@</span>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                      placeholder={signupRole === "patient" ? "john_doe" : "nurse_maya"}
                      className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-[#E5D9CA] bg-[#FFFCF7] text-[#211C19] placeholder-[#9E9086] text-xs sm:text-sm focus:outline-none focus:border-[#AD5D3D] transition"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-[#211C19] mb-1.5">
                {authMode === "signup" ? "Email Address" : "Email or Username"}
              </label>
              <input
                type={authMode === "signup" ? "email" : "text"}
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={
                  authMode === "signup"
                    ? "Enter email address"
                    : "Enter your email or username"
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5D9CA] bg-[#FFFCF7] text-[#211C19] placeholder-[#9E9086] text-xs sm:text-sm focus:outline-none focus:border-[#AD5D3D] transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#211C19] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={authMode === "signup" ? 6 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5D9CA] bg-[#FFFCF7] text-[#211C19] placeholder-[#9E9086] text-xs sm:text-sm focus:outline-none focus:border-[#AD5D3D] transition pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-2.5 text-xs text-[#76685F] hover:text-[#211C19] font-semibold"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 rounded-xl text-white font-bold text-xs uppercase tracking-wider transition shadow-sm disabled:opacity-50 ${
                  authMode === "signup" && signupRole === "patient"
                    ? "bg-[#42765A] hover:bg-[#355F49]"
                    : "bg-[#AD5D3D] hover:bg-[#964F33]"
                }`}
              >
                {loading
                  ? "Processing..."
                  : authMode === "signup"
                  ? `Create ${signupRole === "patient" ? "Patient" : "Nurse"} Account`
                  : "Sign In"}
              </button>
            </div>
          </form>

          {/* Toggle between Sign In and Sign Up */}
          <div className="text-center pt-2">
            {authMode === "login" ? (
              <p className="text-xs text-[#76685F]">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signup");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="font-bold text-[#AD5D3D] hover:underline"
                >
                  Sign Up
                </button>
              </p>
            ) : (
              <p className="text-xs text-[#76685F]">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="font-bold text-[#AD5D3D] hover:underline"
                >
                  Sign In
                </button>
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
