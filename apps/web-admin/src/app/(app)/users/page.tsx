import { UsersTableClient } from "@/components/users/users-table-client";
import { apiGet } from "@/lib/api/client";
import type { User } from "@/lib/types";

export default async function UsersPage() {
  const users = await apiGet<User[]>("/users");
  return <UsersTableClient initialUsers={users} />;
}
