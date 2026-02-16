"use client";

import { TelemetryChannel } from "@/types/telemetry";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Props = {
  channels: TelemetryChannel[];
  enabled: Set<string>;
  onToggle: (channelId: string) => void;
};

export function ChannelSelector({ channels, enabled, onToggle }: Props) {
  const groups = channels.reduce<Record<string, TelemetryChannel[]>>(
    (acc, ch) => {
      const g = ch.group || "Other";
      if (!acc[g]) acc[g] = [];
      acc[g].push(ch);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([group, chs]) => (
        <div key={group}>
          <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
            {group}
          </h4>
          <div className="space-y-2">
            {chs.map((ch) => (
              <div key={ch.id} className="flex items-center gap-2">
                <Switch
                  id={ch.id}
                  checked={enabled.has(ch.id)}
                  onCheckedChange={() => onToggle(ch.id)}
                />
                <Label htmlFor={ch.id} className="text-sm">
                  {ch.name}{" "}
                  <span className="text-muted-foreground">({ch.unit})</span>
                </Label>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
