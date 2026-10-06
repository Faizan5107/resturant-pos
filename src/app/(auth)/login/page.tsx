"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = searchParams.get("role");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginType, setLoginType] = useState<"admin" | "cashier">("cashier");
  const [restaurantCode, setRestaurantCode] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (role === "admin" || role === "super_admin") {
      setLoginType("admin");
    } else {
      setLoginType("cashier");
    }
  }, [role]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    let loginEmail = email;

    // For cashier login: map username + restaurant code -> username@restaurantcode.internal
    if (loginType === "cashier") {
      if (!username || !restaurantCode) {
        setError("Please enter both Cashier Username and Restaurant Code.");
        setLoading(false);
        return;
      }
      loginEmail = `${username.trim().toLowerCase()}@${restaurantCode.trim().toLowerCase()}.internal`;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (authError) {
      setError(authError.message || "Invalid credentials.");
      setLoading(false);
      return;
    }

    // Navigate to root — middleware redirects to the correct role-based page
    router.push("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-md w-full border border-black p-8 rounded-lg space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-black">
            Restaurant POS
          </h1>
          <p className="text-zinc-500 text-xs uppercase tracking-wider font-semibold">
            {loginType === "admin" ? "Admin Sign In" : "Cashier Sign In"}
          </p>
        </div>

        {error && (
          <div className="p-3 border border-black bg-zinc-100 text-black text-xs rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {loginType === "admin" ? (
            <div>
              <label className="block text-xs font-semibold text-black mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@restaurant.com"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Restaurant Code (Slug)
                </label>
                <input
                  type="text"
                  required
                  value={restaurantCode}
                  onChange={(e) => setRestaurantCode(e.target.value)}
                  placeholder="e.g. burger-haven"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-black mb-1">
                  Cashier Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. cashier1"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-black mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:outline-none focus:border-black"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-black text-white text-sm font-semibold rounded-md hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
