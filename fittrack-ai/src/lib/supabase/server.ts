import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

/** Client Supabase lato server (Route Handler / Server Component) legato ai cookie della richiesta. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chiamato da un Server Component: il refresh dei cookie avviene nel proxy.
        }
      },
    },
  });
}

/** Restituisce l'utente autenticato verificando il JWT, oppure null. */
export async function getAuthUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return { supabase, userId: null as string | null };
  return { supabase, userId: data.claims.sub as string };
}
