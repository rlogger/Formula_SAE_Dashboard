"use client";

import { useState } from "react";
import { TelemetrySensor } from "@/types/telemetry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Pencil, Trash2 } from "lucide-react";

type Props = {
  sensors: TelemetrySensor[];
  onEdit: (sensor: TelemetrySensor) => void;
  onDelete: (sensorId: string) => Promise<void>;
};

export function SensorTable({ sensors, onEdit, onDelete }: Props) {
  const [deleteSensorId, setDeleteSensorId] = useState<string | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Range</TableHead>
            <TableHead>Group</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sensors.map((sensor) => (
            <TableRow key={sensor.sensor_id}>
              <TableCell className="font-mono text-sm">
                {sensor.sensor_id}
              </TableCell>
              <TableCell className="font-medium">{sensor.name}</TableCell>
              <TableCell>{sensor.unit}</TableCell>
              <TableCell>
                {sensor.min_value} - {sensor.max_value}
              </TableCell>
              <TableCell>{sensor.group}</TableCell>
              <TableCell>{sensor.sort_order}</TableCell>
              <TableCell>
                <Badge variant={sensor.enabled ? "default" : "secondary"}>
                  {sensor.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(sensor)}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteSensorId(sensor.sensor_id)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {sensors.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={8}
                className="text-center text-muted-foreground"
              >
                No sensors found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={deleteSensorId !== null}
        onOpenChange={(open) => !open && setDeleteSensorId(null)}
        title="Delete Sensor"
        description="Are you sure you want to delete this sensor? This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteSensorId !== null) {
            onDelete(deleteSensorId);
            setDeleteSensorId(null);
          }
        }}
      />
    </>
  );
}
