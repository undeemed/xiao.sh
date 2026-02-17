#!/usr/bin/env bun

import "dotenv/config";
import {
  BoxRenderable,
  CliRenderer,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
  type KeyEvent,
  type SelectOption,
} from "@opentui/core";
import { spawn } from "node:child_process";
import { getSiteStartTime, recordVisitAndGetCount } from "../server/portfolioStore";

if (!process.env.OPENTUI_FORCE_EXPLICIT_WIDTH) {
  process.env.OPENTUI_FORCE_EXPLICIT_WIDTH = "false";
}

type SectionId = "overview" | "projects" | "stack" | "contact";

type PortfolioItem = {
  name: string;
  description: string;
  href?: string;
};

type Section = {
  title: string;
  summary: string;
  items: PortfolioItem[];
};

type GithubProfile = {
  name: string | null;
  bio: string | null;
  location: string | null;
  company: string | null;
  followers: number;
};

type GithubRepo = {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
};

const SECTION_ORDER: SectionId[] = ["overview", "projects", "stack", "contact"];

const sections: Record<SectionId, Section> = {
  overview: {
    title: "Overview",
    summary:
      "Jerry Xiao. CS at Northeastern. Building clean products across AI and full-stack engineering.",
    items: [
      { name: "Location", description: "Boston, MA" },
      { name: "Focus", description: "AI + product-driven full-stack systems" },
      { name: "Languages", description: "TypeScript, Python, Java" },
    ],
  },
  projects: {
    title: "Projects",
    summary: "Top repositories from GitHub. Press O (or Enter) to open a selected project.",
    items: [{ name: "Loading...", description: "Fetching latest repositories from GitHub..." }],
  },
  stack: {
    title: "Stack",
    summary: "Preferred tools for shipping fast and stable software.",
    items: [
      { name: "Frontend", description: "TypeScript, React, Next.js, Tailwind CSS" },
      { name: "Backend", description: "Node.js, Convex, MongoDB" },
      { name: "Infra", description: "Docker, AWS, Cloudflare" },
      { name: "Workflow", description: "Bun, GitHub Actions, local-first tooling" },
    ],
  },
  contact: {
    title: "Contact",
    summary: "Reach out directly or open social profiles.",
    items: [
      {
        name: "Email",
        description: "jerry.x0930@gmail.com",
        href: "mailto:jerry.x0930@gmail.com",
      },
      {
        name: "GitHub",
        description: "github.com/undeemed",
        href: "https://github.com/undeemed",
      },
      {
        name: "LinkedIn",
        description: "linkedin.com/in/xiaojerry",
        href: "https://www.linkedin.com/in/xiaojerry/",
      },
      {
        name: "Resume",
        description: "Open resume PDF",
        href: "https://drive.google.com/file/d/1rb1MPDpVyALw_z-6SNI3LqGaEoXyFiss/view?usp=sharing",
      },
    ],
  },
};

let renderer: CliRenderer;
let headerText: TextRenderable;
let sectionSelect: SelectRenderable;
let itemSelect: SelectRenderable;
let panelTitleText: TextRenderable;
let panelSummaryText: TextRenderable;
let detailText: TextRenderable;
let statusText: TextRenderable;
let footerHintText: TextRenderable;

let activeSection: SectionId = "overview";
let visitCount = 0;
let siteStartTime = Date.now();
let headerTimer: ReturnType<typeof setInterval> | null = null;
let keyboardHandler: ((key: KeyEvent) => void) | null = null;
let loadingProjects = false;

