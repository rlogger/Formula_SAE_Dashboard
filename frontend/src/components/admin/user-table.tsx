"use client";

import { useState } from "react";
import { User } from "@/types";
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
import { PasswordUpdateDialog } from "./password-update-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { KeyRound, Trash2 } from "lucide-react";

type Props = {
  users: User[];
  onDeleteUser: (userId: number) => Promise<void>;
  onUpdatePassword: (userId: number, password: string) => Promise<void>;
};

export function UserTable({ users, onDeleteUser, onUpdatePassword }: Props) {
  const [passwordDialogUser, setPasswordDialogUser] = useState<User | null>(
    null
  );
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Username</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.username}</TableCell>
              <TableCell>
                {user.is_admin ? (
                  <Badge>Admin</Badge>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <Badge key={role} variant="secondary">
                        {role}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPasswordDialogUser(user)}
                  >
                    <KeyRound className="mr-1 h-3 w-3" />
                    Password
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteUserId(user.id)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No users found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <PasswordUpdateDialog
        user={passwordDialogUser}
        onClose={() => setPasswordDialogUser(null)}
        onSubmit={onUpdatePassword}
      />

      <ConfirmDialog
        open={deleteUserId !== null}
        onOpenChange={(open) => !open && setDeleteUserId(null)}
        title="Delete User"
        description="Are you sure you want to delete this user? This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteUserId !== null) {
            onDeleteUser(deleteUserId);
            setDeleteUserId(null);
          }
        }}
      />
    </>
  );
}
