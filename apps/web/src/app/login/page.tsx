import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { isDemoMode } from "@anchorline/providers";

async function authenticate(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=1");
    }
    throw error; // NEXT_REDIRECT on success must propagate
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const demo = isDemoMode();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl tracking-[0.2px]">Anchorline</h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-ink-muted">Brokerage Ops</p>
        </div>

        <div className="rounded-lg border border-hairline bg-card p-6 shadow-card">
          <h2 className="font-display text-lg font-semibold">Sign in</h2>
          <p className="mt-1 text-xs text-ink-muted">Owner access only.</p>

          {error && (
            <p className="mt-4 rounded-sm border border-critical-soft bg-critical-soft px-3 py-2 text-xs font-semibold text-critical">
              Invalid email or password.
            </p>
          )}

          <form action={authenticate} className="mt-5 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-secondary">Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className="rounded-sm border border-hairline-strong bg-sunken px-3 py-2 text-sm text-ink outline-none focus:border-teal"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-secondary">Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="rounded-sm border border-hairline-strong bg-sunken px-3 py-2 text-sm text-ink outline-none focus:border-teal"
              />
            </label>
            <button
              type="submit"
              className="mt-1 rounded-full bg-teal px-4 py-2.5 text-sm font-semibold text-card transition hover:brightness-110 active:translate-y-px"
            >
              Sign in
            </button>
          </form>
        </div>

        {demo && (
          <p className="mt-4 text-center text-[11.5px] text-ink-muted">
            Demo Mode — all figures are synthetic sample data.
          </p>
        )}
      </div>
    </main>
  );
}
