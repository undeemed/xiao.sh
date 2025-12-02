import { createClient } from 'redis';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const redis = createClient({
        url: process.env.REDIS_URL
    });
    
    redis.on('error', (err) => console.log('Redis Client Error', err));

    await redis.connect();

    // Check if start time exists, if not set it to now
    const now = Date.now();
    // setnx returns 1 if key was set, 0 if it already existed
    await redis.setNX('site_start_time', now.toString());
    
    // Get the start time
    const startTime = await redis.get('site_start_time');
    
    await redis.disconnect();
    
    return NextResponse.json({ startTime: parseInt(startTime || now.toString()) });
  } catch (error) {
    console.error('Error fetching uptime:', error);
    // Fallback to now (uptime 0)
    return NextResponse.json({ startTime: Date.now() });
  }
}
