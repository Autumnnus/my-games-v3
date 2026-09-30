import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/shell";
import { m } from "@/paraglide/messages";

/**
 * Yönetim bölümü. Buradaki kontrol yalnızca arayüz içindir (menü, yönlendirme); asıl kapı sunucuda: her
 * `/api/v1/admin` isteği rolü veritabanından doğrular, admin olmayana 404 döner. Sayfalar veriyi yükleyici
 * (loader) yerine bileşenlerde çeker: yönetim kodu ve istemcisi yalnızca bu sayfaların parçasında kalır.
 */
export const Route = createFileRoute("/admin")({
  beforeLoad: ({ context, location }) => {
    if (!context.user) throw redirect({ to: "/login", search: { redirect: location.href } });
    if (context.user.role !== "admin") throw notFound();
    return { user: context.user };
  },
  head: () => ({
    meta: [
      { title: `${m.admin_brand()} · ${m.app_name()}` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const { user } = Route.useRouteContext();
  return (
    <AdminShell user={user}>
      <Outlet />
    </AdminShell>
  );
}
