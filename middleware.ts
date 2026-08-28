import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /**
     * Everything except static assets and images. The Plaid webhook is excluded
     * too — it authenticates with a signed JWT from Plaid, not a user session,
     * and a redirect to /login would break it.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/plaid/webhook|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
