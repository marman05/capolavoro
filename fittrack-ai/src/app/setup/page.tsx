import { Logo } from "@/components/app/logo";

export const metadata = { title: "Configurazione" };

export default function SetupPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configura FitTrack AI</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Mancano le variabili d&apos;ambiente di Supabase. Crea un file <code>.env.local</code> (o impostale sul tuo hosting) e riavvia il
          server.
        </p>
      </div>
      <pre className="overflow-x-auto rounded-2xl bg-muted p-4 text-xs leading-relaxed">
        {`NEXT_PUBLIC_SUPABASE_URL=https://<progetto>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
ANTHROPIC_API_KEY=sk-ant-...
FDC_API_KEY=...            # facoltativa (USDA)`}
      </pre>
      <p className="text-sm text-muted-foreground">
        Poi applica la migrazione <code>supabase/migrations/20261106000000_init.sql</code> al database (SQL Editor di Supabase oppure{" "}
        <code>supabase db push</code>). Trovi tutti i passaggi nel README.
      </p>
    </div>
  );
}
