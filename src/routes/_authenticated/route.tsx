import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getSessionUser } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // La sesión vive en una cookie httpOnly, así que la validación es una
    // llamada al servidor en lugar de una lectura de localStorage.
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: () => <Outlet />,
});
