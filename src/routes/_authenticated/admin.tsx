import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminPortalContext } from "@/components/admin/AdminPortalNav";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: 'ROUT — Administration' }, { name: "description", content: 'Manage the ROUT platform.' }, { property: "og:title", content: 'ROUT — Administration' }, { property: "og:description", content: 'Manage the ROUT platform.' }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), 
  component: AdminPortalLayout,
});

function AdminPortalLayout() {
  return (
    <AdminPortalContext.Provider value={true}>
      <Outlet />
    </AdminPortalContext.Provider>
  );
}
