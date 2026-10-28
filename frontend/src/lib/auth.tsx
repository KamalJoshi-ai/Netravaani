/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiClient } from "./api";

export interface AuthUser {
  id?: string;
  name: string;
  email?: string;
  username?: string;
  role: string;
  patientCode?: string;
  isVerified?: boolean;
  profilePicture?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<any>;
  register: (username: string, email: string, password: string, role?: string, name?: string) => Promise<any>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshAuth: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await apiClient.getCurrentUser();
      if (res.status === "success" && res.data) {
        const u = res.data.user || res.data;
        const patientCode = u.patientCode || (typeof window !== "undefined" ? localStorage.getItem("nv_patient_code") : undefined);
        setUser({
          id: u.id || u._id,
          name: u.name,
          email: u.email,
          username: u.username || u.email,
          role: u.role,
          patientCode,
          isVerified: u.isVerified,
          profilePicture: u.profilePicture,
        });
        if (patientCode && typeof window !== "undefined") {
          localStorage.setItem("nv_patient_code", patientCode);
        }
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (identifier: string, password: string) => {
    const res = await apiClient.login(identifier, password);
    if (res.status === "success" && res.data) {
      const u = res.data.user || res.data;
      const patientCode = u.patientCode || (u.role === "patient" ? (typeof window !== "undefined" ? localStorage.getItem("nv_patient_code") : undefined) : undefined);
      setUser({
        id: u.id || u._id,
        name: u.name,
        email: u.email,
        username: u.username || u.email,
        role: u.role,
        patientCode,
        isVerified: u.isVerified,
        profilePicture: u.profilePicture,
      });
      if (patientCode && typeof window !== "undefined") {
        localStorage.setItem("nv_patient_code", patientCode);
      }
      return res;
    }
    return res;
  };

  const register = async (username: string, email: string, password: string, role?: string, name?: string) => {
    return apiClient.register({ username, email, password, role, name: name || username });
  };

  const logout = async () => {
    try {
      await apiClient.logout();
    } catch (e) {
      console.warn("Logout request error:", e);
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("nv_patient_code");
        localStorage.removeItem("netravaani_token");
        localStorage.removeItem("access_token");
        // Expire client cookies
        document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "netravaani_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "patient_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      }
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshAuth: checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
