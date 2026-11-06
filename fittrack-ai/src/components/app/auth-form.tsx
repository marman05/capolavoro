"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email o password non corretti.",
  USER_ALREADY_EXISTS: "Esiste già un account con questa email.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Esiste già un account con questa email.",
  PASSWORD_TOO_SHORT: "La password deve avere almeno 8 caratteri.",
  INVALID_EMAIL: "Indirizzo email non valido.",
};

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name: name.trim() || email.split("@")[0] });
      if (res.error) {
        setError(ERRORS[res.error.code ?? ""] ?? res.error.message ?? "Errore imprevisto");
        return;
      }
      router.replace(mode === "login" ? "/" : "/onboarding");
      router.refresh();
    } catch {
      setError("Impossibile contattare il server. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{mode === "login" ? "Bentornato" : "Crea il tuo account"}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {mode === "login" ? "Accedi per continuare il tuo percorso." : "Inizia gratis a monitorare alimentazione e attività."}
        </p>
      </div>

      {mode === "register" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
        </div>
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "register" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
            aria-label={show ? "Nascondi password" : "Mostra password"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {mode === "register" && <p className="text-xs text-muted-foreground">Almeno 8 caratteri.</p>}
      </div>

      {error && <p className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error}</p>}

      <Button type="submit" size="lg" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}
        {mode === "login" ? "Accedi" : "Registrati"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            Non hai un account?{" "}
            <Link href="/registrati" className="font-medium text-primary">
              Registrati
            </Link>
          </>
        ) : (
          <>
            Hai già un account?{" "}
            <Link href="/login" className="font-medium text-primary">
              Accedi
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
