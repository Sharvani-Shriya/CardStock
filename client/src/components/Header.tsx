import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { ConnectionStatus } from "./ConnectionStatus";
import { smallButton } from "./styles";

interface HeaderProps {
  boardTitle?: string;
}

export function Header({ boardTitle }: HeaderProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-8">
      <div>
        <div className="flex items-center gap-3">
          <Link
            to="/boards"
            className="font-display text-3xl font-bold tracking-tight text-ink hover:text-accent focus-visible:rounded"
          >
            Cardstock
          </Link>
          {boardTitle && (
            <>
              <span className="text-ink-soft" aria-hidden="true">
                /
              </span>
              <span className="font-display text-2xl font-semibold text-ink-soft">
                {boardTitle}
              </span>
            </>
          )}
        </div>
        <p className="text-sm text-ink-soft">A shared board that updates as your team works.</p>
      </div>

      <div className="flex items-center gap-4">
        <ConnectionStatus />
        {user && (
          <div className="flex items-center gap-3 border-l border-line pl-4">
            <span
              className="text-xs font-medium text-ink-soft"
              title={user.email}
              aria-label={`Logged in as ${user.email}`}
            >
              {user.email}
            </span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className={smallButton}
              aria-label="Log out of your account"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
