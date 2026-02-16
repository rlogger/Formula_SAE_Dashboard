"use client";

import { LdxFileInfo } from "@/types";
import { formatLocalTime, formatSize } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { FolderOpen } from "lucide-react";

type Props = {
  files: LdxFileInfo[];
};

export function LdxFileTable({ files }: Props) {
  if (files.length === 0) {
    return (
      <EmptyState
        icon={<FolderOpen className="h-10 w-10" />}
        title="No LDX files found"
        description="Set a watch directory to see LDX files."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Last Modified</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((file) => (
          <TableRow key={file.name}>
            <TableCell className="font-medium">{file.name}</TableCell>
            <TableCell>{formatSize(file.size)}</TableCell>
            <TableCell>{formatLocalTime(file.modified_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
