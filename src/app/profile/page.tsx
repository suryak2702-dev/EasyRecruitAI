"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, Button, Input, Select, ErrorState, LoadingOverlay, Badge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ProfileData } from "@/types";
import { User as UserIcon, Camera, Trash2 } from "lucide-react";

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    full_name: "", date_of_birth: "", gender: "", phone: "", address: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = await api.getProfile();
      setProfile(p);
      setForm({
        full_name: p.full_name || "",
        date_of_birth: p.date_of_birth || "",
        gender: p.gender || "",
        phone: p.phone || "",
        address: p.address || "",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api.updateProfile({
        full_name: form.full_name || undefined,
        date_of_birth: form.date_of_birth || undefined,
        gender: form.gender || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
      });
      setProfile(updated);
      setSuccess("Profile saved successfully.");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const updated = await api.uploadPhoto(f);
      setProfile(updated);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Photo upload failed.");
    }
  };

  const handlePhotoDelete = async () => {
    try {
      const updated = await api.deletePhoto();
      setProfile(updated);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove photo.");
    }
  };

  if (loading) return <AppShell><LoadingOverlay message="Loading profile..." /></AppShell>;

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
  const photoUrl = profile?.photo_url ? `${API_URL}${profile.photo_url}` : null;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-100">My Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your personal information</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{success}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex flex-col items-center">
            <div className="mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-brand/20">
              {photoUrl ? (
                <img src={photoUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <UserIcon className="h-10 w-10 text-brand-light" />
              )}
            </div>
            <label className="cursor-pointer">
              <span className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                <Camera className="h-4 w-4" /> Upload Photo
              </span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" />
            </label>
            {profile?.has_photo && (
              <button onClick={handlePhotoDelete} className="mt-3 flex items-center gap-1 text-sm text-rose-400 hover:text-rose-300">
                <Trash2 className="h-3 w-3" /> Remove Photo
              </button>
            )}
            <div className="mt-6 w-full space-y-2 text-center">
              <p className="font-display text-lg font-semibold text-gray-100">{profile?.full_name || user?.username}</p>
              <p className="text-sm text-gray-500">{profile?.email}</p>
              {profile && (
                <Badge className={profile.profile_complete ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-amber-500/15 text-amber-300 border border-amber-500/30"}>
                  {profile.profile_complete ? "Profile Complete" : "Profile Incomplete"}
                </Badge>
              )}
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="mb-4 font-display text-sm font-semibold text-gray-300">Personal Information</h3>
          <form onSubmit={handleSave} className="space-y-4">
            <Input label="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Jane Smith" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Date of Birth" type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
              <Select label="Gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" />
            <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Chennai, Tamil Nadu" />
            <Button type="submit" loading={saving}>Save Changes</Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
