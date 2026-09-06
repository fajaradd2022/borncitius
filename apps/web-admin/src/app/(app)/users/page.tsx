import { UsersTableClient } from "@/components/users/users-table-client";
import { apiGet } from "@/lib/api/client";
import { requireAdmin } from "@/lib/require-admin";
import type { User } from "@/lib/types";

export default async function UsersPage() {
  await requireAdmin();
  const users = await apiGet<User[]>("/users");
  return <UsersTableClient initialUsers={users} />;
}
