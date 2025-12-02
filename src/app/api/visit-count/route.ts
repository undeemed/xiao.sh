import { createClient } from 'redis';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const redis = createClient({
        url: process.env.REDIS_URL
    });
    
    redis.on('error', (err) => console.log('Redis Client Error', err));

    await redis.connect();

    // Extract IP address
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ip = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';

    // Add IP to unique visitors set
    if (ip !== 'unknown') {
        await redis.sAdd('unique_visitors', ip);
    }
    
    // Get total unique visitors
    const count = await redis.sCard('unique_visitors');
    
    await redis.disconnect();
    
    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error counting unique visits:', error);
    // Fallback
    return NextResponse.json({ count: 1337 });
  }
}
