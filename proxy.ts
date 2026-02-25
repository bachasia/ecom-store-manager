import { NextRequest, NextResponse } from 'next/server';

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

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;

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
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
