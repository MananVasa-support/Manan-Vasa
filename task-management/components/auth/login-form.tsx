"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import Link from "next/link";
import type { Route } from "next";
import { Mail, Lock } from "lucide-react";
import { motion } from "motion/react";

import { AuthField } from "./auth-field";
import { AuthSubmit } from "./auth-submit";
import { AuthError } from "./auth-error";
import { PasswordEye } from "./password-eye";

function translateFirebaseError(code: string | undefined): string {
  switch (code) {
    case "auth/user-disabled":
      return "This account has been deactivated. Reach out to your admin to reinstate access.";
    case "auth/too-many-requests":
      return "Too many attempts in a row — give it a minute, then try again.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Wrong password. Try again, or reset it below.";
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "We couldn't find that email. Double-check the address your admin sent.";
    case "auth/network-request-failed":
      return "Network hiccup. Check your connection and try once more.";
    default:
      return "Email or password didn't match. Try again.";
  }
}

async function exchangeIdTokenForSession(idToken: string): Promise<void> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (res.ok) return;
  // Try to surface a structured error so callers can branch on enrolment.
  let payload: { error?: string } = {};
  try {
    payload = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.status === 403 && payload.error === "not-enrolled") {
    throw new Error("not-enrolled");
  }
  throw new Error("session-exchange-failed");
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Every successful sign-in lands on /welcome — the celebration is the
  // post-login habit. If the user deep-linked into a protected page and got
  // bounced to /login?next=/x, we forward /x as a query param on /welcome so
  // the "Take me in" button still respects the original destination.
  const requestedNext = params.get("next") || "/";
  const welcomeTarget = `/welcome?next=${encodeURIComponent(requestedNext)}`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const cred = await signInWithEmailAndPassword(
          getFirebaseAuth(),
          email,
          password,
        );
        const idToken = await cred.user.getIdToken();
        await exchangeIdTokenForSession(idToken);
        router.replace(welcomeTarget as Route);
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if ((err as Error)?.message === "not-enrolled") {
          setError(
            "This email isn't enrolled in Altus Corp. Ask your admin to invite you.",
          );
          try {
            await firebaseSignOut(getFirebaseAuth());
          } catch {
            /* best effort */
          }
          return;
        }
        setError(translateFirebaseError(code));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="w-full" noValidate>
      {/* Headline */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05, ease: [0.2, 0.7, 0.3, 1] }}
        className="mb-1"
      >
        <h2
          className="font-serif text-[#0F172A]"
          style={{
            fontStyle: "italic",
            fontSize: 48,
            lineHeight: 1.02,
            letterSpacing: "-0.025em",
            fontWeight: 400,
          }}
        >
          Sign in
        </h2>
        <p
          className="mt-2"
          style={{
            fontSize: 17,
            lineHeight: 1.5,
            color: "var(--color-ink-muted)",
            fontWeight: 500,
          }}
        >
          to your dashboard
        </p>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.18 }}
        className="mt-4 mb-6"
        style={{
          fontSize: 15,
          lineHeight: 1.55,
          color: "var(--color-ink-subtle)",
        }}
      >
        Use the email your admin set up for you.
      </motion.p>

      <div className="space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: 0.28, ease: [0.2, 0.7, 0.3, 1] }}
        >
          <AuthField
            label="Work email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail className="h-5 w-5" aria-hidden />}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: 0.34, ease: [0.2, 0.7, 0.3, 1] }}
        >
          <AuthField
            label="Password"
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Lock className="h-5 w-5" aria-hidden />}
            trailing={
              <PasswordEye visible={showPw} onToggle={() => setShowPw((v) => !v)} />
            }
          />
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
          >
            <AuthError message={error} />
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.42, delay: 0.42 }}
          className="flex items-center justify-end pt-0.5"
        >
          <Link href={"/forgot-password" as Route} className="auth-link">
            Forgot password?
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: 0.46, ease: [0.2, 0.7, 0.3, 1] }}
          className="pt-2"
        >
          <div className="login-cta-lg">
            <AuthSubmit pending={isPending} pendingLabel="Signing you in">
              Sign in
            </AuthSubmit>
          </div>
        </motion.div>
      </div>

      {/* Terms footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.42, delay: 0.65 }}
        className="mt-8 border-t pt-5 text-center"
        style={{ borderColor: "rgba(15, 23, 42, 0.06)" }}
      >
        <p
          style={{
            fontSize: 13,
            color: "var(--color-ink-subtle)",
            lineHeight: 1.55,
          }}
        >
          By signing in you agree to the Altus Corp{" "}
          <Link
            href={"/terms" as Route}
            target="_blank"
            rel="noopener noreferrer"
            className="auth-link font-semibold"
          >
            terms
          </Link>{" "}
          and{" "}
          <Link
            href={"/privacy" as Route}
            target="_blank"
            rel="noopener noreferrer"
            className="auth-link font-semibold"
          >
            privacy policy
          </Link>
          .
        </p>
      </motion.div>
    </form>
  );
}

