# xiao.sh - Terminal Portfolio

A fully interactive, browser-based terminal portfolio built with Next.js. It features a virtual file system, local AI integration, and a retro aesthetic.

## Features

- **Interactive Terminal**: A bash-like interface with command history, tab completion, and standard commands (`ls`, `cd`, `cat`, `clear`, `help`).
- **Hybrid AI Engine**:
  - **Cloud-First**: Uses **OpenRouter API** (accessing multiple models like Xiaomi, Nvidia, etc.) for fast, high-quality responses.
  - **Local Fallback**: Automatically switches to **WebLLM** (Llama 3.2 3B) if offline or API is unavailable.
  - Use `/ai [query]` to chat with the assistant.
  - **Dynamic Context**: Real-time integration with **GitHub API** to fetch latest projects and profile info.
  - **Ghost Typing**: Dynamic typing effects for AI suggestions and biography.
  - **Smart Actions**: Can open links (`[[OPEN: ...]]`) and draft emails (`[[EMAIL: ...]]`) directly.
- **Neofetch Animation**: Custom startup sequence displaying system info and ASCII art.
- **Virtual File System**: Navigate through directories, view files, and execute "scripts".
- **Ghost Typing README**: Rotating README.md text with a typing/deleting animation effect.
- **Serverless Visit Counter**: Accurate visitor tracking using Vercel KV (Redis).
- **Responsive Design**: Optimized for both desktop and mobile experiences.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (React)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **AI Engine**:
  - Cloud: [OpenRouter](https://openrouter.ai/)
  - Local: [WebLLM](https://webllm.mlc.ai/) (In-browser inference)
- **Data Source**: [GitHub API](https://docs.github.com/en/rest) (Real-time profile/repo data)
- **Backend**: [Redis](https://redis.io/) (Vercel KV)
- **Deployment**: [Vercel](https://vercel.com/)

## Commands

| Command       | Description                       |
| :------------ | :-------------------------------- |
| `help`        | Show available commands           |
| `ls`          | List directory contents           |
| `cd [dir]`    | Change directory                  |
| `cat [file]`  | View file contents                |
| `open [link]` | Open a link (e.g., `open github`) |
| `/ai [query]` | Ask the AI assistant              |
| `explore`     | View file system tree             |
| `clear`       | Clear the terminal output         |
| `history`     | Show command history              |

## License

MIT
