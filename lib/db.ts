import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withRLS, type Tx } from "@/lib/system/rls";
import * as schema from "@/drizzle/schema";

export { schema };
export type { Tx };

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized: invalid or missing user session") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Verifica la sessione server-side. Deduplicata per richiesta via cache():
 * getUser() effettua una chiamata di rete a GoTrue, che senza cache verrebbe
 * ripetuta a ogni withUser() nella stessa richiesta.
 */
const getVerifiedUser = cache(async () => {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chiamato da un Server Component: ignorabile se il middleware
            // si occupa del refresh della sessione.
          }
        },
      },
    }
  );

  // getUser() valida la firma del JWT lato server.
  // getSession() legge il cookie senza validarlo: MAI usarlo qui.
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new UnauthorizedError();
  return user;
});

/**
 * UNICO punto di accesso al database dal codice applicativo.
 * I claims derivano esclusivamente dalla sessione verificata.
 */
export async function withUser<T>(cb: (tx: Tx) => Promise<T>): Promise<T> {
  const user = await getVerifiedUser();
  return withRLS(
    { sub: user.id, role: "authenticated", email: user.email },
    cb
  );
}

export type {
  Company, NewCompany,
  CompanyMember, NewCompanyMember,
  CalendarEvent, NewCalendarEvent,
  Reminder, NewReminder,
  Task, NewTask,
  Conversation, NewConversation,
  Message, NewMessage,
  Quote, NewQuote,
} from "@/drizzle/schema";
