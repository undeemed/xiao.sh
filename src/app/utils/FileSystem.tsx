import React from 'react';
import buildInfo from '../data/build-info.json';
import ImageTrack from '../components/ImageTrack';

export type FileType = 'file' | 'directory' | 'link' | 'executable';

export interface FileSystemNode {
  type: FileType;
  content?: string; // For files
  children?: { [key: string]: FileSystemNode }; // For directories
  target?: string; // For links (e.g., redirects)
  action?: (callbacks?: any) => Promise<React.ReactNode | string> | React.ReactNode | string; // For executable scripts
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
        'projects.md': { type: 'file', content: `(Project list is dynamically fetched from GitHub for the AI)` },
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
    album: {
      type: 'directory',
      children: {
        'photos.sh': {
          type: 'executable',
          action: () => {
            return <ImageTrack />;
          }
        }
      }
    }
  }
};
