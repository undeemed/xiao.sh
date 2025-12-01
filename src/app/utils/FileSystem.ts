export type FileType = 'file' | 'directory' | 'link' | 'executable';

export interface FileSystemNode {
  type: FileType;
  content?: string; // For files
  children?: { [key: string]: FileSystemNode }; // For directories
  target?: string; // For links (e.g., redirects)
  action?: () => React.ReactNode | string; // For executable scripts
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
        'date-updated.sh': { type: 'file', content: 'Last updated: Dec 1, 2025' },
        'total-uptime.sh': { 
            type: 'executable', 
            action: () => { 
                const now = new Date().getTime();
                const diff = now - startTime;
                
                const milliseconds = diff % 1000;
                const seconds = Math.floor((diff / 1000) % 60);
                const minutes = Math.floor((diff / (1000 * 60)) % 60);
                const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
                const days = Math.floor((diff / (1000 * 60 * 60 * 24)) % 365);
                const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));

                return `Uptime: ${years}y:${days}d:${hours}h:${minutes}m:${seconds}s:${milliseconds}ms`;
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
        'biography.txt': { 
            type: 'file', 
            content: `Name: Jerry Xiao
Age: 18
Birthday: 09/30/2007
Gender: Male
Education: Northeastern University (Freshman, CS + AI, Minor in Business)
Coding Since: High School

Interests:
- Top Games: Minecraft, Wuthering Waves, OSU
- Motorcycle: Yamaha YZF R7 2024

Pets:
- Dog: Kuroshiba Inu
- Cat: Grey American Shorthair

Family:
- Younger sister

Projects:
- See /home/github for projects

Awards & Certifications:
- See /home/linkedin for details`
        },
      }
    },
  }
};
