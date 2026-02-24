"use client";

import { useEffect, useState } from "react";
import { TelemetrySensor } from "@/types/telemetry";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type SensorFormData = {
  sensor_id: string;
  name: string;
  unit: string;
  min_value: number;
  max_value: number;
  group: string;
  sort_order: number;
  enabled: boolean;
};

type Props = {
  open: boolean;
  sensor: TelemetrySensor | null;
  onClose: () => void;
  onSubmit: (data: SensorFormData, isEdit: boolean) => Promise<void>;
};

const emptyForm: SensorFormData = {
  sensor_id: "",
  name: "",
  unit: "",
  min_value: 0,
  max_value: 100,
  group: "Other",
  sort_order: 0,
  enabled: true,
};

export function SensorFormDialog({ open, sensor, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<SensorFormData>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = sensor !== null;

  useEffect(() => {
    if (sensor) {
      setForm({
        sensor_id: sensor.sensor_id,
        name: sensor.name,
        unit: sensor.unit,
        min_value: sensor.min_value,
        max_value: sensor.max_value,
        group: sensor.group,
        sort_order: sensor.sort_order,
        enabled: sensor.enabled,
      });
    } else {
      setForm(emptyForm);
    }
    setError(null);
  }, [sensor, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sensor_id || !form.name || !form.unit) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(form, isEdit);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Sensor" : "Create Sensor"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? `Update settings for ${sensor?.name}.`
                : "Add a new telemetry sensor channel."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sensor_id">Sensor ID</Label>
                <Input
                  id="sensor_id"
                  value={form.sensor_id}
                  onChange={(e) => setForm({ ...form, sensor_id: e.target.value })}
                  disabled={isEdit}
                  placeholder="e.g. speed"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Vehicle Speed"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="km/h"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="min_value">Min</Label>
                <Input
                  id="min_value"
                  type="number"
                  step="any"
                  value={form.min_value}
                  onChange={(e) =>
                    setForm({ ...form, min_value: parseFloat(e.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="max_value">Max</Label>
                <Input
                  id="max_value"
                  type="number"
                  step="any"
                  value={form.max_value}
                  onChange={(e) =>
                    setForm({ ...form, max_value: parseFloat(e.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="group">Group</Label>
                <Input
                  id="group"
                  value={form.group}
                  onChange={(e) => setForm({ ...form, group: e.target.value })}
                  placeholder="Performance"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="sort_order">Sort Order</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="enabled"
                checked={form.enabled}
                onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
              />
              <Label htmlFor="enabled">Enabled</Label>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !form.sensor_id || !form.name}>
              {loading ? "Saving..." : isEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
