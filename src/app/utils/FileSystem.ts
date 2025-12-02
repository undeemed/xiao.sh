import buildInfo from '../data/build-info.json';

export type FileType = 'file' | 'directory' | 'link' | 'executable';

export interface FileSystemNode {
  type: FileType;
  content?: string; // For files
  children?: { [key: string]: FileSystemNode }; // For directories
  target?: string; // For links (e.g., redirects)
  action?: () => Promise<React.ReactNode | string> | React.ReactNode | string; // For executable scripts
}

const startTime = new Date().getTime();

export const fileSystem: FileSystemNode = {
  type: 'directory',
  children: {
    home: {
      type: 'directory',
      children: {
        github: { type: 'link', target: 'https://github.com/undeemed' },
        linkedin: { type: 'link', target: 'https://www.linkedin.com/in/xiaojerry/' },
        youtube: { type: 'link', target: 'https://www.youtube.com/@Xiao0930' },
        instagram: { type: 'link', target: 'https://instagram.com/unperspicuous' },
        resume: {
          type: 'directory',
          children: {
            'view': { type: 'link', target: 'https://drive.google.com/file/d/1rb1MPDpVyALw_z-6SNI3LqGaEoXyFiss/view?usp=sharing' },
            'download': { type: 'link', target: 'https://drive.usercontent.google.com/u/0/uc?id=1rb1MPDpVyALw_z-6SNI3LqGaEoXyFiss&export=download' },
          }
        },
        contact: {
          type: 'directory',
          children: {
            'email-main': { type: 'link', target: 'mailto:jerry.x0930@gmail.com' },
            'email-school': { type: 'link', target: 'mailto:xiao.jerry@northeastern.edu' },
          }
        },
      }
    },
    analytics: {
      type: 'directory',
      children: {
        'date-updated.sh': { type: 'file', content: `Last updated: ${buildInfo.lastUpdated}` },
        'total-uptime.sh': { 
            type: 'executable', 
            action: async () => { 
                try {
                    const res = await fetch('/api/uptime');
                    const data = await res.json();
                    const startTime = data.startTime || new Date().getTime();
                    
                    const now = new Date().getTime();
                    const diff = now - startTime;
                    
                    const milliseconds = diff % 1000;
                    const seconds = Math.floor((diff / 1000) % 60);
                    const minutes = Math.floor((diff / (1000 * 60)) % 60);
                    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
                    const days = Math.floor((diff / (1000 * 60 * 60 * 24)) % 365);
                    const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));

                    return `Uptime: ${years}y:${days}d:${hours}h:${minutes}m:${seconds}s:${milliseconds}ms`;
                } catch (e) {
                    return 'Failed to fetch uptime.';
                }
            } 
        },
      }
    },
    qol: {
      type: 'directory',
      children: {
        'dark-light-toggle.sh': { type: 'executable', action: () => { return 'Theme toggled.'; } },
      }
    },
    user: {
      type: 'directory',
      children: {
        'biography.txt': { type: 'file', content: `Hi, I'm Jerry, I have a dog, cat, and a motorcycle. I am a current freshman at Northeastern University studying Computer Science with a concentration in AI and pursuing a minor in Business. I do stuff in Python, TypeScript, and will make progress on Java. Currently pursuing full-stack development with a focus on technical product management, strategy and design. Fluent in Mandarin Cantonese, and English. Enjoys Motorsports, Taekwondo, Boxing, and Calisthenics. Feel free to email me about anything! For my HR folks: do /ai (any request here) and it will pull up any available information.` },
        'projects.md': { type: 'file', content: `
Hackathons:
Top 3:
- [WebBrain](https://github.com/shlawgathon/WebBrain): AI Browser History Recall - chat with your history, describe something you've seen before online and AI will recall for you. [LinkedIn](https://www.linkedin.com/posts/xiaojerry_i-had-lots-of-fun-at-the-mongodb-agentic-activity-7383038759665164288-yzTn?utm_source=share&utm_medium=member_desktop&rcm=ACoAAEerNM8BaiLwsyO2-11sjJzKRTO2VXWvfD4)
---
Finalist:
- [ProductKit](https://github.com/shlawgathon/productkit): Product Image to Shopify Listing with AI Description, Infographic, Manual/Usage/Maintence Info, Showcase Video, and 3D Asset With AR Interaction. [LinkedIn](https://www.linkedin.com/posts/xiaojerry_github-shlawgathonproductkit-an-agentic-activity-7398606880346030080-OeHb?utm_source=share&utm_medium=member_desktop&rcm=ACoAAEerNM8BaiLwsyO2-11sjJzKRTO2VXWvfD4)
- [SportsClips](https://github.com/shlawgathon/sportsclips): TikTok, but fully automated for sports highlights & live commentary generation via video chunking pipeline with Gemini detection and YT API. [LinkedIn](https://www.linkedin.com/posts/xiaojerry_another-day-another-hackathon-shack15-activity-7385938406486437888-_u5O?utm_source=share&utm_medium=member_desktop&rcm=ACoAAEerNM8BaiLwsyO2-11sjJzKRTO2VXWvfD4)
---
Sad:
- [Wishlist](https://github.com/shlawgathon/wishlist): Agentic Fundriasing platform powered by Locus Agentic Wallet System - Crypto Kickstarter for fundraisers who want to use Locus for agentic fund payment distribution. [LinkedIn](https://www.linkedin.com/posts/xiaojerry_another-day-another-hackathon-shack15-activity-7385938406486437888-_u5O?utm_source=share&utm_medium=member_desktop&rcm=ACoAAEerNM8BaiLwsyO2-11sjJzKRTO2VXWvfD4)
- [CloudConstruct](https://github.com/shlawgathon/cloudconstruct): Spins up deployments via whiteboard - automatic system design to real deployments, draw box and describe the spec sheet and gemini will generate on the fly. [LinkedIn](https://www.linkedin.com/posts/xiaojerry_we-built-cloudconstruct-last-night-although-activity-7393469310590963712-8B4R?utm_source=share&utm_medium=member_desktop&rcm=ACoAAEerNM8BaiLwsyO2-11sjJzKRTO2VXWvfD4)` },
        'context.md': { type: 'file', content: `Additional Context:
(Add any extra details here that you want the AI to know about you, your work, or specific topics. The AI will read this file and use it to answer questions.)

- I am also proficient in:
  - Next.js
  - React
  - Tailwind CSS
  - MongoDB
  - Github/Git 
  - AWS
  - Docker
  - Swift

- Niche things that should only be mentioned when asked specifically:
  - My motorcycle is a 2024 Yamaha YZF R7, it has 8k miles and carbon fairings.
  - I have a sister who is 2 years younger than me.
  - My cat is named Mida and he is an american shorthair.
  - My dog is named Mocha and he is a kuroshiba-Inu mix.
  - I have a black belt in taekwondo.
  - My birthday is 09/30/2007.
  - I have been coding since highschool.
  - I am an Introvert.
  - I play Mincraft, Wuthering Waves, and OSU.
  - I have 192 Winstreak in Minecraft Hypixel Duels.
  - I was top 4% in OSU circle.
  - I played piano for a year and got grade 2 certification.

` },
      }
    },
  }
};
