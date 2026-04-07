"use client";

import { useEffect, useState } from "react";
import { TelemetryChannel } from "@/types/telemetry";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import { TelemetryDashboard } from "@/components/telemetry/telemetry-dashboard";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

export default function TelemetryPage() {
  const { token } = useAuth();
  const [channels, setChannels] = useState<TelemetryChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    apiFetch<TelemetryChannel[]>("/telemetry/channels", {}, token)
      .then(setChannels)
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <LoadingSpinner label="Loading channels..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-extrabold uppercase tracking-wide">
          Live Telemetry
        </h1>
        <p className="text-sm text-muted-foreground">
          Real-time data from the vehicle sensors.
        </p>
      </div>
      <TelemetryDashboard channels={channels} />
    </div>
  );
}
