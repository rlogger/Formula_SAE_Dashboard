"use client";

import { useUsers } from "@/hooks/use-users";
import { useRoles } from "@/hooks/use-roles";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import { UserTable } from "@/components/admin/user-table";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

export default function UsersPage() {
  const { token } = useAuth();
  const { data: users, isLoading, mutate: mutateUsers } = useUsers();
  const { data: roles } = useRoles();

  if (isLoading) return <LoadingSpinner label="Loading users..." />;

  const handleDeleteUser = async (userId: number) => {
    if (!token) return;
    await apiFetch(`/admin/users/${userId}`, { method: "DELETE" }, token);
    mutateUsers();
  };

  const handleUpdatePassword = async (userId: number, password: string) => {
    if (!token) return;
    await apiFetch(
      `/admin/users/${userId}/password`,
      { method: "PUT", body: JSON.stringify({ password }) },
      token
    );
  };

  const handleCreateUser = async (data: {
    username: string;
    password: string;
    roles: string[];
    is_admin: boolean;
  }) => {
    if (!token) return;
    await apiFetch(
      "/admin/users",
      { method: "POST", body: JSON.stringify(data) },
      token
    );
    mutateUsers();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">
          Create, edit, and manage user accounts.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <UserTable
            users={users || []}
            onDeleteUser={handleDeleteUser}
            onUpdatePassword={handleUpdatePassword}
          />
        </CardContent>
      </Card>
      <CreateUserForm roles={roles || []} onSubmit={handleCreateUser} />
    </div>
  );
}
