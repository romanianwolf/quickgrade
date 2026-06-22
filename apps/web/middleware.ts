import { type NextRequest, NextResponse } from 'next/server'
import { createLogger, generateCorrelationId } from '@markov/observability'
import { checkRateLimit } from '@markov/cache'

const logger = createLogger({ component: 'middleware' })

const PUBLIC_PATHS = ['/login', '/register', '/demo', '/api/v1/health', '/api/v1/demo', '/_next', '/favicon.ico']

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

function getCspHeader(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' blob: data: https://*.supabase.co",
    "connect-src 'self' https://*.supabase.co https://api.groq.com https://vision.googleapis.com https://generativelanguage.googleapis.com wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const correlationId = generateCorrelationId()
  const startTime = Date.now()

  if (isPublicPath(pathname)) {
    const response = NextResponse.next()
    response.headers.set('x-correlation-id', correlationId)
    response.headers.set('Content-Security-Policy', getCspHeader())
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    return response
  }

  // Rate limiting — extract first IP from x-forwarded-for (handles proxy chains)
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = (forwardedFor?.split(',')[0]?.trim()) ?? request.headers.get('x-real-ip') ?? 'unknown'
  const rateLimitResult = await checkRateLimit(`ip:${ip}`, 60_000, 30)

  if (!rateLimitResult.allowed) {
    logger.warn('Rate limit exceeded', { correlationId, ip: ip.slice(0, 10) })
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' }, correlationId, timestamp: new Date().toISOString() },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString(),
          'x-correlation-id': correlationId,
        },
      },
    )
  }

  // Auth check (simplified — in production verify JWT against Supabase)
  const accessToken = request.cookies.get('sb-access-token')?.value
  if (!accessToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const response = NextResponse.next()
  response.headers.set('x-correlation-id', correlationId)
  response.headers.set('Content-Security-Policy', getCspHeader())
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  const duration = Date.now() - startTime
  logger.info('Request processed', { correlationId, pathname, duration })

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
