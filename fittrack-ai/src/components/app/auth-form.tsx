"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERRORS: Record<string, string> = {
  "Invalid login credentials": "Email o password non corretti.",
  "Email not confirmed": "Conferma prima la tua email: controlla la casella di posta.",
  "User already registered": "Esiste già un account con questa email.",
};

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("errore") === "link")
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legge la query string solo dopo l'idratazione
      setError("Il link di conferma non è valido o è scaduto. Accedi o richiedine uno nuovo.");
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/onboarding");
          router.refresh();
        } else {
          setSent(true);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore imprevisto";
      setError(ERRORS[msg] ?? msg);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email) {
      setError("Inserisci la tua email per ricevere il link di reset.");
      return;
    }
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) setError(error.message);
    else toast.success("Ti abbiamo inviato un'email per reimpostare la password.");
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary">
          <MailCheck className="size-7" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Controlla la tua email</h1>
        <p className="text-sm text-muted-foreground">
          Abbiamo inviato un link di conferma a <b className="text-foreground">{email}</b>. Aprilo per attivare l&apos;account.
        </p>
        <Button variant="outline" asChild>
          <Link href="/login">Torna al login</Link>
        </Button>
      </div>
    );
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
          {mode === "login" && (
            <button type="button" onClick={resetPassword} className="text-xs font-medium text-primary">
              Password dimenticata?
            </button>
          )}
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
