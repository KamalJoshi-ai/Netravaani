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
  isVerified?: boolean;
  profilePicture?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<any>;
  register: (name: string, email: string, password: string, role?: string) => Promise<any>;
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
        setUser({
          id: u.id || u._id,
          name: u.name,
          email: u.email,
          username: u.username || u.email,
          role: u.role,
          isVerified: u.isVerified,
          profilePicture: u.profilePicture,
        });
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
      setUser({
        id: u.id || u._id,
        name: u.name,
        email: u.email,
        username: u.username || u.email,
        role: u.role,
        isVerified: u.isVerified,
        profilePicture: u.profilePicture,
      });
      return res;
    }
    return res;
  };

  const register = async (name: string, email: string, password: string, role?: string) => {
    return apiClient.register({ name, email, password, role });
  };

  const logout = async () => {
    try {
      await apiClient.logout();
    } finally {
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
