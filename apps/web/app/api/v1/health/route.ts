import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';

interface HealthCheck {
  status: 'ok' | 'fail' | 'skip';
  latencyMs?: number;
  error?: string;
}

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await supabase.from('submissions').select('id').limit(1);
    if (error) throw error;
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (e) {
    return { status: 'fail', latencyMs: Date.now() - start, error: e instanceof Error ? e.message : 'unknown' };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const redis = Redis.fromEnv();
    await redis.ping();
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (e) {
    return { status: 'fail', latencyMs: Date.now() - start, error: e instanceof Error ? e.message : 'unknown' };
  }
}

async function checkGoogleVision(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const key = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!key) return { status: 'skip', latencyMs: 0, error: 'API key not configured' };
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ image: { content: 'dGVzdA==' }, features: [{ type: 'TEXT_DETECTION', maxResults: 1 }] }] }),
    });
    return { status: res.ok ? 'ok' : 'fail', latencyMs: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { status: 'fail', latencyMs: Date.now() - start, error: e instanceof Error ? e.message : 'unknown' };
  }
}

async function checkGroq(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) return { status: 'skip', latencyMs: 0, error: 'API key not configured' };
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    return { status: res.ok ? 'ok' : 'fail', latencyMs: Date.now() - start, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { status: 'fail', latencyMs: Date.now() - start, error: e instanceof Error ? e.message : 'unknown' };
  }
}

export async function GET() {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    google_vision: await checkGoogleVision(),
    groq: await checkGroq(),
  };

  const allHealthy = Object.values(checks).every(c => c.status === 'ok' || c.status === 'skip');
  const uptime = process.uptime();

  return NextResponse.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      version: '3.0.0',
      uptime: Math.floor(uptime),
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  );
}