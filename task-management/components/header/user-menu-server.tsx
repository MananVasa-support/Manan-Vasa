import { getCurrentEmployee } from "@/lib/auth/current";
import { UserMenu } from "./user-menu";

export async function UserMenuServer() {
  const me = await getCurrentEmployee();
  if (!me) return null;
  return (
    <UserMenu
      name={me.name}
      email={me.email}
      isAdmin={me.isAdmin}
      avatarUrl={me.avatarUrl}
    />
  );
}
