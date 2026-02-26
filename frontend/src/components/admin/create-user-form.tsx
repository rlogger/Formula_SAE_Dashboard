"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleSelector } from "./role-selector";
import { Loader2, UserPlus } from "lucide-react";

type Props = {
  roles: string[];
  onSubmit: (data: {
    username: string;
    password: string;
    roles: string[];
    is_admin: boolean;
  }) => Promise<void>;
};

export function CreateUserForm({ roles, onSubmit }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleRoleToggle = (role: string) => {
    if (role === "admin") {
      setIsAdmin((prev) => !prev);
      if (!isAdmin) setSelectedRoles([]);
      setError(null);
      return;
    }
    setSelectedRoles((prev) => {
      if (prev.includes(role)) return prev.filter((r) => r !== role);
      if (prev.length >= 2) {
        setError("Select one or two roles.");
        return prev;
      }
      setError(null);
      setIsAdmin(false);
      return [...prev, role];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("Username is required.");
      return;
    }
    if (trimmedUsername.length > 64) {
      setError("Username must be at most 64 characters.");
      return;
    }
    if (!/^[a-zA-Z0-9_.\-]+$/.test(trimmedUsername)) {
      setError("Username may only contain letters, numbers, underscores, dots, and hyphens.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password.length > 128) {
      setError("Password must be at most 128 characters.");
      return;
    }
    if (/^\d+$/.test(password)) {
      setError("Password cannot be all numbers.");
      return;
    }
    if (/^[a-zA-Z]+$/.test(password)) {
      setError("Password must contain at least one number or special character.");
      return;
    }
    if (!isAdmin && (selectedRoles.length < 1 || selectedRoles.length > 2)) {
      setError("Select one or two roles.");
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        username,
        password,
        roles: selectedRoles,
        is_admin: isAdmin,
      });
      setUsername("");
      setPassword("");
      setSelectedRoles([]);
      setIsAdmin(false);
      setSuccess("User created successfully.");
      toast.success("User created successfully");
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserPlus className="h-5 w-5" />
          Create User
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-username">Username</Label>
            <Input
              id="new-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-password">Password</Label>
            <Input
              id="new-user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </div>
          <RoleSelector
            roles={roles}
            selectedRoles={selectedRoles}
            isAdmin={isAdmin}
            onToggle={handleRoleToggle}
            error={error}
          />
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create User
          </Button>
          {success && (
            <p className="text-sm text-green-600 dark:text-green-400">
              {success}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
