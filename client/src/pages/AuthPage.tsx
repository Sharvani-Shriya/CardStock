import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { inputClass, primaryButton } from "../components/styles";
import { useAuthStore } from "../store/authStore";

interface AuthPageProps {
  mode: "login" | "register";
}

interface LocationState {
  from?: { pathname: string };
}

export function AuthPage({ mode }: AuthPageProps) {
  const isLogin = mode === "login";
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);

  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;
  const destination = locationState?.from?.pathname ?? "/boards";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // If already authenticated, redirect to the intended destination or /boards
  useEffect(() => {
    if (user) {
      navigate(destination, { replace: true });
    }
  }, [user, destination, navigate]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    const errors: { email?: string; password?: string } = {};

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = "Please enter a valid email address.";
    }

    if (!password) {
      errors.password = "Password is required.";
    } else if (!isLogin && password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Move keyboard focus to the first invalid field
      if (errors.email) {
        emailInputRef.current?.focus();
      } else if (errors.password) {
        passwordInputRef.current?.focus();
      }
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      if (isLogin) {
        await login(trimmedEmail, password);
      } else {
        await register(trimmedEmail, password);
      }
      navigate(destination, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed.";
      setFormError(message);
      // Move focus to email field on error for easy correction
      emailInputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      {/* Skip link for keyboard users */}
      <a
        href="#auth-card"
        className="sr-only rounded-lg bg-card px-4 py-2 font-semibold focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to form
      </a>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="text-center font-display text-4xl font-bold tracking-tight text-ink">
          Cardstock
        </h1>
        <p className="mt-2 text-center text-sm text-ink-soft">
          {isLogin ? "Sign in to access your boards" : "Create an account to start collaborating"}
        </p>
      </div>

      <div id="auth-card" tabIndex={-1} className="mt-8 sm:mx-auto sm:w-full sm:max-w-md focus:outline-none">
        <div className="rounded-2xl border border-line bg-card p-6 shadow-sm sm:p-8">
          {/* Status and top-level error announcement container (WCAG 2.2 AA) */}
          {formError && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-5 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"
            >
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="auth-email" className="block text-xs font-semibold text-ink-soft">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="auth-email"
                  ref={emailInputRef}
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  className={`${inputClass} ${fieldErrors.email ? "border-red-600 focus:border-red-600" : ""}`}
                  placeholder="you@example.com"
                />
              </div>
              {fieldErrors.email && (
                <p id="email-error" role="alert" className="mt-1 text-xs font-medium text-red-700">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-semibold text-ink-soft">
                Password
              </label>
              <div className="relative mt-1">
                <input
                  id="auth-password"
                  ref={passwordInputRef}
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  required
                  aria-required="true"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  className={`${inputClass} pr-16 ${fieldErrors.password ? "border-red-600 focus:border-red-600" : ""}`}
                  placeholder={isLogin ? "Your password" : "At least 8 characters"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-semibold text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={showPassword ? "Hide password" : "Show password as plain text"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" role="alert" className="mt-1 text-xs font-medium text-red-700">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-2.5 text-center ${primaryButton}`}
            >
              {isSubmitting
                ? isLogin
                  ? "Signing in…"
                  : "Creating account…"
                : isLogin
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <div className="mt-6 border-t border-line pt-4 text-center text-sm text-ink-soft">
            {isLogin ? (
              <p>
                Don&apos;t have an account?{" "}
                <Link
                  to="/register"
                  state={locationState}
                  className="font-semibold text-accent hover:text-accent-dark focus-visible:rounded"
                >
                  Create one now
                </Link>
              </p>
            ) : (
              <p>
                Already have an account?{" "}
                <Link
                  to="/login"
                  state={locationState}
                  className="font-semibold text-accent hover:text-accent-dark focus-visible:rounded"
                >
                  Sign in
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  return <AuthPage mode="login" />;
}

export function RegisterPage() {
  return <AuthPage mode="register" />;
}
