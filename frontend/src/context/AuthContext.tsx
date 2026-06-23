/**
 * AuthContext — Session state, login/logout, role helpers, tenant branding id.
 * Sets axios default headers (Authorization, x-tenant-id) after login.
 * Docs: ../../docs/CODEBASE.md
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const TENANT_HEADER = 'x-tenant-id';

export type AuthUser = Record<string, unknown> & {
  role?: string;
  name?: string;
  tenantId?: unknown;
};

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; user?: AuthUser; error?: string }>;
  logout: () => Promise<void>;
  isAdmin: () => boolean;
  isSuperAdmin: () => boolean;
  tenantIdForBranding: unknown;
  tenantForBranding: Record<string, unknown> | { _id: unknown } | null;
  canCreateUsers: () => boolean;
  canViewAllTimes: () => boolean;
  canModifyPipeline: () => boolean;
  canViewCalendar: () => boolean;
  canModifyCalendar: () => boolean;
  fetchCurrentUser: (token: string) => Promise<void>;
}

/** Accepts ObjectId string or populated tenant `{ _id, ... }` from /auth/login and /auth/me */
function normalizeTenantIdForHeader(tenantId: unknown): string {
  if (tenantId == null) return '';
  const raw =
    typeof tenantId === 'object' && tenantId !== null
      ? (tenantId as { _id?: unknown; id?: unknown })._id ?? (tenantId as { id?: unknown }).id
      : tenantId;
  const id = String(raw).trim();
  if (!/^[a-fA-F0-9]{24}$/.test(id)) return '';
  return id;
}

const setAxiosTenantHeader = (tenantId: unknown) => {
  const id = normalizeTenantIdForHeader(tenantId);
  if (id) {
    axios.defaults.headers.common[TENANT_HEADER] = id;
    localStorage.setItem('tenantId', id);
  } else {
    delete axios.defaults.headers.common[TENANT_HEADER];
    // Keep localStorage tenantId so the login page can still show the org logo
  }
};

const setAxiosAuthHeader = (token: string | null) => {
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common.Authorization;
  }
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedTenantId = localStorage.getItem('tenantId');
    if (savedTenantId && !/^[a-fA-F0-9]{24}$/.test(String(savedTenantId).trim())) {
      localStorage.removeItem('tenantId');
      delete axios.defaults.headers.common[TENANT_HEADER];
    } else if (savedTenantId) {
      setAxiosTenantHeader(savedTenantId);
    }

    // Check for existing token on mount
    const token = localStorage.getItem('accessToken');
    if (token) {
      setAxiosAuthHeader(token);
      fetchCurrentUser(token);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchCurrentUser = async (token: string) => {
    try {
      const response = await axios.get(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setUser(response.data.user as AuthUser);
      setAxiosTenantHeader(response.data.user?.tenantId || null);
      setAxiosAuthHeader(token);
    } catch (error) {
      console.error('Error fetching user:', error);
      // Token might be invalid, clear it
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setAxiosTenantHeader(null);
      setAxiosAuthHeader(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password
      });

      const { user, accessToken, refreshToken } = response.data as {
        user: AuthUser;
        accessToken: string;
        refreshToken: string;
      };

      // Store tokens
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setAxiosAuthHeader(accessToken);

      // Set user
      setUser(user);
      setAxiosTenantHeader(user?.tenantId || null);

      toast.success(`Welcome back, ${user.name}!`);
      return { success: true, user };
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      const errorMessage = err.response?.data?.error || 'Login failed';
      toast.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (token) {
        await axios.post(`${API_URL}/auth/logout`, {}, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      // Clear tokens and user
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setAxiosTenantHeader(null);
      setAxiosAuthHeader(null);
      setUser(null);
      toast.success('Logged out successfully');
    }
  };

  const isAdmin = () => {
    return user && (user.role === 'super_admin' || user.role === 'admin');
  };

  const isSuperAdmin = () => {
    return user && user.role === 'super_admin';
  };

  const tenantIdForBranding =
    user?.tenantId?._id || user?.tenantId || localStorage.getItem('tenantId') || null;

  const tenantForBranding =
    user?.tenantId && typeof user.tenantId === 'object'
      ? user.tenantId
      : tenantIdForBranding
        ? { _id: tenantIdForBranding }
        : null;

  const canCreateUsers = () => {
    return user && user.role === 'super_admin';
  };

  const canViewAllTimes = () => {
    return user && (user.role === 'super_admin' || user.role === 'admin');
  };

  const canModifyPipeline = () => {
    return user && (user.role === 'super_admin' || user.role === 'admin');
  };

  const canViewCalendar = () => {
    return !!user; // All authenticated users can view calendar
  };

  const canModifyCalendar = () => {
    return !!user; // All authenticated users can create/modify calendar events
  };

  const value = {
    user,
    loading,
    login,
    logout,
    isAdmin,
    isSuperAdmin,
    tenantIdForBranding,
    tenantForBranding,
    canCreateUsers,
    canViewAllTimes,
    canModifyPipeline,
    canViewCalendar,
    canModifyCalendar,
    fetchCurrentUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

