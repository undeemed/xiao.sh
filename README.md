# xiao.sh - Terminal Portfolio

A fully interactive, browser-based terminal portfolio built with Next.js. It features a virtual file system, local AI integration, and a retro aesthetic.

## Features

- **Interactive Terminal**: A bash-like interface with command history, tab completion, and standard commands (`ls`, `cd`, `cat`, `clear`, `help`).
- **Local AI Integration**: Powered by **WebLLM** (running Llama 3.2 3B locally in your browser via WebGPU).
  - Use `/ai [query]` to chat with the assistant.
  - Context-aware: Knows about my projects, bio, and links.
  - **Ghost Typing**: Dynamic typing effects for AI suggestions and biography.
  - **Smart Actions**: Can open links (`[[OPEN: ...]]`) and draft emails (`[[EMAIL: ...]]`) directly.
- **Neofetch Animation**: Custom startup sequence displaying system info and ASCII art.
- **Virtual File System**: Navigate through directories, view files, and execute "scripts".
- **Ghost Typing README**: Rotating README.md text with a typing/deleting animation effect.
- **Serverless Visit Counter**: Accurate visitor tracking using Vercel KV (Redis).
- **Responsive Design**: Optimized for both desktop and mobile experiences.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.js.org/) (React)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **AI Engine**: [WebLLM](https://webllm.mlc.ai/) (In-browser LLM inference)
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

## Getting Started

1.  Clone the repository:

    ```bash
    git clone https://github.com/undeemed/xiao.sh.git
    cd xiao.sh
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Run the development server:

    ```bash
    npm run dev
    ```

4.  Open [http://localhost:3000](http://localhost:3000) in your browser.

## License

MIT
