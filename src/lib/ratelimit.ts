// Simple in-memory rate limiter
const requests = new Map<string, { count: number; resetTime: number }>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10;

export async function ratelimit(ip: string): Promise<{ success: boolean; remaining: number }> {
  const now = Date.now();
  const record = requests.get(ip);

  // Clean up old entries periodically
  if (Math.random() < 0.01) {
    for (const [key, value] of requests.entries()) {
      if (now > value.resetTime) {
        requests.delete(key);
      }
    }
  }

  if (!record || now > record.resetTime) {
    // New window
    requests.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return { success: true, remaining: MAX_REQUESTS - 1 };
  }

  if (record.count >= MAX_REQUESTS) {
    return { success: false, remaining: 0 };
  }

  record.count++;
  return { success: true, remaining: MAX_REQUESTS - record.count };
}

export function getIP(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  return xff ? xff.split(',')[0].trim() : '127.0.0.1';
}
