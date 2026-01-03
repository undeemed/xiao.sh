import { createClient } from 'redis';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const redis = createClient({
        url: process.env.REDIS_URL
    });
    
    redis.on('error', (err) => console.log('Redis Client Error', err));

    await redis.connect();

    // Increment visit counter on every request
    const count = await redis.incr('visit_count');
    
    await redis.disconnect();
    
    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error counting unique visits:', error);
    // Fallback
    return NextResponse.json({ count: 1337 });
  }
}
