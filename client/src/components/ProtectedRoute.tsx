import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export function ProtectedRoute() {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  // Hold off on redirecting until the initial session check (POST /api/auth/refresh)
  // has settled so valid sessions don't flash a redirect to /login.
  if (status === "loading") {
    return (
      <div
        role="status"
        aria-label="Checking authentication"
        className="flex min-h-screen items-center justify-center p-4"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ink/20 border-t-accent" />
          <span className="text-sm font-medium text-ink-soft">Loading Cardstock…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    // Preserve the intended location so we can redirect back post-login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
