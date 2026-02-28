import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { SystemRole } from '@prisma/client';

function withLocaleHeader(request: NextRequest, locale: 'en' | 'vi', pathname: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-locale', locale);

  const url = request.nextUrl.clone();
  url.pathname = pathname;

  const response = NextResponse.rewrite(url, {
    request: {
      headers: requestHeaders
    }
  });

  response.cookies.set('NEXT_LOCALE', locale, { path: '/' });
  return response;
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;

  // Normalize: strip locale prefix to get the "real" pathname
  let normalizedPath = pathname;
  if (pathname === '/vi' || pathname.startsWith('/vi/')) {
    normalizedPath = pathname.replace(/^\/vi(?=\/|$)/, '') || '/';
  } else if (pathname === '/en' || pathname.startsWith('/en/')) {
    normalizedPath = pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  }

  const isDashboard = normalizedPath.startsWith('/dashboard');
  const isAdminRoute = normalizedPath.startsWith('/dashboard/admin');

  // --- Auth & RBAC checks for dashboard routes ---
  if (isDashboard) {
    const token = await getToken({ req: request });

    if (!token) {
      // Not logged in → redirect to login
      const loginPath = pathname.startsWith('/vi') ? '/vi/login' : '/login';
      const callbackUrl = pathname.startsWith('/vi') ? '/vi/dashboard' : '/dashboard';
      return NextResponse.redirect(
        new URL(`${loginPath}?callbackUrl=${encodeURIComponent(callbackUrl)}&reason=auth_required`, request.url)
      );
    }

    // Block /dashboard/admin/* for non-SUPER_ADMIN
    if (isAdminRoute && token.systemRole !== SystemRole.SUPER_ADMIN) {
      const redirectTo = pathname.startsWith('/vi') ? '/vi/dashboard' : '/dashboard';
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }
  }

  // --- i18n routing ---
  if (pathname === '/vi' || pathname.startsWith('/vi/')) {
    const strippedPath = pathname.replace(/^\/vi(?=\/|$)/, '') || '/';
    return withLocaleHeader(request, 'vi', strippedPath);
  }

  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const strippedPath = pathname.replace(/^\/en(?=\/|$)/, '') || '/';
    const response = NextResponse.redirect(new URL(strippedPath, request.url));
    response.cookies.set('NEXT_LOCALE', 'en', { path: '/' });
    return response;
  }

  if (cookieLocale === 'vi') {
    const prefixedPath = pathname === '/' ? '/vi' : `/vi${pathname}`;
    return NextResponse.redirect(new URL(prefixedPath, request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-locale', 'en');

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)', '/dashboard/:path*', '/vi/dashboard/:path*']
};
