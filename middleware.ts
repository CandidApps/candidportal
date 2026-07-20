import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  // Refresh session cookies on every request.
  await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLogin = pathname.startsWith("/login");
  const isAuthCallback = pathname.startsWith("/auth/callback");
  const isApi = pathname.startsWith("/api/");
  const isMarketing = pathname.startsWith("/welcome") || pathname.startsWith("/dev-matrix");
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/brand") ||
    pathname.startsWith("/legacy") ||
    pathname === "/";

  // API routes handle their own auth (401 JSON). Avoid redirecting to /login —
  // that breaks browser testing and can surface as confusing HTTP errors.
  if (isApi) return response;

  if (!isLogin && !isAuthCallback && !isPublicAsset && !isMarketing) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      // Always send to the current login (the CandidApp screen at "/"),
      // never the legacy /login route.
      const loginUrl = new URL("/", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run middleware on all routes except:
     * - static assets in /_next/
     * - common static files
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|brand/).*)"
  ]
};

