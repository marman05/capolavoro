import { Logo } from "@/components/app/logo";

export const metadata = { title: "Configurazione" };

export default function SetupPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
      <Logo />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configura FitTrack AI</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Mancano le variabili d&apos;ambiente del server. Impostale su Vercel (o in <code>.env.local</code>) e riavvia.
        </p>
      </div>
      <pre className="overflow-x-auto rounded-2xl bg-muted p-4 text-xs leading-relaxed">
        {`DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
BETTER_AUTH_SECRET=<stringa casuale di 32+ caratteri>
ANTHROPIC_API_KEY=sk-ant-...
FDC_API_KEY=...            # facoltativa (USDA)`}
      </pre>
      <p className="text-sm text-muted-foreground">
        Poi crea le tabelle con <code>npm run db:migrate</code>. Trovi tutti i passaggi nel README.
      </p>
    </div>
  );
}
