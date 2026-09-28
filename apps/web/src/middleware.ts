import { createServerClient, type CookieOptionsWithName } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  try {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items: { name: string; value: string; options: CookieOptionsWithName }[]) => { items.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } } });
    await supabase.auth.getUser();
  } catch (error) {
    // A misconfigured or unreachable Supabase shouldn't take every page down; pages re-check auth themselves.
    console.error("Session refresh skipped:", (error as Error).message);
  }
  return response;
}

export const config = { matcher: ["/dashboard/:path*", "/presentation/:path*", "/control/:path*", "/present/:path*", "/login"] };
