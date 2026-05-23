import { getNavCounts } from "@/lib/queries/nav-counts";
import { getCurrentEmployee } from "@/lib/auth/current";
import { MainNav } from "./main-nav";

export async function MainNavServer() {
  const me = await getCurrentEmployee();
  const { activeTasks, archivedTasks, inboxUnread } = await getNavCounts(
    me
      ? {
          userId: me.id,
          isAdmin: me.isAdmin,
          inboxSince: me.lastInboxVisitAt,
        }
      : undefined,
  );
  return (
    <MainNav
      activeTasks={activeTasks}
      archivedTasks={archivedTasks}
      inboxUnread={inboxUnread}
    />
  );
}
