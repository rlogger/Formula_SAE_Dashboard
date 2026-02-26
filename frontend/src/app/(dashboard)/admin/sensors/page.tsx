"use client";

import { useState } from "react";
import { TelemetrySensor } from "@/types/telemetry";
import { useSensors } from "@/hooks/use-sensors";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import { SensorTable } from "@/components/admin/sensor-table";
import { SensorFormDialog } from "@/components/admin/sensor-form-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { Plus } from "lucide-react";

export default function SensorsPage() {
  const { token } = useAuth();
  const { data: sensors, isLoading, mutate } = useSensors();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSensor, setEditSensor] = useState<TelemetrySensor | null>(null);

  if (isLoading) return <LoadingSpinner label="Loading sensors..." />;

  const handleSubmit = async (
    data: {
      sensor_id: string;
      name: string;
      unit: string;
      min_value: number;
      max_value: number;
      group: string;
      sort_order: number;
      enabled: boolean;
    },
    isEdit: boolean
  ) => {
    if (!token) return;
    if (isEdit) {
      await apiFetch(`/admin/sensors/${data.sensor_id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: data.name,
          unit: data.unit,
          min_value: data.min_value,
          max_value: data.max_value,
          group: data.group,
          sort_order: data.sort_order,
          enabled: data.enabled,
        }),
      }, token);
    } else {
      await apiFetch("/admin/sensors", {
        method: "POST",
        body: JSON.stringify(data),
      }, token);
    }
    mutate();
  };

  const handleDelete = async (sensorId: string) => {
    if (!token) return;
    await apiFetch(`/admin/sensors/${sensorId}`, { method: "DELETE" }, token);
    mutate();
  };

  const openCreate = () => {
    setEditSensor(null);
    setDialogOpen(true);
  };

  const openEdit = (sensor: TelemetrySensor) => {
    setEditSensor(sensor);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Sensor Management
          </h1>
          <p className="text-muted-foreground">
            Configure telemetry sensor channels.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Sensor
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sensors</CardTitle>
        </CardHeader>
        <CardContent>
          <SensorTable
            sensors={sensors || []}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>
      <SensorFormDialog
        open={dialogOpen}
        sensor={editSensor}
        onClose={() => {
          setDialogOpen(false);
          setEditSensor(null);
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
