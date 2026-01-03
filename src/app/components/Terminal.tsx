'use client';

import React, { useState, useEffect, useRef } from 'react';
import { fileSystem, FileSystemNode } from '../utils/FileSystem';
import { useLLM, SELECTED_MODEL } from '../hooks/useLLM';
import buildInfo from '../data/build-info.json';

interface HistoryItem {
  command: string;
  output: React.ReactNode;
  path: string;
}export default function Terminal() {
  const { chat, isModelLoaded, loadModel, isLoading: isAiLoading, progress: aiProgress, error: aiError, mode: aiMode, currentModel } = useLLM();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [input, setInput] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [isGhostTyping, setIsGhostTyping] = useState(false);
  const ghostTypingRef = useRef<NodeJS.Timeout | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]); // Root is empty array
  const [fullScreenComponent, setFullScreenComponent] = useState<React.ReactNode | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);



  // Trigger ghost typing when input is exactly "/ai" or "/ai "
  useEffect(() => {
      const trimmed = input.trim();
      if ((trimmed === '/ai' || input === '/ai ') && !isGhostTyping) {
          // Debounce to allow user to keep typing if they are fast
          const timer = setTimeout(() => {
              setIsGhostTyping(true);
          }, 800); // .8 second delay before ghost starts
          return () => clearTimeout(timer);
      }
  }, [input, isGhostTyping]);

  // Ghost typing effect
  useEffect(() => {
      if (!isGhostTyping) {
          if (ghostTypingRef.current) clearTimeout(ghostTypingRef.current);
          return;
      }

      const suggestions = [
          ' send jerry an email about a coffee chat on tuesday',
          ' give me his socials',
          ' show me jerry\'s linkedin and github',
          ' contacts info',
          ' show me his resume',
          ' show me jerry\'s projects and awards',
          ' open jerry instagram',
          ' ask jerry if he is free on saturday'
      ];

      let suggestionIndex = 0;
      let charIndex = 0;
      let isDeleting = false;
      let pauseCounter = 0;

      // Ensure we start from a clean state relative to /ai
      // But we need to respect the current input which might be "/ai" or "/ai "
      // Actually, the loop will overwrite input, so we just need to ensure we prefix with /ai
      
      const typeLoop = () => {
          const currentSuggestion = suggestions[suggestionIndex];
          const prefix = '/ai';

          if (isDeleting) {
              if (charIndex > 0) {
                  setInput(prefix + currentSuggestion.substring(0, charIndex - 1));
                  charIndex--;
                  ghostTypingRef.current = setTimeout(typeLoop, 50); // Faster deleting
              } else {
                  isDeleting = false;
                  suggestionIndex = (suggestionIndex + 1) % suggestions.length;
                  ghostTypingRef.current = setTimeout(typeLoop, 50); // Pause before typing next
              }
          } else {
              if (charIndex < currentSuggestion.length) {
                  setInput(prefix + currentSuggestion.substring(0, charIndex + 1));
                  charIndex++;
                  ghostTypingRef.current = setTimeout(typeLoop, 100); // Normal typing speed
              } else {
                  // Finished typing, wait before deleting
                  if (pauseCounter < 5) { // Wait ~0.5 seconds
                      pauseCounter++;
                      ghostTypingRef.current = setTimeout(typeLoop, 100);
                  } else {
                      isDeleting = true;
                      pauseCounter = 0;
                      ghostTypingRef.current = setTimeout(typeLoop, 100);
                  }
              }
          }
      };

      typeLoop();

      return () => {
          if (ghostTypingRef.current) clearTimeout(ghostTypingRef.current);
      };
  }, [isGhostTyping]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [history]);

  const scrollToBottom = () => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [history]);

  const getCurrentNode = (path: string[]): FileSystemNode | undefined => {
    let current = fileSystem;
    for (const segment of path) {
      if (current.children && current.children[segment]) {
        current = current.children[segment];
      } else {
        return undefined;
      }
    }
    return current;
  };

  const resolvePath = (pathStr: string): string[] => {
    if (pathStr === '/') return [];
    if (pathStr === '~') return [];
    if (pathStr === '..') {
      return currentPath.slice(0, -1);
    }
    if (pathStr.startsWith('/')) {
      return pathStr.split('/').filter(Boolean);
    }
    // Relative path
    const parts = pathStr.split('/');
    let newPath = [...currentPath];
    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') {
        newPath.pop();
      } else {
        newPath.push(part);
      }
    }
    return newPath;
  };

  const handleCommand = async (cmd: string) => {
    const trimmedCmd = cmd.trim();
    if (!trimmedCmd) return;

    const [command, ...args] = trimmedCmd.split(/\s+/);
    let output: React.ReactNode = '';

    // Helper to update the last history item's output
    const updateOutput = (content: React.ReactNode) => {
        setHistory(prev => {
            const newHist = [...prev];
            if (newHist.length > 0) {
                newHist[newHist.length - 1].output = content;
            }
            return newHist;
        });
    };

    // Add to history immediately for better UX if it's an AI command
    // Add to history immediately for better UX if it's an AI command
    if (command === '/ai') {
         const newHistoryItem = { command: trimmedCmd, output: '', path: getPathString(currentPath) };
         setHistory(prev => [...prev, newHistoryItem]);
         setInput('');
         // Ghost typing is now handled by useEffect on input change
    }

    // Helper for open command logic (reused by /ai open)
    const executeOpen = (linkName: string): React.ReactNode => {
        if (!linkName) return 'usage: open [link]';

        // Helper to find a node by name (BFS)
        const findNodeByName = (name: string, node: FileSystemNode = fileSystem, path: string = ''): { node: FileSystemNode, path: string } | null => {
            if (node.children) {
                for (const [childName, child] of Object.entries(node.children)) {
                    const childPath = path ? `${path}/${childName}` : childName;
                    if (childName === name) {
                        return { node: child, path: childPath };
                    }
                    if (child.type === 'directory') {
                        const found = findNodeByName(name, child, childPath);
                        if (found) return found;
                    }
                }
            }
            return null;
        };

        const cleanLinkName = linkName.replace(/[@*]$/, '');
        let linkResolved = resolvePath(cleanLinkName);
        let linkNode = getCurrentNode(linkResolved);

        // If not found, try to find by name (smart open)
        if (!linkNode) {
            const found = findNodeByName(cleanLinkName);
            if (found) {
                linkNode = found.node;
            }
        }

        if (linkNode) {
            // If it's a directory, check for a default "view" or "index" child
            if (linkNode.type === 'directory' && linkNode.children) {
                if (linkNode.children['view'] && linkNode.children['view'].type === 'link') {
                    linkNode = linkNode.children['view'];
                }
            }

            if (linkNode.type === 'link' && linkNode.target) {
                window.open(linkNode.target, '_blank');
                return `Opening ${linkNode.target}...`;
            }
        }
        
        return `open: ${linkName}: Not a link (or not found)`;
    };

    switch (command) {
      case 'ls':
        const node = getCurrentNode(currentPath);
        if (node && node.children) {
          output = (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Object.entries(node.children).map(([name, child]) => (
                <span key={name} className={child.type === 'directory' ? 'text-blue-400 font-bold' : (child.type === 'link' ? 'text-cyan-400 underline' : 'text-gray-200')}>
                  {name}{child.type === 'directory' ? '/' : (child.type === 'link' ? '@' : '')}
                </span>
              ))}
            </div>
          );
        } else {
          output = 'Not a directory';
        }
        break;

      case 'cd':
        const targetPath = args[0] || '~';
        const resolved = resolvePath(targetPath);
        const targetNode = getCurrentNode(resolved);
        if (targetNode && targetNode.type === 'directory') {
          setCurrentPath(resolved);
        } else {
          output = `cd: no such file or directory: ${targetPath}`;
        }
        break;

      case 'cat':
        const fileName = args[0];
        if (!fileName) {
          output = 'usage: cat [file]';
        } else {
          // Strip suffixes if user typed them
          const cleanFileName = fileName.replace(/[@*]$/, '');
          const fileResolved = resolvePath(cleanFileName);
          const fileNode = getCurrentNode(fileResolved);
          if (fileNode) {
              if (fileNode.type === 'file') {
                output = <div className="whitespace-pre-wrap">{fileNode.content}</div>;
              } else if (fileNode.type === 'executable') {
                output = <div className="text-gray-400">Binary file (executable)</div>;
              } else if (fileNode.type === 'link') {
                output = <div className="text-cyan-400">Link to: {fileNode.target}</div>;
              } else {
                output = `cat: ${fileName}: Is a directory`;
              }
          } else {
            output = `cat: ${fileName}: No such file or directory`;
          }
        }
        break;

      case 'clear':
        setHistory([]);
        setInput('');
        return;

      case 'help':
        output = (
          <div>
            <div>Available commands:</div>
            <div className="pl-4">ls - List directory contents</div>
            <div className="pl-4">cd [dir] - Change directory</div>
            <div className="pl-4">cat [file] - Display file content</div>
            <div className="pl-4">clear - Clear terminal</div>
            <div className="pl-4">open [link] - Open link</div>
            <div className="pl-4">./[script] - Run .sh file</div>
            <div className="pl-4">explore - Show file system tree</div>
            <div className="pl-4">/ai [query] - Ask AI assistant</div>
          </div>
        );
        break;

      case 'explore':
        const renderTree = (node: FileSystemNode, depth: number = 0, name: string = '/'): React.ReactNode => {
            const isDir = node.type === 'directory';
            const isLink = node.type === 'link';
            
            // Simple styling: Directories are blue/bold, Links are cyan, everything else is gray
            const color = isDir ? 'text-blue-400 font-bold' : (isLink ? 'text-cyan-400' : 'text-gray-300');
            const suffix = isDir ? '/' : (isLink ? '@' : '');
            
            return (
                <div key={name}>
                    <div className={`${color}`} style={{ paddingLeft: `${depth * 1.5}rem` }}>{name}{suffix}</div>
                    {isDir && node.children && Object.entries(node.children).map(([childName, childNode]) => 
                        renderTree(childNode, depth + 1, childName)
                    )}
                </div>
            );
        };
        output = (
            <div className="mb-2">
                {renderTree(fileSystem)}
            </div>
        );
        break;
      
      case 'open':
        output = executeOpen(args[0]);
        break;

      case '/ai':

        const userQuery = args.join(' ');
        if (!userQuery) {
            updateOutput('usage: /ai [query]');
            return;
        }

        // Smart Intercept: Try to find a link match synchronously to avoid popup blockers
        // This fixes "open his github" by finding "github" in the string
        const lowerQuery = userQuery.toLowerCase();
        if (lowerQuery.startsWith('open ') || lowerQuery.startsWith('launch ') || lowerQuery.startsWith('start ') || lowerQuery.startsWith('download ')) {
            // Get all link names from file system
            const getAllLinkNames = (node: FileSystemNode, prefix: string = ''): string[] => {
                let names: string[] = [];
                if (node.children) {
                    for (const [name, child] of Object.entries(node.children)) {
                        if (child.type === 'link' || (child.type === 'directory' && child.children?.['view'])) {
                            names.push(name);
                        }
                        if (child.type === 'directory') {
                            names = [...names, ...getAllLinkNames(child)];
                        }
                    }
                }
                return names;
            };

            const allLinks = getAllLinkNames(fileSystem);
            // Sort by length descending to match "email-school" before "email"
            allLinks.sort((a, b) => b.length - a.length);

            const matchedLink = allLinks.find(link => lowerQuery.includes(link));
            if (matchedLink) {
                output = executeOpen(matchedLink);
                break;
            }
        }

        const loadingBar = (progress: string) => {
            // Extract percentage if available
            const match = progress.match(/(\d+)%/);
            const percent = match ? parseInt(match[1]) : 0;
            const width = Math.floor(percent / 5); // 20 chars width
            const bar = '[' + '='.repeat(width) + ' '.repeat(20 - width) + ']';
            return `Initializing AI Model... ${bar} ${percent}%`;
        };

        updateOutput(
            <div className="text-yellow-400">
                {aiProgress || 'Processing...'}
            </div>
        );

        try {
            // Helper to flatten file system into valid paths (only openable items)
            const getValidPaths = (node: FileSystemNode, prefix: string = ''): string[] => {
                let paths: string[] = [];
                if (node.children) {
                    Object.entries(node.children).forEach(([name, child]) => {
                        const path = prefix ? `${prefix}/${name}` : name;
                        
                        // Only include openable items in the list for the AI
                        if (child.type === 'link' || child.type === 'file' || child.type === 'executable') {
                            paths.push(path);
                        }
                        
                        if (child.type === 'directory') {
                            paths = [...paths, ...getValidPaths(child, path)];
                        }
                    });
                }
                return paths;
            };

            const validPaths = getValidPaths(fileSystem);
            const validPathsStr = validPaths.join(', ');

            // Helper to get link values
            const getLinkValues = (node: FileSystemNode, prefix: string = ''): string[] => {
                let values: string[] = [];
                if (node.children) {
                    Object.entries(node.children).forEach(([name, child]) => {
                        const path = prefix ? `${prefix}/${name}` : name;
                        if (child.type === 'link' && child.target) {
                            values.push(`${path}: ${child.target}`);
                        }
                        if (child.type === 'directory') {
                            values = [...values, ...getLinkValues(child, path)];
                        }
                    });
                }
                return values;
            };

            const linkValues = getLinkValues(fileSystem).join('\n');

            // Get biography content
            const bioNode = getCurrentNode(['user', 'biography.txt']);
            const bioContent = bioNode && bioNode.type === 'file' ? bioNode.content : '';

            // Get projects content
            const projectsNode = getCurrentNode(['user', 'projects.md']);
            const projectsContent = projectsNode && projectsNode.type === 'file' ? projectsNode.content : '';

            // Get additional context content
            const contextNode = getCurrentNode(['user', 'context.md']);
            const contextContent = contextNode && contextNode.type === 'file' ? contextNode.content : '';

            // Construct system prompt with explicit valid paths, biography, and link values
            const systemPrompt = `You are an AI assistant in a portfolio terminal. 
Current Date & Time: ${new Date().toLocaleString()}
User Current Path: ${getPathString(currentPath)}

USER BIOGRAPHY:
${githubData ? `Name: ${githubData.name}
Bio: ${githubData.bio}
Location: ${githubData.location}
Company: ${githubData.company}
Public Repos: ${githubData.public_repos}
Followers: ${githubData.followers}` : ''}

ADDITIONAL PERSONAL DETAILS:
${bioContent}

USER PROJECTS:
${githubData && githubData.top_projects ? githubData.top_projects.map((p: any) => 
`* ${p.name}: ${p.description || 'No description'} (${p.language}) - ${p.url} (Stars: ${p.stars})`
).join('\n') : projectsContent}

ADDITIONAL CONTEXT:
${contextContent}

VALID OPENABLE PATHS: [${validPathsStr}]

LINK VALUES (Targets):
${linkValues}

CRITICAL INSTRUCTION: You must ONLY suggest links that exist in the VALID OPENABLE PATHS list above.
DO NOT hallucinate external links like google.com or stackoverflow.com or any other external links that are not in the VALID OPENABLE PATHS list.
DO NOT invent paths. ONLY use paths from the VALID OPENABLE PATHS list.
DO NOT suggest directories (like "home/resume"), only specific files.

BEHAVIOR RULES:
1. If the user EXPLICITLY asks to "open", "launch", or "start" a link (e.g. "open github", "launch linkedin"), output the action: [[OPEN: name]]. You can use the short name (e.g. "github", "email-main").
2. If the user asks to "show", "list", "display", "what are", or "give me" (e.g. "show me your links", "give me his socials"), YOU MUST ALWAYS PROVIDE THE ACTUAL LINK VALUE (URL) for each item. DO NOT just list the path.
3. After listing the link value, tell the user they can open it by typing: "/ai open [name]".
4. If asked about "projects", "work", or "portfolio", USE THE "USER PROJECTS" section above to list the specific projects with their descriptions and links. DO NOT just say "check my github".
5. If asked "who is jerry" or about the user, use the USER BIOGRAPHY above to answer.
6. NEVER just output a file path like "home/github" without the accompanying URL. The user wants to see the actual link.
7. RESUME HANDLING:
   - "open resume" -> [[OPEN: resume]] (This will open the view link)
   - "show resume" -> List the view and download links with their URLs.
8. EMAIL COMPOSITION:
   - If the user asks to "send email", "write email", "compose email", OR says "ask jerry [question]", OR asks about Jerry's availability/schedule (e.g. "is jerry free?", "can jerry meet?"):
   - Output action: [[EMAIL: recipient_email | subject | body]]
   - Extract the recipient's email. If the user says "jerry", look up his email in the LINK VALUES (e.g. jerry.x0930@gmail.com).
   - Extract the subject and body from the user's request.
   - CRITICAL: Do not say "I can help you draft an email". JUST OUTPUT THE ACTION.
   - Example 1: "send jerry an email about coffee at 6" -> [[EMAIL: jerry.x0930@gmail.com | Coffee Chat | Hi Jerry,\n\nI'd like to meet for coffee at 6 tomorrow.\n\nBest,]]
   - Example 2: "ask jerry if he is free on saturday" -> [[EMAIL: jerry.x0930@gmail.com | Availability on Saturday | Hi Jerry,\n\nAre you free this coming Saturday? I'd like to connect.\n\nBest,]]
   - Example 3: "is jerry free on saturday?" -> [[EMAIL: jerry.x0930@gmail.com | Availability on Saturday | Hi Jerry,\n\nAre you free this coming Saturday? I'd like to connect.\n\nBest,]]

Example 1 (User: "open github"): [[OPEN: github]]
Example 2 (User: "show github"): "My GitHub is https://github.com/undeemed. You can open it by typing '/ai open github'."
Example 3 (User: "links"): 
"Here are my links:
* GitHub: https://github.com/undeemed
* LinkedIn: https://www.linkedin.com/in/xiaojerry/
* YouTube: https://www.youtube.com/@Xiao0930
* Instagram: https://instagram.com/unperspicuous

Type '/ai open [name]' to visit any of them."
Example 4 (User: "projects"): 
"Here are some of my projects:
* WebBrain: AI Browser History Recall (https://github.com/shlawgathon/WebBrain)
* ProductKit: Product Image to Shopify Listing (https://github.com/shlawgathon/productkit)

You can see more on my GitHub: https://github.com/undeemed"
Example 5 (User: "what is your email?"): "My email is jerry.x0930@gmail.com. You can open it by typing '/ai open email-main'."
Example 6 (User: "open resume"): [[OPEN: resume]]
Example 7 (User: "download resume"): [[OPEN: resume/download]]
Example 8 (User: "show resume"): 
"Here is my resume:
* View: [URL]
* Download: [URL]

Type '/ai open resume' to view or '/ai open resume/download' to download."
Example 9 (User: "send email to jerry about coffee"): [[EMAIL: jerry.x0930@gmail.com | Coffee Chat | Hi Jerry,\n\nI would like to chat about coffee.\n\nBest,]]

If multiple, list them with their URLs.
Otherwise, answer concisely and helpfully.`;

            const response = await chat(userQuery, systemPrompt);
            
            // Parse for OPEN actions
            const openActionRegex = /\[\[OPEN: (.*?)\]\]/g;
            let openMatch;
            const openActions: string[] = [];
            let cleanResponse = response || '';

            while ((openMatch = openActionRegex.exec(cleanResponse)) !== null) {
                openActions.push(openMatch[1]);
            }
            cleanResponse = cleanResponse.replace(openActionRegex, '');

            // Parse for EMAIL actions
            // Use [\s\S]*? to match across newlines for the body
            const emailActionRegex = /\[\[EMAIL:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*([\s\S]*?)\]\]/g;
            let emailMatch;
            const emailActions: { to: string, subject: string, body: string }[] = [];

            while ((emailMatch = emailActionRegex.exec(cleanResponse)) !== null) {
                emailActions.push({
                    to: emailMatch[1].trim(),
                    subject: emailMatch[2].trim(),
                    body: emailMatch[3].trim()
                });
            }
            cleanResponse = cleanResponse.replace(emailActionRegex, '');
            cleanResponse = cleanResponse.trim();

            // Helper to linkify URLs in text
            const formatTextWithLinks = (text: string) => {
                const urlRegex = /(https?:\/\/[^\s]+)|(mailto:[^\s]+)|([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g;
                const parts = text.split(urlRegex);
                
                return parts.map((part, i) => {
                    if (part?.match(urlRegex)) {
                        const href = part.includes('@') && !part.startsWith('mailto:') ? `mailto:${part}` : part;
                        return <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline hover:text-cyan-300">{part}</a>;
                    }
                    return part;
                });
            };

            // Execute OPEN actions
            if (openActions.length > 0) {
                openActions.forEach(actionPath => {
                    const resolved = resolvePath(actionPath);
                    const node = getCurrentNode(resolved);
                    if (node && node.type === 'link' && node.target) {
                        // Prevent blank tab for mailto links
                        if (node.target.startsWith('mailto:')) {
                            window.location.href = node.target;
                        } else {
                            window.open(node.target, '_blank');
                        }
                    }
                });
            }

            // Execute EMAIL actions
            if (emailActions.length > 0) {
                emailActions.forEach(email => {
                    const mailtoLink = `mailto:${email.to}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body.replace(/\\n/g, '\n'))}`;
                    // Open using location.href to avoid popup blockers and blank tabs
                    window.location.href = mailtoLink;
                    
                    // Provide a clickable fallback
                    updateOutput(
                        <div>
                            {cleanResponse && <div className="whitespace-pre-wrap mb-2">{formatTextWithLinks(cleanResponse)}</div>}
                            {openActions.length > 0 && <div className="text-cyan-400">Executed: Opening {openActions.join(', ')}...</div>}
                            <div className="text-cyan-400">
                                Executed: Composing email to {email.to}...
                                <br/>
                                <a href={mailtoLink} className="text-yellow-400 underline hover:text-yellow-300 cursor-pointer">
                                    (Click here if it didn't open automatically)
                                </a>
                            </div>
                        </div>
                    );
                });
            } else if (openActions.length > 0 || cleanResponse) {
                updateOutput(
                    <div>
                        {cleanResponse && <div className="whitespace-pre-wrap mb-2">{formatTextWithLinks(cleanResponse)}</div>}
                        {openActions.length > 0 && <div className="text-cyan-400">Executed: Opening {openActions.join(', ')}...</div>}
                    </div>
                );
            } else {
                updateOutput(<div className="whitespace-pre-wrap">{formatTextWithLinks(cleanResponse)}</div>);
            }

        } catch (err: any) {
            updateOutput(<div className="text-red-500">AI Error: {err.message || err}</div>);
        }
        return; // Return early since we handled history update manually



      default:
        // Handle execution using resolvePath to support paths like ./script.sh or qol/script.sh
        // Strip suffixes from the command if present (e.g. github@ -> github)
        const cleanCommand = command.replace(/[@*]$/, '');
        const resolvedPath = resolvePath(cleanCommand);
        const potentialNode = getCurrentNode(resolvedPath);
        const scriptName = resolvedPath[resolvedPath.length - 1];

        if (potentialNode) {
             if (potentialNode.type === 'file') {
                  output = <div className="whitespace-pre-wrap">{potentialNode.content}</div>;
             } else if (potentialNode.type === 'link' && potentialNode.target) {
                  output = `Opening ${potentialNode.target}...`;
                  window.open(potentialNode.target, '_blank');
             } else if (potentialNode.type === 'executable') {
                  // Execute the action
                  // Special case for theme toggle since it needs access to DOM
                  // Special case for theme toggle since it needs access to DOM
                  if (scriptName === 'dark-light-toggle.sh' || scriptName === 'dark-light-toggle') {
                      const body = document.body;
                      if (body.classList.contains('light-mode')) {
                          body.classList.remove('light-mode');
                          body.classList.add('dark-mode');
                          output = 'Switched to Dark Mode.';
                      } else {
                          body.classList.remove('dark-mode');
                          body.classList.add('light-mode');
                          output = 'Switched to Light Mode.';
                      }
                  } else if (potentialNode.action) {
                      const result = await potentialNode.action({
                          launchFullScreen: (component: React.ReactNode) => setFullScreenComponent(component)
                      });
                      output = result;
                  }
             } else {
                 output = `permission denied: ${command}`;
             }
        } else {
             output = `command not found: ${command}`;
        }
    }

    setHistory([...history, { command: trimmedCmd, output, path: getPathString(currentPath) }]);
    setInput('');
  };

  const getPathString = (path: string[]) => {
    return path.length === 0 ? '~' : '~/' + path.join('/');
  };

  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Stop ghost typing on any interaction
    if (isGhostTyping) {
        if (e.key === 'Enter') {
            // Accept the suggestion
            setIsGhostTyping(false);
            // Let it fall through to the Enter handler below
        } else {
            // Interrupt and reset
            e.preventDefault();
            setIsGhostTyping(false);
            
            // If it's a character, append it to "/ai "
            if (e.key.length === 1) {
                setInput('/ai ' + e.key);
            } else if (e.key === 'Backspace') {
                setInput('/ai');
            } else {
                // For other keys (arrows, etc), just reset to /ai
                setInput('/ai ');
            }
            return;
        }
    }

    if (e.key === 'Enter') {
      handleCommand(input);
      setHistoryIndex(null);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (history.length === 0) return;
        
        const newIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        const cmd = history[newIndex].command;
        setInput(cmd);
        setCursorPos(cmd.length);
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex === null) return;

        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
            setHistoryIndex(null);
            setInput('');
            setCursorPos(0);
        } else {
            setHistoryIndex(newIndex);
            const cmd = history[newIndex].command;
            setInput(cmd);
            setCursorPos(cmd.length);
        }
    } else if (e.key === 'Tab') {
        e.preventDefault();
        // Simple autocomplete (optional, can be expanded)
        const node = getCurrentNode(currentPath);
        if (node && node.children) {
            const parts = input.split(' ');
            const lastPart = parts[parts.length - 1];
            const matches = Object.keys(node.children).filter(k => k.startsWith(lastPart));
            if (matches.length === 1) {
                parts[parts.length - 1] = matches[0];
                setInput(parts.join(' '));
            }
        }
    }
  };

  const [welcomeText, setWelcomeText] = useState('');
  const [showNeofetch, setShowNeofetch] = useState(true);

  const [browserInfo, setBrowserInfo] = useState('Detecting...');
  const [visitCount, setVisitCount] = useState('0');
  const [isMobile, setIsMobile] = useState(false);
  const [githubData, setGithubData] = useState<any>(null);

  useEffect(() => {
    // Browser detection
    const userAgent = navigator.userAgent;
    let browser = 'Unknown';
    if (userAgent.indexOf('Firefox') > -1) {
      browser = 'Mozilla Firefox';
    } else if (userAgent.indexOf('SamsungBrowser') > -1) {
      browser = 'Samsung Internet';
    } else if (userAgent.indexOf('Opera') > -1 || userAgent.indexOf('OPR') > -1) {
      browser = 'Opera';
    } else if (userAgent.indexOf('Trident') > -1) {
      browser = 'Microsoft Internet Explorer';
    } else if (userAgent.indexOf('Edge') > -1) {
      browser = 'Microsoft Edge';
    } else if (userAgent.indexOf('Chrome') > -1) {
      browser = 'Google Chrome';
    } else if (userAgent.indexOf('Safari') > -1) {
      browser = 'Apple Safari';
    }
    setBrowserInfo(browser);

    // Mobile detection
    const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    setIsMobile(mobileCheck);


    // No longer auto-loading local model - cloud API is used first, local is fallback
    // Fetch visit count from serverless API
    const fetchVisits = async () => {
        try {
            const res = await fetch('/api/visit-count');
            const data = await res.json();
            if (data.count) {
                setVisitCount(data.count.toLocaleString());
            }
        } catch (error) {
            console.error('Failed to fetch visits:', error);
            // Fallback to basic local storage simulation if API fails
            const storedVisits = localStorage.getItem('visitCount');
            const baseVisits = 1337;
            const newCount = storedVisits ? parseInt(storedVisits) + 1 : baseVisits + 1;
            localStorage.setItem('visitCount', newCount.toString());
            setVisitCount(newCount.toLocaleString());
        }
    };

    fetchVisits();

    // Fetch GitHub data for AI context
    const fetchGithub = async () => {
        try {
            const res = await fetch('/api/github');
            const data = await res.json();
            setGithubData(data);
        } catch (error) {
            console.error('Failed to fetch GitHub data:', error);
        }
    };
    fetchGithub();

    // Simulate boot sequence or just show neofetch
    const timer = setTimeout(() => {
        // Optional: could add a boot sequence here
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const neofetchArt = `
      _                               __  __  _
     | |  ___  _ __  _ __  _   _      \\ \\/ / (_)  __ _   ___
  _  | | / _ \\| '__|| '__|| | | |      \\  /  | | / _\` | / _ \\
 | |_| ||  __/| |   | |   | |_| |      /  \\  | || (_| || (_) |
  \\___/  \\___||_|   |_|    \\__, |     /_/\\_\\ |_| \\__,_| \\___/
                           |___/
  `;
  const getAiStatus = () => {
      // Cloud API is always "online" - local model status only matters as fallback
      if (aiProgress && aiProgress.includes('%')) {
          const match = aiProgress.match(/(\d+)%/);
          return match ? `Loading local fallback... ${match[1]}%` : aiProgress;
      }
      return 'Online';
  };
  
  const aiStatus = getAiStatus();

  const [timeSpent, setTimeSpent] = useState('0s');

  useEffect(() => {
      const startTime = Date.now();
      const timer = setInterval(() => {
          // Session Time
          const diff = Date.now() - startTime;
          const seconds = Math.floor((diff / 1000) % 60);
          const minutes = Math.floor((diff / (1000 * 60)) % 60);
          const hours = Math.floor((diff / (1000 * 60 * 60)));
          
          let timeStr = '';
          if (hours > 0) timeStr += `${hours}h `;
          if (minutes > 0 || hours > 0) timeStr += `${minutes}m `;
          timeStr += `${seconds}s`;
          
          setTimeSpent(timeStr);
      }, 1000);
      return () => clearInterval(timer);
  }, []);

  const [resolution, setResolution] = useState('Detecting...');

  useEffect(() => {
      const updateResolution = () => {
          setResolution(`${window.innerWidth}x${window.innerHeight}`);
      };
      updateResolution();
      window.addEventListener('resize', updateResolution);
      return () => window.removeEventListener('resize', updateResolution);
  }, []);

  const [timeSinceUpdate, setTimeSinceUpdate] = useState('Calculating...');

  useEffect(() => {
      const updateTimeSince = () => {
          const now = Date.now();
          const diff = now - buildInfo.timestamp;
          const seconds = Math.floor(diff / 1000);
          setTimeSinceUpdate(`${seconds}s`);
      };

      updateTimeSince();
      const timer = setInterval(updateTimeSince, 1000);
      return () => clearInterval(timer);
  }, []);

  const neofetchInfo = [
    { label: 'Browser', value: browserInfo },
    { label: 'Host', value: 'xiao.sh' },
    { label: 'Kernel', value: 'Next.js 16.0.6' },
    { label: 'Visits', value: visitCount },
    { label: 'Last Updated', value: timeSinceUpdate + ' ago' },
    { label: 'Session Time', value: timeSpent },
    { label: 'Shell', value: 'Zsh' },
    { label: 'Resolution', value: resolution },
    { label: 'Theme', value: 'Dark Neon' },
    { label: 'Font', value: 'Menlo' },
    { label: 'AI Mode', value: aiMode === 'cloud' ? 'Cloud (OpenRouter)' : (aiMode === 'local' ? 'Local (WebLLM)' : 'Idle') },
    { label: 'AI Model', value: currentModel || 'Not loaded (use /ai to start)' },
    { label: 'AI Status', value: aiStatus },
  ];

  const [neofetchStep, setNeofetchStep] = useState(0);

  useEffect(() => {
      if (!showNeofetch) return;

      // Step 0: Start
      // Step 1: Art
      // Step 2+: Info lines
      const totalSteps = neofetchInfo.length + 5; // Art + Info + Extra
      
      const timer = setInterval(() => {
          setNeofetchStep(prev => {
              if (prev >= totalSteps) {
                  clearInterval(timer);
                  return prev;
              }
              return prev + 1;
          });
      }, 50); // Fast sequential loading

      return () => clearInterval(timer);
  }, [showNeofetch]);

  const [readmeText, setReadmeText] = useState('');
  const readmeTypingRef = useRef<NodeJS.Timeout | null>(null);
  const [hasStartedTyping, setHasStartedTyping] = useState(false);
  const [isCursorVisible, setIsCursorVisible] = useState(true);

  useEffect(() => {
      if (neofetchStep >= 3 && !hasStartedTyping) {
          setHasStartedTyping(true);
      }
  }, [neofetchStep]);

  useEffect(() => {
      if (!hasStartedTyping) return;

      const texts = [
          "Hi, I'm Jerry, I have a dog, cat, and a motorcycle. I am a current freshman at Northeastern University studying Computer Science with a concentration in AI and a minor in Business. I do stuff in Python, TypeScript, and will make progress on Java. Currently pursuing full-stack development with a focus on technical product management, strategy and design. I'm fluent in Mandarin, Cantonese, and English. I enjoy Taekwondo, Boxing, and Calisthenics. Feel free to email me about anything! For my HR folks: do /ai (any request here) and it will pull up any available information. You can ask the AI to learn more about me :)",
          "\"If you are going to try, go all the way. Otherwise, don’t even start. If you are going to try, go all the way. This can mean losing girlfriends, wives, relatives, jobs, and maybe your mind. Go all the way. It can mean not eating for three or four days. It can mean freezing on a park bench. It can mean jail. It can mean derision, mockery, isolation. Isolation is the gift. All the others are a test of your endurance—how much you really want to do it. And you’ll do it, despite rejection and the worst odds. And it’ll be better than anything you can imagine. If you’re going to try, go all the way. There’s no other feeling like that. You’ll be alone with the gods, and the nights will flame with fire. Do it. Do it. All the way. All the way. You will ride life straight to perfect laughter. It’s the only good fight there is.\" - Charles Bukowski"
      ];

      let textIndex = 0;
      let charIndex = 0;
      let isDeleting = false;

      const typeLoop = () => {
          const currentText = texts[textIndex];
          
          if (isDeleting) {
              if (charIndex > 0) {
                  setIsCursorVisible(true);
                  setReadmeText(currentText.substring(0, charIndex - 1));
                  charIndex--;
                  readmeTypingRef.current = setTimeout(typeLoop, 5); // Fast delete
              } else {
                  setIsCursorVisible(false);
                  isDeleting = false;
                  textIndex = (textIndex + 1) % texts.length;
                  readmeTypingRef.current = setTimeout(typeLoop, 500); // Pause before typing next
              }
          } else {
              if (charIndex < currentText.length) {
                  setIsCursorVisible(true);
                  setReadmeText(currentText.substring(0, charIndex + 1));
                  charIndex++;
                  readmeTypingRef.current = setTimeout(typeLoop, 20); // Fast typing
              } else {
                  setIsCursorVisible(false);
                  isDeleting = true;
                  readmeTypingRef.current = setTimeout(typeLoop, 25000); // Read for 25s
              }
          }
      };

      typeLoop();

      return () => {
          if (readmeTypingRef.current) clearTimeout(readmeTypingRef.current);
      };
  }, [hasStartedTyping]);

  return (
    <div className="min-h-screen p-4 font-mono text-sm md:text-base" onClick={() => inputRef.current?.focus()}>
      {showNeofetch && (
        <div className="mb-6 flex flex-col md:flex-row gap-8">
            <div className={`flex flex-col transition-opacity duration-500 ${neofetchStep >= 1 ? 'opacity-100' : 'opacity-0'}`}>
                <div className="-mt-6 text-blue-400 font-bold whitespace-pre leading-none select-none overflow-x-auto pb-2">
                    {neofetchArt}
                </div>
                <div className={`-mt-3 text-gray-300 max-w-2xl leading-relaxed transition-opacity duration-700 delay-200 ${neofetchStep >= 3 ? 'opacity-100' : 'opacity-0'} min-h-[375px]`}>
                    <div className="text-green-400 font-bold mb-2">README.md</div>
                    {readmeText}
                    <span className={`inline-block w-2 h-4 bg-gray-400 ml-1 align-middle ${isCursorVisible ? 'opacity-100' : 'opacity-0'}`}></span>
                </div>
            </div>
            <div className="flex flex-col justify-start min-w-[200px] flex-shrink-0">
                <div className={`mb-0 transition-opacity duration-300 ${neofetchStep >= 2 ? 'opacity-100' : 'opacity-0'}`}>
                    <span className="text-green-400 font-bold">guest</span>@<span className="text-green-400 font-bold">xiao.sh</span>
                </div>
                
                <div className={`mb-0 text-gray-500 transition-opacity duration-300 ${neofetchStep >= 2 ? 'opacity-100' : 'opacity-0'}`}>--------------- © 2025</div>
                {neofetchInfo.map((info, index) => (
                    <div key={info.label} className={`transition-opacity duration-100 ${neofetchStep >= index + 3 ? 'opacity-100' : 'opacity-0'}`}>
                        <span className="text-blue-400 font-bold">{info.label}</span>: {info.value}
                    </div>
                ))}
                <div className={`mt-4 text-gray-400 transition-opacity duration-500 ${neofetchStep >= neofetchInfo.length + 3 ? 'opacity-100' : 'opacity-0'}`}>
                    Type "help" to get started.
                </div>
            </div>
        </div>
      )}

      {history.map((item, index) => (
        <div key={index} className="mb-2">
          <div className="flex">
            <span className="text-green-500 mr-2">guest@xiao.sh:{item.path}$</span>
            <span>{item.command}</span>
          </div>
          <div className="text-gray-300 ml-4 mb-2 animate-in fade-in duration-300">
            {item.output}
          </div>
        </div>
      ))}

      <div className={`flex relative transition-opacity duration-500 ${neofetchStep >= neofetchInfo.length + 4 ? 'opacity-100' : 'opacity-0'}`}>
        <span className="text-green-500 mr-2">guest@xiao.sh:{getPathString(currentPath)}$</span>
        <div className="relative flex-1">
            <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
                setInput(e.target.value);
                setCursorPos(e.target.selectionStart || 0);
            }}
            onKeyDown={handleKeyDown}
            onSelect={(e) => setCursorPos(e.currentTarget.selectionStart || 0)}
            onClick={(e) => setCursorPos(e.currentTarget.selectionStart || 0)}
            onKeyUp={(e) => setCursorPos(e.currentTarget.selectionStart || 0)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-text"
            autoFocus
            autoComplete="off"
            spellCheck="false"
            />
            <span className="whitespace-pre-wrap break-all">
                {input.slice(0, cursorPos)}
                <span className="inline-block min-w-[10px] bg-gray-400 text-black animate-pulse align-middle">
                    {input[cursorPos] || '\u00A0'}
                </span>
                {input.slice(cursorPos + 1)}
            </span>
        </div>
      </div>
      <div ref={bottomRef} />
      
      {fullScreenComponent && (
          <div className="fixed inset-0 z-50 bg-black">
              {fullScreenComponent}
          </div>
      )}
    </div>
  );
}
