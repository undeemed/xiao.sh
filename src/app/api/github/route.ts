import { NextResponse } from 'next/server';

const GITHUB_USERNAME = 'undeemed';

export async function GET() {
  try {
    // 1. Fetch User Profile
    const profileRes = await fetch(`https://api.github.com/users/${GITHUB_USERNAME}`, {
        headers: {
            'User-Agent': 'xiao.sh-portfolio',
            // Add Authorization header if you have a PAT to increase rate limits, but public is usually fine
            // 'Authorization': `token ${process.env.GITHUB_TOKEN}` 
        },
        next: { revalidate: 3600 } // Cache for 1 hour
    });
    
    if (!profileRes.ok) {
        throw new Error(`GitHub Profile API failed: ${profileRes.status}`);
    }
    
    const profile = await profileRes.json();

    // 2. Fetch User Repos
    const reposRes = await fetch(`https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=10`, {
        headers: { 'User-Agent': 'xiao.sh-portfolio' },
        next: { revalidate: 3600 }
    });

    // 3. Fetch Hackathon Repos (shlawgathon)
    const hackathonRes = await fetch(`https://api.github.com/orgs/shlawgathon/repos?sort=updated&per_page=10`, {
        headers: { 'User-Agent': 'xiao.sh-portfolio' },
        next: { revalidate: 3600 }
    });

    let repos: any[] = [];
    let allRepos: any[] = [];

    if (reposRes.ok) {
        const userRepos = await reposRes.json();
        allRepos = [...allRepos, ...userRepos];
    }
    
    if (hackathonRes.ok) {
        const hackathonRepos = await hackathonRes.json();
        allRepos = [...allRepos, ...hackathonRepos];
    }

    // Filter for non-forks (unless it's a hackathon repo, which might be okay) and sort by stars/pushed
    repos = allRepos
        .filter((r: any) => !r.fork || r.owner.login === 'shlawgathon')
        .sort((a: any, b: any) => b.stargazers_count - a.stargazers_count) // Sort by stars
        .slice(0, 10) // Top 10 repos total
        .map((r: any) => ({
            name: r.name,
            description: r.description,
            url: r.html_url,
            language: r.language,
            stars: r.stargazers_count,
            updated_at: r.updated_at,
            is_hackathon: r.owner.login === 'shlawgathon'
        }));

    // Consolidated Data for AI
    const data = {
        name: profile.name,
        bio: profile.bio,
        location: profile.location,
        company: profile.company,
        public_repos: profile.public_repos,
        followers: profile.followers,
        blog: profile.blog,
        html_url: profile.html_url,
        top_projects: repos
    };

    return NextResponse.json(data);

  } catch (error: any) {
    console.error('GitHub API Error:', error);
    // Return fallback data so the AI always has *something*
    return NextResponse.json({
        name: 'Jerry Xiao',
        bio: 'Computer Science Student at Northeastern University',
        html_url: `https://github.com/${GITHUB_USERNAME}`,
        top_projects: [],
        error: error.message
    });
  }
}
