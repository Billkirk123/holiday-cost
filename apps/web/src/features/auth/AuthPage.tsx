import { useState } from "react";
import type { FormEvent } from "react";

export interface Credentials {
  email: string;
  password: string;
}

interface AuthPageProps {
  busy: boolean;
  error: string;
  onSubmit: (mode: "login" | "register", credentials: Credentials) => Promise<void>;
}

export function AuthPage({ busy, error, onSubmit }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">("register");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSubmit(mode, {
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
  }

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <a className="brand brand--light" href="/">
          <span className="brand-mark">T</span> The Holiday calculator
        </a>
        <div className="auth-story-copy">
          <p className="eyebrow">Trip planning</p>
          <h1>Trips and expenses</h1>
          <p>Create trip plans, record expenses, and view costs per person.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <p className="eyebrow">{mode === "register" ? "Get started" : "Welcome back"}</p>
          <h2>{mode === "register" ? "Create your account" : "Sign in to your account"}</h2>
          <p className="form-intro">
            {mode === "register"
              ? "Create an account to save and manage your trips."
              : "Sign in to view and manage your trips."}
          </p>
          {error && <p className="notice notice--error" role="alert">{error}</p>}
          <form className="form-stack" onSubmit={handleSubmit}>
            <label>
              Email address
              <input name="email" type="email" autoComplete="email" required maxLength={254} />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                required
                minLength={mode === "register" ? 8 : undefined}
                maxLength={72}
              />
              {mode === "register" && <span className="field-hint">At least 8 characters</span>}
            </label>
            <button className="button button--primary button--wide" type="submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          <p className="form-switch">
            {mode === "register" ? "Already have an account?" : "Need an account?"}{" "}
            <button
              className="text-button"
              type="button"
              onClick={() => setMode(mode === "register" ? "login" : "register")}
            >
              {mode === "register" ? "Sign in" : "Create an account"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
