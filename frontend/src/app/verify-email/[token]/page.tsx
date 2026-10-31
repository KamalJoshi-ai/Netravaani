/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";

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
          setMessage("Email verified successfully! Your account is now active.");
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
    <div className="min-h-screen bg-[#EEF2F6] text-slate-900 flex flex-col justify-center py-16 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Netra<span className="text-teal-800">Vaani</span>
        </h1>
        <p className="text-xs text-slate-600">
          Account Verification
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-8 rounded-xl border border-slate-300 shadow-xs shadow-xs text-center">
          {loading ? (
            <div className="py-6 space-y-3">
              <div className="inline-block animate-spin rounded-full h-7 w-7 border-2 border-teal-700 border-t-transparent  " />
              <p className="text-xs text-slate-700">{message}</p>
            </div>
          ) : success ? (
            <div className="py-2 space-y-4">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200  text-emerald-800  rounded-lg text-xs font-medium">
                {message}
              </div>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full flex justify-center py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800  :bg-teal-500 shadow-xs transition"
              >
                Proceed to NetraVaani Dashboard &rarr;
              </button>
            </div>
          ) : (
            <div className="py-2 space-y-4">
              <div className="p-3.5 bg-red-50  border border-red-200  text-red-700  rounded-lg text-xs font-medium">
                {message}
              </div>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full flex justify-center py-2.5 px-4 rounded-lg text-xs font-medium border border-slate-300 text-slate-800 hover:bg-slate-50 :bg-slate-800 shadow-xs transition"
              >
                Return to Login &rarr;
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
