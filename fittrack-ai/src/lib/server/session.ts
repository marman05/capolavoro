import "server-only";
import { headers } from "next/headers";
import { auth } from "./auth";

/** ID dell'utente autenticato (sessione verificata nel database) oppure null. */
export async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function requireUserId(): Promise<string> {
  const id = await getUserId();
  if (!id) throw new Error("Sessione scaduta: effettua di nuovo l'accesso.");
  return id;
}
