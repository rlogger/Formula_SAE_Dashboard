"use client";

import { useState } from "react";
import { TelemetryChannel, ChartConfig } from "@/types/telemetry";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  open: boolean;
  channels: TelemetryChannel[];
  onClose: () => void;
  onAdd: (chart: ChartConfig) => void;
};

export function AddChartDialog({ open, channels, onClose, onAdd }: Props) {
  const [chartType, setChartType] = useState<ChartConfig["type"]>("line");
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(
    new Set()
  );

  const isMultiSelect = chartType === "line";

  const toggleChannel = (id: string) => {
    if (isMultiSelect) {
      setSelectedChannels((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setSelectedChannels(new Set([id]));
    }
  };

  const handleAdd = () => {
    if (selectedChannels.size === 0) return;
    const id = `c_${Date.now()}`;
    onAdd({
      id,
      channels: Array.from(selectedChannels),
      type: chartType,
    });
    setSelectedChannels(new Set());
    setChartType("line");
    onClose();
  };

  const handleClose = () => {
    setSelectedChannels(new Set());
    setChartType("line");
    onClose();
  };

  // Group channels
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
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Add Chart</DialogTitle>
          <DialogDescription>
            Select a chart type and channels to display.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Chart Type</Label>
            <Select
              value={chartType}
              onValueChange={(v) => {
                setChartType(v as ChartConfig["type"]);
                if (v !== "line" && selectedChannels.size > 1) {
                  const first = Array.from(selectedChannels)[0];
                  setSelectedChannels(new Set([first]));
                }
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="line">Line Chart</SelectItem>
                <SelectItem value="gauge">Gauge</SelectItem>
                <SelectItem value="numeric">Numeric Display</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              Channels{" "}
              {isMultiSelect && (
                <span className="text-muted-foreground font-normal">
                  (select multiple)
                </span>
              )}
            </Label>
            <div className="mt-2 max-h-[250px] overflow-y-auto space-y-3">
              {Object.entries(groups).map(([group, chs]) => (
                <div key={group}>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">
                    {group}
                  </p>
                  <div className="space-y-1">
                    {chs.map((ch) => (
                      <div key={ch.id} className="flex items-center gap-2">
                        <Switch
                          id={`add-${ch.id}`}
                          checked={selectedChannels.has(ch.id)}
                          onCheckedChange={() => toggleChannel(ch.id)}
                        />
                        <Label htmlFor={`add-${ch.id}`} className="text-sm">
                          {ch.name}{" "}
                          <span className="text-muted-foreground">
                            ({ch.unit})
                          </span>
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={selectedChannels.size === 0}>
            Add Chart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
