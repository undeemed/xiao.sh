import { NextResponse } from 'next/server';
import { createClient } from 'redis';

const GITHUB_USERNAME = 'undeemed';

export async function GET() {
  let redis: any = null;

  try {
    // Initialize Redis (if configured)
    if (process.env.REDIS_URL) {
        redis = createClient({
            url: process.env.REDIS_URL
        });
        redis.on('error', (err: any) => console.log('Redis Client Error', err));
        await redis.connect();
    }

    // Helper to fetch with auth
    const fetchGithub = async (url: string) => {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'xiao.sh-portfolio',
                ...(process.env.GITHUB_TOKEN && { 'Authorization': `token ${process.env.GITHUB_TOKEN}` })
            },
            next: { revalidate: 0 } // Always try fresh
        });
        if (!res.ok) throw new Error(`GitHub API ${res.status}`);
        return res.json();
    };

    let data;

    try {
        // 1. Try fetching fresh data
        const profile = await fetchGithub(`https://api.github.com/users/${GITHUB_USERNAME}`);
        
        // 2. Fetch User Repos
        const userRepos = await fetchGithub(`https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=10`);
        
        // 3. Fetch Hackathon Repos
        const hackathonRepos = await fetchGithub(`https://api.github.com/orgs/shlawgathon/repos?sort=updated&per_page=10`);

        let allRepos = [...userRepos, ...hackathonRepos];

        // Process data
        const repos = allRepos
            .filter((r: any) => !r.fork || r.owner.login === 'shlawgathon')
            .sort((a: any, b: any) => b.stargazers_count - a.stargazers_count)
            .slice(0, 10)
            .map((r: any) => ({
                name: r.name,
                description: r.description,
                url: r.html_url,
                language: r.language,
                stars: r.stargazers_count,
                updated_at: r.updated_at,
                is_hackathon: r.owner.login === 'shlawgathon'
            }));

        data = {
            name: profile.name,
            bio: profile.bio,
            location: profile.location,
            company: profile.company,
            public_repos: profile.public_repos,
            followers: profile.followers,
            blog: profile.blog,
            html_url: profile.html_url,
            top_projects: repos,
            cached: false
        };

        // Success! Cache to Redis
        if (redis && redis.isOpen) {
            await redis.set('github_data_cache', JSON.stringify(data));
        }

    } catch (fetchError: any) {
        console.error('GitHub Fetch Error:', fetchError);

        // Fallback: Try Redis Cache
        if (redis && redis.isOpen) {
            const cached = await redis.get('github_data_cache');
            if (cached) {
                console.log('Serving cached GitHub data due to fetch error');
                data = JSON.parse(cached);
                data.cached = true; // Flag to indicate stale data
            }
        }

        if (!data) {
            throw fetchError; // Re-throw if no cache available
        }
    }

    if (redis && redis.isOpen) await redis.disconnect();
    
    return NextResponse.json(data);

  } catch (error: any) {
    if (redis && redis.isOpen) await redis.disconnect();
    
    console.error('Final GitHub API Error:', error);
    // Ultimate fallback if everything fails (including Redis)
    return NextResponse.json({
        name: 'Jerry Xiao',
        bio: 'Computer Science Student at Northeastern University',
        html_url: `https://github.com/${GITHUB_USERNAME}`,
        top_projects: [],
        error: error.message
    });
  }
}
