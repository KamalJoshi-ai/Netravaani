"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/lib/theme";
import { Shield, Bed, Mail } from "@/lib/noIcons";

export interface LoginFormProps {
  initialMode?: "login" | "signup";
  initialRole?: "patient" | "nurse";
  onBackToLanding?: () => void;
}

export default function LoginForm({
  initialMode = "login",
  initialRole = "patient",
  onBackToLanding,
}: LoginFormProps = {}) {
  const { login, register } = useAuth();

  // Mode: Sign In or Sign Up
  const [authMode, setAuthMode] = useState<"login" | "signup">(initialMode);

  // Role for Sign Up: Strictly Patient or Nurse
  const [signupRole, setSignupRole] = useState<"patient" | "nurse">(initialRole);

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
    <div className="min-h-screen bg-[#EEF2F6] text-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative transition-colors duration-150">
      {/* Top Bar with Optional Back to Landing and Theme Toggle */}
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6">
        {onBackToLanding && (
          <button
            type="button"
            onClick={onBackToLanding}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-300 shadow-xs text-slate-700 hover:text-slate-900 :text-white transition shadow-xs"
          >
            <span>&larr;</span>
            <span>Back to Landing</span>
          </button>
        )}
      </div>

      {/* Top-Right Theme Toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-teal-700  text-white flex items-center justify-center font-bold text-xs shadow-xs">
            NV
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Netra<span className="text-teal-800">Vaani</span>
          </h1>
        </div>
        <p className="text-xs text-slate-600">
          Clinical Assistive Gaze &amp; Gesture Platform
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-6 sm:py-7 px-6 sm:px-8 rounded-xl border border-slate-300 shadow-xs shadow-xs space-y-5">
          
          {/* Main Auth Mode Tabs: Sign In / Sign Up */}
          <div className="grid grid-cols-2 p-1 bg-slate-100/80 border border-slate-300 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setError(null);
                setSuccessMsg(null);
              }}
              className={`py-1.5 rounded-md transition ${
                authMode === "login"
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900 :text-slate-200"
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
              className={`py-1.5 rounded-md transition ${
                authMode === "signup"
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900 :text-slate-200"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Feedback Alerts */}
          {error && (
            <div className="p-3 bg-red-50  border border-red-200  text-red-700  rounded-lg text-xs font-medium leading-relaxed">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200  text-emerald-800  rounded-lg text-xs font-medium leading-relaxed flex items-start gap-2.5 shadow-xs">
              <Mail className="w-4 h-4 text-emerald-600  mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-slate-900">Please check your email</p>
                <p className="text-xs text-emerald-700  mt-0.5 leading-relaxed">{successMsg}</p>
              </div>
            </div>
          )}

          {/* Sign Up Role Selection (Only shown when signing up) */}
          {authMode === "signup" && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5 text-center">
                Select Account Role
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSignupRole("patient");
                    setError(null);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium transition text-center gap-1 ${
                    signupRole === "patient"
                      ? "bg-teal-50 border-teal-700  text-teal-800 ring-1 ring-teal-700/20"
                      : "bg-white border-slate-300 text-slate-700 hover:border-slate-300 :border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-xs">
                    <Bed className="w-3.5 h-3.5" />
                    <span>Patient</span>
                  </div>
                  <span className="text-[10px] text-slate-600">
                    Bedside Gaze Interface
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSignupRole("nurse");
                    setError(null);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium transition text-center gap-1 ${
                    signupRole === "nurse"
                      ? "bg-teal-50 border-teal-700  text-teal-800 ring-1 ring-teal-700/20"
                      : "bg-white border-slate-300 text-slate-700 hover:border-slate-300 :border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-xs">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Clinical Nurse</span>
                  </div>
                  <span className="text-[10px] text-slate-600">
                    Nurse Station Dashboard
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {authMode === "signup" && (
              <div>
                <label className="block text-xs font-medium text-slate-800 mb-1 flex items-center justify-between">
                  <span>Unique Username</span>
                  <span className="text-[10px] text-slate-600">3-30 lowercase characters</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 text-xs select-none">@</span>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                    placeholder={signupRole === "patient" ? "john_doe" : "nurse_maya"}
                    className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-300 bg-white  text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:ring-1 focus:ring-teal-700 focus:border-teal-700 transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-800 mb-1">
                {authMode === "signup" ? "Email Address" : "Email or Username"}
              </label>
              <input
                type={authMode === "signup" ? "email" : "text"}
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={
                  authMode === "signup"
                    ? "name@example.com"
                    : "Enter your email or username"
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white  text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:ring-1 focus:ring-teal-700 focus:border-teal-700 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-800 mb-1">
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white  text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:ring-1 focus:ring-teal-700 focus:border-teal-700 transition pr-14"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-2 text-xs text-slate-500 hover:text-slate-700 :text-slate-300 font-medium"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-white font-medium text-xs transition shadow-xs disabled:opacity-50 bg-teal-700 hover:bg-teal-800 active:bg-teal-900  :bg-teal-500"
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
          <div className="text-center pt-2 border-t border-slate-200">
            {authMode === "login" ? (
              <p className="text-xs text-slate-600">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signup");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="font-medium text-teal-800 hover:underline"
                >
                  Sign Up
                </button>
              </p>
            ) : (
              <p className="text-xs text-slate-600">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="font-medium text-teal-800 hover:underline"
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
