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
    <div className="min-h-screen bg-[#F5F0E8] text-[#30251F] flex flex-col justify-center py-16 px-4 sm:px-6 lg:px-8 selection:bg-[#EED9CD]">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="inline-flex items-center gap-2 border-b border-[#E7DFD4] pb-1 mb-2">
          <span className="text-[10px] uppercase font-mono tracking-widest text-[#75665D]">
            Official Verification Dispatch
          </span>
        </div>
        <h1 className="font-serif text-4xl font-normal text-[#30251F] tracking-tight">NetraVaani</h1>
        <p className="font-serif italic text-sm text-[#75665D]">
          Account Authentication &bull; Medical Staff Onboarding
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#FFFCF7] py-8 px-6 sm:px-10 rounded-2xl border border-[#E7DFD4] shadow-sm text-center">
          {loading ? (
            <div className="py-8 space-y-4">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#C56845]"></div>
              <p className="font-serif italic text-sm text-[#75665D]">{message}</p>
            </div>
          ) : success ? (
            <div className="py-4 space-y-5">
              <div className="p-4 bg-[#EED9CD]/60 border border-[#C56845]/40 text-[#30251F] rounded-xl text-sm font-medium">
                {message}
              </div>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full flex justify-center py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider font-bold text-white bg-[#C56845] hover:bg-[#B05534] focus:outline-none shadow-xs transition"
              >
                Proceed to NetraVaani Dashboard &rarr;
              </button>
            </div>
          ) : (
            <div className="py-4 space-y-5">
              <div className="p-4 bg-[#F9ECE7] border border-[#C56845]/50 text-[#8C3A1E] rounded-xl text-sm font-medium">
                {message}
              </div>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full flex justify-center py-2.5 px-4 border border-[#E7DFD4] rounded-xl text-xs uppercase tracking-wider font-semibold text-[#75665D] bg-[#FFFCF7] hover:bg-[#F5F0E8] transition"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
