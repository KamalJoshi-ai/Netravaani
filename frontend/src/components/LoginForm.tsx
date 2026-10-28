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
        const normalizedUsername = username.trim().toLowerCase();
        if (!normalizedUsername) throw new Error("Unique username is required");
        if (!/^[a-zA-Z0-9_-]{3,30}$/.test(normalizedUsername)) {
          throw new Error("Username must be 3-30 characters with letters, numbers, underscores, or hyphens only");
        }
        if (!identifier.trim()) throw new Error("Email address is required");
        if (!password || password.length < 6) {
          throw new Error("Password must be at least 6 characters");
        }

        await register(normalizedUsername, identifier.trim(), password, signupRole);
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
    <div className="min-h-screen bg-[#F5EFE6] dark:bg-[#050505] text-[#28211B] dark:text-[#F2ECE1] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative transition-colors duration-150">
      {/* Top-Right Theme Toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="flex items-center justify-center gap-2.5">
          <div className="w-10 h-10 rounded-lg bg-[#1D2D38] dark:bg-[#151C20] text-[#FAF6F0] flex items-center justify-center font-serif font-black text-sm shadow-xs border border-[#8C4327]/30">
            NV
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#28211B] dark:text-[#F2ECE1] tracking-tight">
            Netra<span className="font-serif italic font-normal text-[#8C4327] dark:text-[#D49D4F]">Vaani</span>
          </h1>
        </div>
        <p className="text-xs sm:text-sm font-serif text-[#6F6256] dark:text-[#9E9689]">
          Assistive Gaze &amp; Gesture Clinical Platform &bull; Clinical Station Ledger
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#FAF6F0] dark:bg-[#0D0D0E] py-6 sm:py-7 px-6 sm:px-8 rounded-2xl border border-[#DCD2C0] dark:border-[#222226] shadow-card space-y-5">
          
          {/* Main Auth Mode Tabs: Sign In / Sign Up */}
          <div className="grid grid-cols-2 p-1 bg-[#ECE3D4] dark:bg-[#141416] border border-[#DCD2C0] dark:border-[#222226] rounded-xl text-xs font-serif font-semibold">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setError(null);
                setSuccessMsg(null);
              }}
              className={`py-2 rounded-lg transition ${
                authMode === "login"
                  ? "bg-[#FAF6F0] dark:bg-[#0D0D0E] text-[#8C4327] dark:text-[#D49D4F] shadow-xs border border-[#DCD2C0] dark:border-[#222226]"
                  : "text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1]"
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
                  ? "bg-[#FAF6F0] dark:bg-[#0D0D0E] text-[#8C4327] dark:text-[#D49D4F] shadow-xs border border-[#DCD2C0] dark:border-[#222226]"
                  : "text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1]"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Feedback Alerts */}
          {error && (
            <div className="p-3 bg-[#FAEEEE] dark:bg-[#2B1414] border border-[#E8BCBC] dark:border-[#522323] text-[#9E3232] dark:text-[#D95B5B] rounded-xl text-xs font-medium leading-relaxed">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-[#EBF3ED] dark:bg-[#132418] border border-[#BCD5C4] dark:border-[#204A2E] text-[#2E6243] dark:text-[#4AA86C] rounded-xl text-xs font-medium leading-relaxed flex items-start gap-2.5 shadow-xs">
              <Mail className="w-4 h-4 text-[#2E6243] dark:text-[#4AA86C] mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-[#28211B] dark:text-[#F2ECE1]">Please check your email</p>
                <p className="text-[11px] text-[#2E6243] dark:text-[#4AA86C] mt-0.5 leading-relaxed">{successMsg}</p>
              </div>
            </div>
          )}

          {/* Sign Up Role Selection (Only shown when signing up) */}
          {authMode === "signup" && (
            <div>
              <label className="block text-[11px] font-serif font-semibold uppercase tracking-wider text-[#6F6256] dark:text-[#9E9689] mb-1.5 text-center">
                Register Account As
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSignupRole("patient");
                    setError(null);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-serif font-semibold transition text-center gap-1 ${
                    signupRole === "patient"
                      ? "bg-[#EBF3ED] dark:bg-[#132418] border-[#2E6243] text-[#2E6243] dark:text-[#4AA86C] shadow-xs ring-1 ring-[#2E6243]"
                      : "bg-[#FAF6F0] dark:bg-[#141416] border-[#DCD2C0] dark:border-[#222226] text-[#6F6256] dark:text-[#9E9689] hover:border-[#8C4327]/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    <Bed className="w-4 h-4" />
                    <span>Patient</span>
                  </div>
                  <span className="text-[10px] font-normal text-[#6F6256] dark:text-[#9E9689]">
                    Bedside Gaze Interface
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSignupRole("nurse");
                    setError(null);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-serif font-semibold transition text-center gap-1 ${
                    signupRole === "nurse"
                      ? "bg-[#ECE3D4] dark:bg-[#141416] border-[#8C4327] text-[#8C4327] dark:text-[#D49D4F] shadow-xs ring-1 ring-[#8C4327]"
                      : "bg-[#FAF6F0] dark:bg-[#141416] border-[#DCD2C0] dark:border-[#222226] text-[#6F6256] dark:text-[#9E9689] hover:border-[#8C4327]/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    <Shield className="w-4 h-4" />
                    <span>Nurse</span>
                  </div>
                  <span className="text-[10px] font-normal text-[#6F6256] dark:text-[#9E9689]">
                    Clinical Station Desk
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {authMode === "signup" && (
              <div>
                <label className="block text-xs font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1] mb-1 flex items-center justify-between">
                  <span>Unique Username</span>
                  <span className="text-[10px] text-[#6F6256] dark:text-[#9E9689] font-normal">Lowercase, 3-30 chars</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2 text-[#6F6256] dark:text-[#9E9689] text-xs sm:text-sm font-semibold select-none">@</span>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                    placeholder={signupRole === "patient" ? "john_doe" : "nurse_maya"}
                    className="w-full pl-8 pr-3.5 py-2 rounded-xl border border-[#DCD2C0] dark:border-[#222226] bg-[#FAF6F0] dark:bg-[#141416] text-[#28211B] dark:text-[#F2ECE1] placeholder-[#6F6256] text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-[#8C4327] focus:border-[#8C4327] transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1] mb-1">
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
                className="w-full px-3.5 py-2 rounded-xl border border-[#DCD2C0] dark:border-[#222226] bg-[#FAF6F0] dark:bg-[#141416] text-[#28211B] dark:text-[#F2ECE1] placeholder-[#6F6256] text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-[#8C4327] focus:border-[#8C4327] transition"
              />
            </div>

            <div>
              <label className="block text-xs font-serif font-semibold text-[#28211B] dark:text-[#F2ECE1] mb-1">
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
                  className="w-full px-3.5 py-2 rounded-xl border border-[#DCD2C0] dark:border-[#222226] bg-[#FAF6F0] dark:bg-[#141416] text-[#28211B] dark:text-[#F2ECE1] placeholder-[#6F6256] text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-[#8C4327] focus:border-[#8C4327] transition pr-14"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-2 text-xs text-[#6F6256] dark:text-[#9E9689] hover:text-[#28211B] dark:hover:text-[#F2ECE1] font-medium"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-white font-serif font-semibold text-xs tracking-wider uppercase transition shadow-xs disabled:opacity-50 bg-[#8C4327] hover:bg-[#73341C] active:bg-[#5C2713]"
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
          <div className="text-center pt-1 border-t border-[#DCD2C0] dark:border-[#222226]">
            {authMode === "login" ? (
              <p className="text-xs text-[#6F6256] dark:text-[#9E9689]">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signup");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="font-serif font-semibold text-[#8C4327] dark:text-[#D49D4F] hover:underline"
                >
                  Sign Up
                </button>
              </p>
            ) : (
              <p className="text-xs text-[#6F6256] dark:text-[#9E9689]">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="font-serif font-semibold text-[#8C4327] dark:text-[#D49D4F] hover:underline"
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
