import { Camera, Droplets, LineChart, Sparkles } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-[oklch(0.2_0.03_160)] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-primary/40 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 size-[24rem] rounded-full bg-primary/25 blur-3xl" />
        <Logo className="relative [&>span:last-child]:text-white" />
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight">Scatta una foto. Al resto pensa l&apos;AI.</h2>
          <p className="mt-4 text-white/70">
            Calorie, macronutrienti, acqua e allenamenti in un&apos;unica app elegante, con riconoscimento automatico dei piatti.
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-3 text-sm">
            {[
              [Camera, "Riconoscimento foto"],
              [Sparkles, "Stima porzioni AI"],
              [Droplets, "Contatore acqua"],
              [LineChart, "Progressi e peso"],
            ].map(([Icon, label]) => {
              const I = Icon as typeof Camera;
              return (
                <li key={label as string} className="flex items-center gap-2 rounded-xl bg-white/8 px-3 py-2.5 backdrop-blur">
                  <I className="size-4 text-primary" /> {label as string}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-5 lg:justify-end">
          <Logo className="lg:hidden" />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}
