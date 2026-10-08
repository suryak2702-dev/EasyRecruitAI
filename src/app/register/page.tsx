"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";
import { Button, Input, Select } from "@/components/ui";
import type { Company } from "@/types";

export default function RegisterPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("candidate");
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    api.getCompanies().then(setCompanies).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.register({
        email,
        password,
        full_name: fullName || undefined,
        username: username || undefined,
        role,
        company_name: role === "recruiter" ? companyName : undefined,
      });
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-light">
            <span className="font-display text-2xl font-bold text-white">E</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-100">Create Account</h1>
          <p className="mt-1 text-sm text-gray-500">Join EasyRecruit AI</p>
        </div>

        <div className="rounded-2xl border border-bg-border bg-bg-surface p-8">
          {error && (
            <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Select label="Account Type" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="candidate">Job Seeker</option>
              <option value="recruiter">Recruiter</option>
            </Select>

            <Input
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Smith"
              required
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="janesmith"
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
            />

            {role === "recruiter" && (
              <Select
                label="Company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              >
                <option value="">Select your company</option>
                {companies.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Create Account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <button
              onClick={() => router.push("/login")}
              className="font-medium text-brand-light hover:text-brand"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
