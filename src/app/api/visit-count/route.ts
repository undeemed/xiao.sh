import { createClient } from 'redis';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const redis = createClient({
        url: process.env.REDIS_URL
    });
    
    redis.on('error', (err) => console.log('Redis Client Error', err));

    await redis.connect();

    // Increment the visit count
    const count = await redis.incr('visits');
    
    await redis.disconnect();
    
    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error incrementing visit count:', error);
    // Fallback
    return NextResponse.json({ count: 1337 });
  }
}
