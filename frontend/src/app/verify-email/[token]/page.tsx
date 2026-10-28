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
    <div className="min-h-screen bg-[#F7F6F2] dark:bg-[#0E151E] text-[#18212B] dark:text-[#F0F4F7] flex flex-col justify-center py-16 px-4 sm:px-6 lg:px-8 selection:bg-[#B9D8D2]/40">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="inline-flex items-center gap-2 border-b border-[#DFE3DF] dark:border-[#27374D] pb-1 mb-2">
          <span className="text-[10px] uppercase font-mono tracking-widest text-[#68747C] dark:text-[#8B9BA8]">
            Clinical Verification Dispatch
          </span>
        </div>
        <h1 className="font-heading text-3xl font-extrabold text-[#18212B] dark:text-[#F0F4F7] tracking-tight">
          Netra<span className="font-wordmark font-normal text-[#376B70] dark:text-[#B9D8D2]">Vaani</span>
        </h1>
        <p className="text-xs sm:text-sm text-[#68747C] dark:text-[#8B9BA8]">
          Account Authentication &bull; Medical Staff Onboarding
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-[#151E2A] py-8 px-6 sm:px-10 rounded-2xl border border-[#DFE3DF] dark:border-[#27374D] shadow-card text-center">
          {loading ? (
            <div className="py-8 space-y-4">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#183A4A] border-t-transparent dark:border-[#B9D8D2] dark:border-t-transparent" />
              <p className="text-sm text-[#68747C] dark:text-[#8B9BA8]">{message}</p>
            </div>
          ) : success ? (
            <div className="py-4 space-y-5">
              <div className="p-4 bg-[#EAF3EF] dark:bg-[#112A20] border border-[#BEDECE] dark:border-[#1E4E3B] text-[#287A59] dark:text-[#349C73] rounded-xl text-sm font-semibold">
                {message}
              </div>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full flex justify-center py-2.5 px-4 rounded-xl text-xs font-semibold uppercase tracking-wider text-white bg-[#183A4A] hover:bg-[#122C38] active:bg-[#0E232D] shadow-xs transition"
              >
                Proceed to NetraVaani Dashboard &rarr;
              </button>
            </div>
          ) : (
            <div className="py-4 space-y-5">
              <div className="p-4 bg-[#FDF1F1] dark:bg-[#2A1414] border border-[#F2C4C4] dark:border-[#522323] text-[#B54747] dark:text-[#D95B5B] rounded-xl text-sm font-semibold">
                {message}
              </div>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full flex justify-center py-2.5 px-4 border border-[#DFE3DF] dark:border-[#27374D] rounded-xl text-xs font-semibold uppercase tracking-wider text-[#18212B] dark:text-[#F0F4F7] bg-white dark:bg-[#151E2A] hover:bg-[#EDEFEA] dark:hover:bg-[#1B2636] transition shadow-xs"
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
