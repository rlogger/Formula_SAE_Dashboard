"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      router.push("/forms");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("Account not found")) {
        setError("This account does not exist. Please check your username.");
      } else if (msg.includes("Incorrect password")) {
        setError("Incorrect password. Please try again.");
      } else {
        setError(msg || "An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto animate-fade-in-up lg:bg-card lg:backdrop-blur-none backdrop-blur-md bg-card/80">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-3">
          <Image src="/images/fsae_logo.jpg" alt="SCR Racing" width={48} height={48} className="rounded-lg" />
        </div>
        <CardTitle className="text-2xl font-bold">
          SCR Racing Dashboard
        </CardTitle>
        <CardDescription>
          Sign in to access your team portal
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button
            type="submit"
            className="w-full bg-[hsl(var(--racing))] hover:bg-[hsl(var(--racing-hover))] text-white"
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-xs text-muted-foreground">Formula SAE Team Portal</p>
      </CardFooter>
    </Card>
  );
}