function formatUptime(start: number, now: number) {
  const total = Math.max(0, Math.floor((now - start) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function setStatus(message: string, color = "#94a3b8") {
  statusText.fg = color;
  statusText.content = `Status: ${message}`;
}

function openExternal(url: string) {
  let cmd: string;
  let args: string[];

  if (process.platform === "darwin") {
    cmd = "open";
    args = [url];
  } else if (process.platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", url];
  } else {
    cmd = "xdg-open";
    args = [url];
  }

  try {
    const child = spawn(cmd, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    setStatus(`Opened ${url}`, "#5eead4");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Failed to open link: ${message}`, "#f87171");
  }
}

function getSectionOptions(): SelectOption[] {
  return SECTION_ORDER.map((id) => ({
    name: sections[id].title,
    description: sections[id].summary,
    value: id,
  }));
}

function getItemsForActiveSection() {
  return sections[activeSection].items;
}

function getItemOptions(items: PortfolioItem[]): SelectOption[] {
  if (items.length === 0) {
    return [{ name: "No items", description: "Nothing to show here.", value: "__none" }];
  }

  return items.map((item, idx) => ({
    name: item.name,
    description: item.description,
    value: idx,
  }));
}

function getSelectedItem(): PortfolioItem | null {
  const items = getItemsForActiveSection();
  if (items.length === 0) return null;
  const selectedIndex = itemSelect.getSelectedIndex();
  return items[selectedIndex] ?? null;
}

function updateHeader() {
  const now = Date.now();
  const time = new Date(now).toLocaleTimeString();
  const uptime = formatUptime(siteStartTime, now);
  headerText.content = `xiao.sh | OpenTUI Portfolio | Visits ${visitCount} | Uptime ${uptime} | ${time}`;
}

function updateDetailPanel() {
  const selected = getSelectedItem();
  if (!selected) {
    detailText.content = "No item selected.";
    return;
  }

  const lines = [selected.description];
  if (selected.href) {
    lines.push("");
    lines.push(`Link: ${selected.href}`);
    lines.push("Press O or Enter to open.");
  }

  detailText.content = lines.join("\n");
}

function syncSectionState() {
  const section = sections[activeSection];
  panelTitleText.content = section.title;
  panelSummaryText.content = section.summary;

  const options = getItemOptions(section.items);
  itemSelect.options = options;
  itemSelect.setSelectedIndex(0);
  updateDetailPanel();
}

function openCurrentItem() {
  const selected = getSelectedItem();
  if (!selected) {
    setStatus("No item selected.", "#fbbf24");
    return;
  }

  if (!selected.href) {
    setStatus(`"${selected.name}" has no external link.`, "#fbbf24");
    return;
  }

  openExternal(selected.href);
}

async function fetchGithubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "xiao.sh-opentui",
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function refreshProjects(showStatus = true) {
  if (loadingProjects) return;
  loadingProjects = true;

  if (showStatus) {
    setStatus("Refreshing projects from GitHub...", "#93c5fd");
  }

  try {
    const [profile, repos] = await Promise.all([
      fetchGithubJson<GithubProfile>("https://api.github.com/users/undeemed"),
      fetchGithubJson<GithubRepo[]>(
        "https://api.github.com/users/undeemed/repos?sort=updated&per_page=20"
      ),
    ]);

    const topProjects = repos
      .filter((repo) => !repo.fork)
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 8)
      .map<PortfolioItem>((repo) => ({
        name: repo.name,
        description: `${repo.language ?? "Unknown"} | ${repo.stargazers_count} stars | ${
          repo.description ?? "No description"
        }`,
        href: repo.html_url,
      }));

    sections.projects.items =
      topProjects.length > 0
        ? topProjects
        : [{ name: "No public repos", description: "No projects available yet." }];

    const identity = [
      profile.name ?? "Jerry Xiao",
      profile.location ?? "Unknown location",
      profile.company ?? "Independent",
      `${profile.followers} followers`,
    ].join(" | ");

    sections.overview.summary = profile.bio
      ? `${profile.bio}\n${identity}`
      : `Building practical products across AI and full-stack.\n${identity}`;

    if (activeSection === "projects" || activeSection === "overview") {
      syncSectionState();
    }

    setStatus("Projects refreshed.", "#5eead4");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`GitHub refresh failed: ${message}`, "#f87171");
  } finally {
    loadingProjects = false;
  }
}

function focusSections() {
  sectionSelect.focus();
  itemSelect.blur();
  setStatus("Focus: sections", "#93c5fd");
}

function focusItems() {
  itemSelect.focus();
  sectionSelect.blur();
  setStatus("Focus: items", "#93c5fd");
}

function toggleFocus() {
  if (sectionSelect.focused) {
    focusItems();
  } else {
    focusSections();
  }
}

function bindKeyboard() {
  keyboardHandler = (key: KeyEvent) => {
    if (key.ctrl && key.name === "c") {
      renderer.destroy();
      return;
    }

    switch (key.name) {
      case "q":
        renderer.destroy();
        return;
      case "tab":
        toggleFocus();
        key.preventDefault();
        return;
      case "o":
        openCurrentItem();
        return;
      case "r":
        void refreshProjects();
        return;
      case "1":
      case "2":
      case "3":
      case "4": {
        const targetIndex = Number(key.name) - 1;
        const target = SECTION_ORDER[targetIndex];
        if (target) {
          sectionSelect.setSelectedIndex(targetIndex);
          activeSection = target;
          syncSectionState();
          focusSections();
        }
        return;
      }
      case "return":
      case "enter":
        if (itemSelect.focused) {
          openCurrentItem();
          key.preventDefault();
        }
        return;
      default:
        return;
    }
  };

  renderer.keyInput.on("keypress", keyboardHandler);
}

function unbindKeyboard() {
  if (!keyboardHandler) return;
  renderer.keyInput.off("keypress", keyboardHandler);
  keyboardHandler = null;
}

function buildUi() {
  renderer.setBackgroundColor("#0b1120");
  renderer.setTerminalTitle("xiao.sh OpenTUI");

  const appFrame = new BoxRenderable(renderer, {
    id: "app-frame",
    width: "auto",
    height: "auto",
    flexDirection: "column",
    padding: 1,
  });
  renderer.root.add(appFrame);

  const headerBox = new BoxRenderable(renderer, {
    id: "header-box",
    width: "auto",
    height: 3,
    border: true,
    borderStyle: "single",
    borderColor: "#334155",
    backgroundColor: "#0f172a",
    alignItems: "center",
    paddingX: 1,
  });
  appFrame.add(headerBox);

  headerText = new TextRenderable(renderer, {
    id: "header-text",
    content: "xiao.sh | OpenTUI Portfolio",
    fg: "#e2e8f0",
    bg: "transparent",
    width: "auto",
    height: "auto",
  });
  headerBox.add(headerText);

  const body = new BoxRenderable(renderer, {
    id: "body",
    width: "auto",
    height: "auto",
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "row",
    marginTop: 1,
  });
  appFrame.add(body);

  const sidebar = new BoxRenderable(renderer, {
    id: "sidebar",
    width: 30,
    minWidth: 26,
    height: "auto",
    border: true,
    borderStyle: "single",
    borderColor: "#334155",
    backgroundColor: "#111827",
    flexDirection: "column",
    padding: 1,
  });
  body.add(sidebar);

  const sectionLabel = new TextRenderable(renderer, {
    id: "section-label",
    content: "Sections",
    fg: "#93c5fd",
    bg: "transparent",
    width: "auto",
    height: 1,
  });
  sidebar.add(sectionLabel);

  sectionSelect = new SelectRenderable(renderer, {
    id: "section-select",
    width: "auto",
    height: "auto",
    flexGrow: 1,
    marginTop: 1,
    options: getSectionOptions(),
    showDescription: false,
    showScrollIndicator: false,
    wrapSelection: true,
    backgroundColor: "#111827",
    focusedBackgroundColor: "#111827",
    textColor: "#cbd5e1",
    focusedTextColor: "#e2e8f0",
    selectedBackgroundColor: "#1d4ed8",
    selectedTextColor: "#ffffff",
  });
  sidebar.add(sectionSelect);

  const content = new BoxRenderable(renderer, {
    id: "content",
    width: "auto",
    height: "auto",
    flexGrow: 1,
    flexShrink: 1,
    marginLeft: 1,
    border: true,
    borderStyle: "single",
    borderColor: "#334155",
    backgroundColor: "#0f172a",
    flexDirection: "column",
    padding: 1,
  });
  body.add(content);

  panelTitleText = new TextRenderable(renderer, {
    id: "panel-title",
    content: sections[activeSection].title,
    fg: "#f8fafc",
    bg: "transparent",
    width: "auto",
    height: 1,
  });
  content.add(panelTitleText);

  panelSummaryText = new TextRenderable(renderer, {
    id: "panel-summary",
    content: sections[activeSection].summary,
    fg: "#94a3b8",
    bg: "transparent",
    width: "auto",
    height: 3,
    marginTop: 1,
    wrapMode: "word",
  });
  content.add(panelSummaryText);

  const itemLabel = new TextRenderable(renderer, {
    id: "item-label",
    content: "Items",
    fg: "#93c5fd",
    bg: "transparent",
    width: "auto",
    height: 1,
    marginTop: 1,
  });
  content.add(itemLabel);

  itemSelect = new SelectRenderable(renderer, {
    id: "item-select",
    width: "auto",
    height: 10,
    options: getItemOptions(getItemsForActiveSection()),
    backgroundColor: "#0f172a",
    focusedBackgroundColor: "#0f172a",
    textColor: "#e2e8f0",
    focusedTextColor: "#ffffff",
    selectedBackgroundColor: "#1e3a8a",
    selectedTextColor: "#ffffff",
    descriptionColor: "#64748b",
    selectedDescriptionColor: "#cbd5e1",
    showDescription: true,
    showScrollIndicator: true,
    wrapSelection: true,
    marginTop: 1,
  });
  content.add(itemSelect);

  detailText = new TextRenderable(renderer, {
    id: "detail-text",
    content: "",
    fg: "#a5b4fc",
    bg: "transparent",
    width: "auto",
    height: "auto",
    flexGrow: 1,
    marginTop: 1,
    wrapMode: "word",
  });
  content.add(detailText);

  const footer = new BoxRenderable(renderer, {
    id: "footer",
    width: "auto",
    height: 4,
    marginTop: 1,
    border: true,
    borderStyle: "single",
    borderColor: "#334155",
    backgroundColor: "#0f172a",
    flexDirection: "column",
    paddingX: 1,
  });
  appFrame.add(footer);

  footerHintText = new TextRenderable(renderer, {
    id: "footer-hint",
    content:
      "Keys: Tab switch focus | Arrow keys move | Enter/O open link | R refresh GitHub | 1-4 jump section | Q quit",
    fg: "#94a3b8",
    bg: "transparent",
    width: "auto",
    height: 1,
    wrapMode: "word",
  });
  footer.add(footerHintText);

  statusText = new TextRenderable(renderer, {
    id: "status-text",
    content: "Status: Ready",
    fg: "#94a3b8",
    bg: "transparent",
    width: "auto",
    height: 1,
    marginTop: 1,
    wrapMode: "word",
  });
  footer.add(statusText);
}

function bindUiEvents() {
  sectionSelect.on(SelectRenderableEvents.SELECTION_CHANGED, (_index, option) => {
    activeSection = option.value as SectionId;
    syncSectionState();
  });

  itemSelect.on(SelectRenderableEvents.SELECTION_CHANGED, () => {
    updateDetailPanel();
  });

  itemSelect.on(SelectRenderableEvents.ITEM_SELECTED, () => {
    openCurrentItem();
  });
}

async function initializeMetrics() {
  try {
    visitCount = await recordVisitAndGetCount();
  } catch {
    visitCount = 1;
  }

  try {
    siteStartTime = await getSiteStartTime();
  } catch {
    siteStartTime = Date.now();
  }

  updateHeader();

  if (headerTimer) clearInterval(headerTimer);
  headerTimer = setInterval(() => {
    updateHeader();
  }, 1000);
}

async function run() {
  renderer = await createCliRenderer({
    exitOnCtrlC: true,
    useConsole: false,
    useMouse: true,
  });

  buildUi();
  bindUiEvents();
  bindKeyboard();
  syncSectionState();
  focusSections();
  updateHeader();
  setStatus("Loading runtime info...", "#93c5fd");

  renderer.on("destroy", () => {
    unbindKeyboard();
    if (headerTimer) {
      clearInterval(headerTimer);
      headerTimer = null;
    }
  });

  renderer.start();

  await initializeMetrics();
  void refreshProjects(false);
}

void run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`OpenTUI startup failed: ${message}`);
  process.exit(1);
});
