import { NextRequest, NextResponse } from "next/server";
import { getLinkedInSnapshot } from "@/lib/linkedin";
import { profile } from "@/lib/profile";
import { projects } from "@/lib/projects";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const DEFAULT_REFRESH_MS = 15 * 60 * 1000;
const DEFAULT_MODEL_POOL_SIZE = 8;
const DEFAULT_FALLBACK_MODELS = ["openrouter/free"];
const MAX_CONVERSATION_MESSAGES = 50;
const MAX_OPENROUTER_FALLBACK_MODELS = 3;
const MAX_REQUEST_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = 350;
const TOOL_ROUTER_HISTORY_LIMIT = 10;

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ClientMessage = {
  role?: string;
  content?: string;
};

type OpenRouterChoice = {
  message?: {
    content?: string;
  };
};

type OpenRouterError = {
  code?: number;
  message?: string;
  metadata?: Record<string, unknown>;
};

type OpenRouterResponse = {
  choices?: OpenRouterChoice[];
  model?: string;
  error?: OpenRouterError;
};

type AssistantToolName = "get_profile_context" | "compose_email_draft";

type ToolAction = {
  type: "email_compose";
  href: string;
  label: string;
  to: string;
  subject: string;
  body: string;
  autoOpen?: boolean;
};

type OpenRouterModel = {
  id?: string;
  name?: string;
  created?: number;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
  };
};

type OpenRouterModelsResponse = {
  data?: OpenRouterModel[];
};

type ModelPoolCache = {
  models: string[];
  expiresAt: number;
};

let modelPoolCache: ModelPoolCache | null = null;
let rotationCursor = 0;

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) return null;
  return candidate.slice(firstBrace, lastBrace + 1);
}

function extractEmailAddresses(text: string) {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(matches.map((entry) => entry.toLowerCase()))];
}

function getProfileNameMatchers() {
  const fullNameRegex = new RegExp(`\\b${escapeRegExp(profile.name)}\\b`, "i");
  const partRegexes = profile.name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
    .map((part) => new RegExp(`\\b${escapeRegExp(part)}\\b`, "i"));

  return {
    fullNameRegex,
    partRegexes,
  };
}

function mentionsProfileName(value: string) {
  if (!value.trim()) return false;
  const { fullNameRegex, partRegexes } = getProfileNameMatchers();
  if (fullNameRegex.test(value)) return true;
  return partRegexes.some((regex) => regex.test(value));
}

function resolveEmailRecipient(userMessage: string, draftTo: string | undefined) {
  const fromMessage = extractEmailAddresses(userMessage);
  const fromDraft = typeof draftTo === "string" ? extractEmailAddresses(draftTo) : [];
  const explicitRecipient = fromMessage[0] ?? fromDraft[0];
  if (explicitRecipient) return explicitRecipient;

  const hintPatterns = [
    /\b(?:to|email|mail)\s+([a-z][\w.'-]*(?:\s+[a-z][\w.'-]*){0,2})\b/i,
    /^(?:send|write|draft|compose)\s+(?:an?\s+)?(?:email|mail)\s+([a-z][\w.'-]*(?:\s+[a-z][\w.'-]*){0,2})\b/i,
  ];

  const candidateTexts = [draftTo ?? "", userMessage];
  for (const text of candidateTexts) {
    for (const pattern of hintPatterns) {
      const match = text.match(pattern);
      if (match?.[1] && mentionsProfileName(match[1])) {
        return profile.links.email;
      }
    }
  }

  if ((draftTo && mentionsProfileName(draftTo)) || mentionsProfileName(userMessage)) {
    return profile.links.email;
  }

  return "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripSelfReferences(value: string) {
  let output = value;
  const nameParts = profile.name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);

  output = output.replace(new RegExp(`\\b${escapeRegExp(profile.name)}\\b`, "ig"), " ");
  for (const part of nameParts) {
    output = output.replace(new RegExp(`\\b${escapeRegExp(part)}\\b`, "ig"), " ");
  }

  return output.replace(/\s+/g, " ").trim();
}

function stripLeadingRecipient(value: string) {
  return value
    .replace(/^to\s+/i, "")
    .replace(
      /^(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|[A-Za-z][\w'-]*(?:\s+[A-Za-z][\w'-]*){0,2})\s+(?=(about|regarding|re|on|for)\b)/i,
      "",
    )
    .trim();
}

function looksLikeCommandText(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return /^(send|write|draft|compose|email|mail)\b/.test(normalized);
}

function cleanSubjectCandidate(input: string) {
  const normalized = normalizeEmailIntentText(input);
  const cleaned = stripSelfReferences(
    input
    .replace(/\b(send|write|draft|compose)\b/gi, "")
    .replace(/\b(email|mail)\b/gi, "")
    .replace(/\bto\b/gi, "")
    .replace(/[^\w\s:/&-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim(),
  );

  const subjectSource = normalized || cleaned;
  if (!subjectSource) return "Quick follow-up";
  const clipped = stripSelfReferences(subjectSource).replace(/^about\s+/i, "").slice(0, 72).trim();
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

function normalizeEmailIntentText(input: string) {
  const withoutPrefix = input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(can you|could you|please)\s+/i, "")
    .replace(/^(send|write|draft|compose)\s+(an?\s+)?(email|mail)\s*/i, "")
    .replace(/^(send|write|draft|compose|email|mail)\s+/i, "")
    .replace(/^(an?\s+)?(email|mail)\s+/i, "")
    .trim();

  return stripSelfReferences(
    stripLeadingRecipient(withoutPrefix)
      .replace(/^(about|regarding|re|on|for)\s+/i, "")
      .trim(),
  );
}

function toSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const sentence = trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function fixCommonEmailTypos(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\bim\b/gi, "I'm")
    .replace(/\bi['’]?m\b/gi, "I'm")
    .replace(/\bwhatev+er\b/gi, "whatever")
    .replace(/\bpls\b/gi, "please")
    .replace(/\bthx\b/gi, "thanks")
    .replace(/\bidk\b/gi, "I don't know")
    .replace(/\bu\b/gi, "you")
    .replace(/\bi\b/g, "I")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripCasualIntentNoise(value: string) {
  return value
    .replace(/\b(i['’]?m|i am)\s+down\s+to\s+do\s+whatever\b/gi, "")
    .replace(/\b(i['’]?m|i am)\s+down\s+to\b/gi, "")
    .replace(/\b(i['’]?m|i am)\s+down\b/gi, "")
    .replace(
      /\b(?:would\s+love\s+to|i['’]?d\s+love\s+to)\s+(?:talk|chat|connect)(?:\s+(?:to|with))?\s+(?:him|her|them)\b[^.?!]*/gi,
      "",
    )
    .replace(/\bwhatever\b/gi, "")
    .replace(/\bmaybe\b/gi, "")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\?+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIntentForDraft(intentText: string) {
  return stripCasualIntentNoise(fixCommonEmailTypos(stripSelfReferences(intentText).replace(/^about\s+/i, "").trim()));
}

function formatScheduleDay(day: string) {
  return day
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function formatScheduleTime(
  hourText: string | undefined,
  minuteText: string | undefined,
  meridiem: string | undefined,
) {
  if (!hourText || !meridiem) return "";
  const hour = Number.parseInt(hourText, 10);
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) return "";
  const minute = minuteText ? `:${minuteText}` : ":00";
  return `${hour}${minute} ${meridiem.toUpperCase()}`;
}

type ScheduleTimeParts = {
  hour: number;
  minute: number;
  meridiem: "am" | "pm";
};

type ScheduleParts = {
  dayRaw: string;
  dayFormatted: string;
  time: ScheduleTimeParts | null;
};

function extractScheduleParts(value: string): ScheduleParts {
  const dayMatch = value.match(
    /\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week)\b/i,
  );
  const timeMatch = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);

  const dayRaw = dayMatch?.[1]?.trim() ?? "";
  const dayFormatted = dayRaw ? formatScheduleDay(dayRaw) : "";

  let time: ScheduleTimeParts | null = null;
  if (timeMatch?.[1] && timeMatch?.[3]) {
    const hour = Number.parseInt(timeMatch[1], 10);
    const minuteText = timeMatch[2];
    const minute = minuteText ? Number.parseInt(minuteText, 10) : 0;
    const meridiem = timeMatch[3].toLowerCase() as "am" | "pm";
    if (
      Number.isFinite(hour) &&
      hour >= 1 &&
      hour <= 12 &&
      Number.isFinite(minute) &&
      minute >= 0 &&
      minute <= 59
    ) {
      time = { hour, minute, meridiem };
    }
  }

  return {
    dayRaw,
    dayFormatted,
    time,
  };
}

function formatScheduleLabel(parts: ScheduleParts) {
  const day = parts.dayFormatted;
  const time = parts.time
    ? formatScheduleTime(
        String(parts.time.hour),
        String(parts.time.minute).padStart(2, "0"),
        parts.time.meridiem,
      )
    : "";

  if (day && time) return `${day} at ${time}`;
  if (day) return day;
  if (time) return `at ${time}`;
  return "";
}

function formatScheduleClause(parts: ScheduleParts) {
  const time = parts.time
    ? formatScheduleTime(
        String(parts.time.hour),
        String(parts.time.minute).padStart(2, "0"),
        parts.time.meridiem,
      )
    : "";

  if (parts.dayRaw) {
    const rawLower = parts.dayRaw.toLowerCase();
    const relative = rawLower === "today" || rawLower === "tonight" || rawLower === "tomorrow";
    const week = rawLower === "next week" || rawLower === "this week";
    const dayClause = relative || week ? rawLower : `on ${parts.dayFormatted}`;
    if (time) return `${dayClause} at ${time}`;
    return dayClause;
  }

  return time ? `at ${time}` : "";
}

function isOvernightTime(time: ScheduleTimeParts | null) {
  if (!time) return false;
  if (time.meridiem !== "am") return false;
  return time.hour === 12 || time.hour <= 5;
}

function extractScheduleLabel(value: string) {
  return formatScheduleLabel(extractScheduleParts(value));
}

function toTitleCase(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const minorWords = new Set(["a", "an", "the", "at", "for", "to", "and", "or", "of", "on", "in", "with"]);

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (/^(am|pm)$/i.test(lower)) return lower.toUpperCase();
      if (index > 0 && index < words.length - 1 && minorWords.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function hasObviousSubjectIssues(subject: string) {
  const wordCount = subject.split(/\s+/).filter(Boolean).length;
  const normalized = subject.trim().toLowerCase();
  return (
    subject.length > 72 ||
    wordCount > 12 ||
    wordCount < 4 ||
    normalized === "tomorrow" ||
    normalized === "today" ||
    normalized === "tonight" ||
    normalized === "hello" ||
    /\b(im|whatev+er|whatever|down to|email|mail)\b/i.test(subject) ||
    /\?.+\?/.test(subject) ||
    /^[a-z]/.test(subject)
  );
}

function buildProfessionalSubject(intentText: string, fallbackSubject: string) {
  const normalizedIntent = normalizeIntentForDraft(intentText);
  const lowerIntent = normalizedIntent.toLowerCase();
  const scheduleParts = extractScheduleParts(normalizedIntent);
  const schedule = formatScheduleLabel(scheduleParts);
  const overnight = isOvernightTime(scheduleParts.time);

  const wantsLunch = /\blunch\b/i.test(lowerIntent);
  const wantsCoffee = /\bcoffee\b/i.test(lowerIntent);

  if (/(coffee\s*chat|coffee|lunch)/i.test(lowerIntent)) {
    const base = overnight ? "Quick Chat" : wantsLunch ? "Lunch Chat" : wantsCoffee ? "Coffee Chat" : "Chat";
    return `${schedule ? `${base} ${schedule}` : `${base} Follow-Up`}`.slice(0, 72).trim();
  }

  if (/\bmeeting\b/i.test(lowerIntent)) {
    return `${schedule ? `Meeting ${schedule}` : "Meeting Follow-Up"}`.slice(0, 72).trim();
  }

  if (/\bcall\b/i.test(lowerIntent)) {
    return `${schedule ? `Call ${schedule}` : "Call Follow-Up"}`.slice(0, 72).trim();
  }

  if (/\bchat\b/i.test(lowerIntent)) {
    return `${schedule ? `Chat ${schedule}` : "Quick Chat Follow-Up"}`.slice(0, 72).trim();
  }

  const compact = normalizedIntent
    .replace(/\b(please|let me know|could you|can you|would you|open to|whether)\b/gi, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");

  return toTitleCase(compact || fallbackSubject || "Quick follow-up").slice(0, 72).trim();
}

function polishDraftBody(body: string, intentText: string, userMessage: string) {
  const fixedBody = fixCommonEmailTypos(body)
    .replace(/\b(i['’]?m|i am)\s+down\b/gi, "I would be happy")
    .replace(/\bwhatever\b/gi, "that")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s+\n/g, "\n")
    .trim();

  const normalizedLines = fixedBody
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      if (!line || line === "[Your Name]") return line;
      return line.charAt(0).toUpperCase() + line.slice(1);
    });

  const rebuilt = normalizedLines.join("\n");
  const tooCasual = /\b(idk|lol|bro|whatever)\b/i.test(rebuilt);
  const hasFormalGreeting = /^(hello|dear)\b/i.test(rebuilt);
  const hasFirstPerson = /\b(I|I'm|I'd|I'll|me|my)\b/i.test(rebuilt);
  const hasFormalClosing = /\b(best regards|kind regards|regards|sincerely)\b/i.test(rebuilt);
  const hasParagraphSpacing = /\n\s*\n/.test(rebuilt);
  const userAddressesRecipientAsPronoun = /\b(?:email|mail)\s+(him|her|them)\b/i.test(userMessage);
  const includesThirdPersonRecipientPronoun = /\b(him|her|them)\b/i.test(rebuilt);

  if (
    tooCasual ||
    !hasFormalGreeting ||
    !hasFirstPerson ||
    !hasFormalClosing ||
    !hasParagraphSpacing ||
    (userAddressesRecipientAsPronoun && includesThirdPersonRecipientPronoun)
  ) {
    return buildProfessionalFallbackBody(intentText);
  }

  return rebuilt;
}

function buildProfessionalFallbackBody(intentText: string) {
  const normalizedIntent = normalizeIntentForDraft(intentText);
  const scheduleParts = extractScheduleParts(normalizedIntent);
  const scheduleClause = formatScheduleClause(scheduleParts);
  const overnight = isOvernightTime(scheduleParts.time);

  const lowerIntent = normalizedIntent.toLowerCase();
  const wantsLunch = /\blunch\b/i.test(lowerIntent);
  const wantsCoffee = /\bcoffee\b/i.test(lowerIntent);
  const wantsCall = /\bcall\b/i.test(lowerIntent);
  const wantsMeeting = /\bmeeting\b/i.test(lowerIntent);

  const activity = overnight
    ? wantsCall
      ? "a brief call"
      : "a quick chat"
    : wantsLunch
      ? "a lunch chat"
      : wantsCoffee
        ? "a coffee chat"
        : wantsMeeting
          ? "a meeting"
          : wantsCall
            ? "a brief call"
            : "a quick chat";

  const requestLine =
    scheduleClause
      ? `I wanted to ask whether you would be available for ${activity} ${scheduleClause}.`
      : `I wanted to ask whether you would be available for ${activity}.`;

  const clarifierLine =
    wantsLunch && overnight && scheduleParts.dayRaw && scheduleParts.time
      ? `If you meant ${scheduleParts.dayRaw.toLowerCase()} at ${formatScheduleTime(String(scheduleParts.time.hour), "00", "pm")} instead, I am also available then.`
      : null;

  const nextStepLine = normalizedIntent
    ? "Please let me know whether that time works for you. If not, I would be happy to coordinate another time that is more convenient."
    : "Please let me know what time works best for you, and I will coordinate accordingly.";
  const lines = [
    "Hello,",
    "",
    "I hope this message finds you well.",
    "",
    requestLine,
    "",
    clarifierLine ? `${clarifierLine}` : null,
    clarifierLine ? "" : null,
    nextStepLine,
    "",
    "Best regards,",
    "",
    "[Your Name]",
  ].filter((line) => typeof line === "string") as string[];

  return lines.join("\n");
}

function encodeMailtoComponent(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => {
    return `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}

function sanitizeEmailDraft(raw: unknown, userMessage: string) {
  const value = raw as Partial<{ to: string; subject: string; body: string }>;
  const recipient = resolveEmailRecipient(userMessage, typeof value?.to === "string" ? value.to : undefined);
  const intentText = normalizeIntentForDraft(normalizeEmailIntentText(userMessage) || userMessage.trim());

  let subject =
    typeof value?.subject === "string" && value.subject.trim().length > 0
      ? value.subject.trim().slice(0, 120)
      : cleanSubjectCandidate(userMessage);
  subject = stripSelfReferences(subject).replace(/^(send|write|draft|compose|email|mail)\s+/i, "").trim();
  subject = stripLeadingRecipient(subject).replace(/^(about|regarding|re|on|for)\s+/i, "").trim();
  subject = fixCommonEmailTypos(subject).replace(/[!?]+$/g, "").trim();
  if (!subject) subject = cleanSubjectCandidate(userMessage);
  if (
    looksLikeCommandText(subject) ||
    (/\bemail\b/i.test(subject) && subject.length < 18) ||
    hasObviousSubjectIssues(subject)
  ) {
    subject = buildProfessionalSubject(intentText || userMessage, cleanSubjectCandidate(userMessage));
  }
  subject = toTitleCase(subject).slice(0, 72).trim() || "Quick Follow-Up";

  const body =
    typeof value?.body === "string" && value.body.trim().length > 0
      ? value.body.trim().slice(0, 2000)
      : buildProfessionalFallbackBody(intentText);
  const commandLineFound = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .some((line) => looksLikeCommandText(line));
  const referencesProfileName = new RegExp(`\\b${escapeRegExp(profile.name)}\\b`, "i").test(body);
  const shouldRewriteBody =
    commandLineFound ||
    /\bemail\s+\w+/i.test(body) ||
    (!/\b(I|I'm|I'd|I'll|me|my)\b/i.test(body) && /\b(email|mail)\b/i.test(body)) ||
    referencesProfileName;
  const draftBody = shouldRewriteBody ? buildProfessionalFallbackBody(intentText) : body;
  const finalizedBody = polishDraftBody(draftBody, intentText, userMessage);

  const mailtoBody = finalizedBody.replace(/\r?\n/g, "\r\n");
  const query = `subject=${encodeMailtoComponent(subject)}&body=${encodeMailtoComponent(mailtoBody)}`;
  const href = `mailto:${encodeURIComponent(recipient)}?${query}`;

  return {
    to: recipient,
    subject,
    body: finalizedBody,
    href,
  };
}

async function buildEmailToolResponse(
  apiKey: string,
  userMessage: string,
  modelOrder: string[],
) {
  const models = modelOrder.length > 0 ? modelOrder : ["openrouter/free"];

  for (let i = 0; i < Math.min(3, models.length); i += 1) {
    const selectedModel = models[i];
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
          "X-Title": process.env.OPENROUTER_SITE_NAME ?? "xiao.sh",
        },
        body: JSON.stringify({
          model: selectedModel,
          temperature: 0.1,
          max_tokens: 700,
          stream: false,
          messages: [
            {
              role: "system",
              content: [
                "You are an email drafting tool for the current user.",
                "Return strict JSON only with keys: to, subject, body.",
                "Draft a complete, send-ready professional email from a vague user request.",
                "Write in first person (I/me/my) from the sender perspective.",
                "Do not assume the sender's name.",
                "Do not output command-style text like 'email jerry ...'.",
                "Correct spelling, capitalization, and grammar from the user request.",
                "Rewrite casual phrasing into professional language while keeping intent.",
                "Use a formal business tone.",
                "Use blank lines between greeting, each paragraph, and the closing/signature.",
                "Use this style:",
                "- 4-8 clear sentences total (not one-liners).",
                "- Start with a polite greeting.",
                "- Explain context in 1-2 sentences.",
                "- Include a concrete ask or next step.",
                "- End with a professional closing and placeholder signature: [Your Name].",
                "Subject style:",
                "- Specific and polished, 4-10 words.",
                "- Include day/time when provided (format like 'Tomorrow at 3:00 PM').",
                "- Never output one-word subjects like 'Tomorrow'.",
                "- Avoid raw command text.",
                "Recipient handling:",
                "- If a real recipient email is unknown, set `to` to an empty string.",
                "Pronouns:",
                "- If the request says 'email him/her/them' and refers to the recipient, write to the recipient as 'you' (do not write 'talk to him').",
                "Examples (strict JSON, \\n escaped in body):",
                "Request: can you email him for a lunch chat tomorrow at 3am, would love to talk to him at that time",
                "Output: {\"to\":\"\",\"subject\":\"Quick Chat Tomorrow at 3:00 AM\",\"body\":\"Hello,\\n\\nI hope this message finds you well.\\n\\nI wanted to ask whether you would be available for a quick chat tomorrow at 3:00 AM. If you meant tomorrow at 3:00 PM instead, I am also available then.\\n\\nPlease let me know whether that time works for you. If not, I would be happy to coordinate another time that is more convenient.\\n\\nBest regards,\\n\\n[Your Name]\"}",
                "Request: draft an email to sarah@example.com about rescheduling our call to Friday at 2pm",
                "Output: {\"to\":\"sarah@example.com\",\"subject\":\"Reschedule Call to Friday at 2:00 PM\",\"body\":\"Hello Sarah,\\n\\nI hope this message finds you well.\\n\\nI wanted to ask whether you would be available to reschedule our call to Friday at 2:00 PM.\\n\\nPlease let me know if that time works for you, and if not, I am happy to coordinate an alternative.\\n\\nBest regards,\\n\\n[Your Name]\"}",
                "Output must be plain professional prose, no markdown.",
              ].join("\n"),
            },
            {
              role: "user",
              content: JSON.stringify({
                request: userMessage,
                note:
                  "Draft from the current user's perspective only. Do not include third-person profile narration.",
              }),
            },
          ],
        }),
      });

      const data = (await response.json()) as OpenRouterResponse;
      if (!response.ok || data.error) continue;

      const content = data.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") continue;

      const jsonText = extractJsonObject(content);
      if (!jsonText) continue;

      const parsed = JSON.parse(jsonText) as unknown;
      const draft = sanitizeEmailDraft(parsed, userMessage);
      const action: ToolAction = {
        type: "email_compose",
        href: draft.href,
        label: "Open draft ↗",
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
        autoOpen: true,
      };

      const recipientLabel = draft.to || "recipient not set";
      return {
        answer: `Drafted an email (${recipientLabel}). Subject: ${draft.subject}`,
        model: data.model ?? selectedModel,
        rotated: models.length > 1,
        poolSize: models.length,
        tool: "compose_email_draft" as const,
        action,
      };
    } catch {
      continue;
    }
  }

  const fallbackDraft = sanitizeEmailDraft({}, userMessage);
  const fallbackAction: ToolAction = {
    type: "email_compose",
    href: fallbackDraft.href,
    label: "Open draft ↗",
    to: fallbackDraft.to,
    subject: fallbackDraft.subject,
    body: fallbackDraft.body,
    autoOpen: true,
  };

  const fallbackRecipientLabel = fallbackDraft.to || "recipient not set";
  return {
    answer: `Drafted an email (${fallbackRecipientLabel}). Subject: ${fallbackDraft.subject}`,
    model: "local/email-tool",
    rotated: false,
    poolSize: 0,
    tool: "compose_email_draft" as const,
    action: fallbackAction,
  };
}

function parseDob(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number.parseInt(iso[1], 10);
    const month = Number.parseInt(iso[2], 10);
    const day = Number.parseInt(iso[3], 10);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const month = Number.parseInt(us[1], 10);
    const day = Number.parseInt(us[2], 10);
    const year = Number.parseInt(us[3], 10);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function computeAge(dob: Date, asOf: Date) {
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = asOf.getUTCMonth() - dob.getUTCMonth();
  const dayDiff = asOf.getUTCDate() - dob.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}

function formatDateLong(date: Date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function buildAgeAnswer(userMessage: string) {
  const asksAge = /\b(age|how old|old is)\b/i.test(userMessage);
  if (!asksAge) return null;

  const dob = parseDob(profile.dob);
  if (!dob) return "Age is not listed on this site.";

  const asOf = new Date();
  const age = computeAge(dob, asOf);
  return `Jerry Xiao is ${age} years old as of ${formatDateLong(asOf)} (DOB: ${profile.dob}).`;
}

async function buildProfileContextToolOutput() {
  const linkedIn = await getLinkedInSnapshot().catch(() => null);
  const dobDate = parseDob(profile.dob);
  const asOf = new Date();
  const computedAge = dobDate ? computeAge(dobDate, asOf) : null;

  const projectLines = projects
    .map((project) => {
      const links = [
        `GitHub: ${project.githubUrl}`,
        project.linkedinUrl ? `LinkedIn: ${project.linkedinUrl}` : "",
        project.eventUrl ? `Event: ${project.eventUrl}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      return `- ${project.title}: ${project.summary}\n  Tags: ${project.tags.join(", ")}\n  ${
        project.highlight ? `Highlight: ${project.highlight}\n  ` : ""
      }${links}`;
    })
    .join("\n");

  const linkedInLines = linkedIn
    ? [
        `Name: ${linkedIn.profile.name}`,
        linkedIn.profile.title ? `Title: ${linkedIn.profile.title}` : "",
        linkedIn.profile.location ? `Location: ${linkedIn.profile.location}` : "",
        linkedIn.profile.summary ? `Summary: ${linkedIn.profile.summary}` : "",
        linkedIn.profile.imageUrl ? `Image: ${linkedIn.profile.imageUrl}` : "",
        linkedIn.profile.linkedinUrl ? `Profile URL: ${linkedIn.profile.linkedinUrl}` : "",
        typeof linkedIn.profile.followerCount === "number"
          ? `Followers: ${linkedIn.profile.followerCount}`
          : "",
        linkedIn.profile.achievements && linkedIn.profile.achievements.length > 0
          ? `Achievements: ${linkedIn.profile.achievements.join(" | ")}`
          : "",
        linkedIn.profile.technologies && linkedIn.profile.technologies.length > 0
          ? `Technologies: ${linkedIn.profile.technologies.join(", ")}`
          : "",
        linkedIn.profile.narrative && linkedIn.profile.narrative.length > 0
          ? `Narrative: ${linkedIn.profile.narrative.join(" | ")}`
          : "",
        linkedIn.sections && linkedIn.sections.length > 0
          ? `Profile Sections: ${linkedIn.sections
              .map((section) => `${section.title}: ${section.items.slice(0, 8).join(" | ")}`)
              .join(" || ")}`
          : "",
        `Pulled At: ${linkedIn.pulledAt}`,
        "",
        "Recent LinkedIn Posts:",
        ...linkedIn.posts.map((post) => {
          return [
            `- ${post.headline ?? "Post"} (${post.url})`,
            post.publishedAt ? `  Published: ${post.publishedAt}` : "",
            post.excerpt ? `  Excerpt: ${post.excerpt}` : "",
            post.videoUrl ? `  Video: ${post.videoUrl}` : "",
            typeof post.commentCount === "number" ? `  Comments: ${post.commentCount}` : "",
          ]
            .filter(Boolean)
            .join("\n");
        }),
      ]
    : ["Unavailable"];

  return [
    "You are a portfolio assistant for Jerry Xiao.",
    "Only answer questions using the profile, project, and LinkedIn context below.",
    "If something is unknown or not present, say that it is not listed on this site.",
    "Keep answers concise and factual.",
    "",
    "Profile:",
    `Name: ${profile.name}`,
    `Role: ${profile.role}`,
    `Date of Birth: ${profile.dob?.trim() ? profile.dob : "Not listed"}`,
    computedAge !== null ? `Age (as of ${formatDateLong(asOf)}): ${computedAge}` : "Age: Not listed",
    `Location: ${profile.location}`,
    `Education: ${profile.education}`,
    `Bio: ${profile.bio}`,
    `Skills: ${profile.skills.join(", ")}`,
    `GitHub: ${profile.links.github}`,
    `LinkedIn: ${profile.links.linkedin}`,
    `Email: ${profile.links.email}`,
    "",
    "LinkedIn Context:",
    ...linkedInLines,
    "",
    "Projects:",
    projectLines,
  ].join("\n");
}

function parseAnswer(data: OpenRouterResponse) {
  const content = data.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function parseToolChoice(content: string) {
  const jsonText = extractJsonObject(content);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as { tool?: string };
    if (parsed.tool === "compose_email_draft" || parsed.tool === "get_profile_context") {
      return parsed.tool;
    }
  } catch {
    return null;
  }

  return null;
}

async function decideAssistantTool(
  apiKey: string,
  conversationMessages: OpenRouterMessage[],
  modelOrder: string[],
) {
  const models = modelOrder.length > 0 ? modelOrder : ["openrouter/free"];
  const recentConversation = conversationMessages
    .slice(-TOOL_ROUTER_HISTORY_LIMIT)
    .map((message) => ({ role: message.role, content: message.content }));

  for (let i = 0; i < Math.min(3, models.length); i += 1) {
    const selectedModel = models[i];

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
          "X-Title": process.env.OPENROUTER_SITE_NAME ?? "xiao.sh",
        },
        body: JSON.stringify({
          model: selectedModel,
          temperature: 0,
          max_tokens: 80,
          stream: false,
          messages: [
            {
              role: "system",
              content: [
                "You are a tool router.",
                "Choose exactly one tool:",
                "- get_profile_context",
                "- compose_email_draft",
                "Output strict JSON only: {\"tool\":\"get_profile_context\"} or {\"tool\":\"compose_email_draft\"}.",
                "Select compose_email_draft only when the user explicitly asks to draft/compose/send an email.",
                "For all profile/project/about questions, select get_profile_context.",
                "If uncertain, select get_profile_context.",
              ].join("\n"),
            },
            {
              role: "user",
              content: JSON.stringify({
                conversation: recentConversation,
              }),
            },
          ],
        }),
      });

      const data = (await response.json()) as OpenRouterResponse;
      if (!response.ok || data.error) continue;

      const content = data.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") continue;

      const choice = parseToolChoice(content);
      if (choice) return choice;
    } catch {
      continue;
    }
  }

  return "get_profile_context" as const;
}

function extractProviderName(metadata: Record<string, unknown> | undefined) {
  const value = metadata?.provider_name;
  return typeof value === "string" ? value : null;
}

function formatOpenRouterErrorMessage(data: OpenRouterResponse, fallback: string) {
  const message = data.error?.message ?? fallback;
  const providerName = extractProviderName(data.error?.metadata);
  return providerName ? `${message} (provider: ${providerName})` : message;
}

function isRetriableStatus(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504 || status === 529;
}

function isRetriableProviderError(data: OpenRouterResponse) {
  const code = data.error?.code;
  if (typeof code === "number" && isRetriableStatus(code)) return true;

  const message = data.error?.message?.toLowerCase() ?? "";
  return (
    message.includes("provider returned error") ||
    message.includes("provider overloaded") ||
    message.includes("rate limit") ||
    message.includes("temporarily unavailable")
  );
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeConversation(rawMessages: unknown) {
  if (!Array.isArray(rawMessages)) return [];

  return rawMessages
    .map((message) => message as ClientMessage)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: typeof message.content === "string" ? message.content.trim() : "",
    }))
    .filter((message) => message.content.length > 0)
    .slice(-MAX_CONVERSATION_MESSAGES);
}

function parseEnvModelList(value: string | undefined) {
  if (!value) return [];

  return value
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function parseEnvPositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toNumber(value: string | number | undefined) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  return Number.parseFloat(value);
}

function isFreeModel(model: OpenRouterModel) {
  const promptCost = toNumber(model.pricing?.prompt);
  const completionCost = toNumber(model.pricing?.completion);
  const requestCost = toNumber(model.pricing?.request);
  const costsAreZero =
    (Number.isNaN(promptCost) || promptCost === 0) &&
    (Number.isNaN(completionCost) || completionCost === 0) &&
    (Number.isNaN(requestCost) || requestCost === 0);

  return costsAreZero || model.id?.endsWith(":free") === true;
}

function supportsTextIO(model: OpenRouterModel) {
  const input = model.architecture?.input_modalities;
  const output = model.architecture?.output_modalities;

  if (!input && !output) return true;

  const inputText = !input || input.includes("text");
  const outputText = !output || output.includes("text");

  return inputText && outputText;
}

function getSotaScore(model: OpenRouterModel) {
  const id = `${model.id ?? ""} ${model.name ?? ""}`.toLowerCase();
  const created = model.created ?? 0;
  const contextLength = model.context_length ?? 0;

  let score = 0;
  if (id.includes("gpt-oss")) score += 30;
  if (id.includes("qwen3")) score += 24;
  if (id.includes("llama-4")) score += 22;
  if (id.includes("kimi-k2")) score += 22;
  if (id.includes("deepseek-r1") || id.includes("deepseek-v3")) score += 20;
  if (id.includes("gemini-2.5")) score += 18;
  if (id.includes("mistral") || id.includes("command-r")) score += 12;

  if (id.includes(":free")) score += 4;
  score += Math.min(12, Math.log2(Math.max(1, contextLength / 8192 + 1)) * 4);
  score += Math.min(8, created / 1000000000);

  return score;
}

function uniqModels(models: string[]) {
  return [...new Set(models)];
}

async function fetchFreeModels(apiKey: string) {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    // Keep cache behavior explicit and controlled by our in-memory TTL.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models (${response.status}).`);
  }

  const data = (await response.json()) as OpenRouterModelsResponse;
  const modelPoolSize = parseEnvPositiveInt(
    process.env.OPENROUTER_MODEL_POOL_SIZE,
    DEFAULT_MODEL_POOL_SIZE,
  );

  return (data.data ?? [])
    .filter((model) => Boolean(model.id))
    .filter(isFreeModel)
    .filter(supportsTextIO)
    .sort((a, b) => getSotaScore(b) - getSotaScore(a))
    .slice(0, modelPoolSize)
    .map((model) => model.id as string);
}

async function getRotatingModelOrder(apiKey: string) {
  const now = Date.now();
  if (modelPoolCache && modelPoolCache.expiresAt > now && modelPoolCache.models.length > 0) {
    return rotateModelOrder(modelPoolCache.models);
  }

  const refreshMs = parseEnvPositiveInt(process.env.OPENROUTER_MODELS_REFRESH_MS, DEFAULT_REFRESH_MS);
  const includeDynamic = process.env.OPENROUTER_DYNAMIC_MODELS !== "false";
  const envModels = parseEnvModelList(process.env.OPENROUTER_MODELS);

  let discoveredModels: string[] = [];
  if (includeDynamic) {
    try {
      discoveredModels = await fetchFreeModels(apiKey);
    } catch {
      discoveredModels = [];
    }
  }

  const models = uniqModels([...envModels, ...discoveredModels, ...DEFAULT_FALLBACK_MODELS]).filter(Boolean);

  modelPoolCache = {
    models,
    expiresAt: now + refreshMs,
  };

  return rotateModelOrder(models);
}

function rotateModelOrder(models: string[]) {
  if (models.length <= 1) return models;

  const start = rotationCursor % models.length;
  rotationCursor = (rotationCursor + 1) % models.length;

  return [...models.slice(start), ...models.slice(0, start)];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { query?: string; messages?: ClientMessage[] };
    const query = body.query?.trim() ?? "";
    const conversation = normalizeConversation(body.messages);
    const hasConversation = conversation.length > 0;

    if (!hasConversation && !query) {
      return NextResponse.json({ error: "Missing query." }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY is not configured." },
        { status: 500 },
      );
    }

    const conversationMessages: OpenRouterMessage[] = hasConversation
      ? conversation
      : [{ role: "user", content: query }];

    if (conversationMessages[conversationMessages.length - 1]?.role !== "user") {
      return NextResponse.json(
        { error: "Last message must be from the user." },
        { status: 400 },
      );
    }

    const latestUserMessage = conversationMessages[conversationMessages.length - 1]?.content ?? "";
    const ageAnswer = buildAgeAnswer(latestUserMessage);
    if (ageAnswer) {
      return NextResponse.json({
        answer: ageAnswer,
        model: "local/profile-facts",
        rotated: false,
        poolSize: 0,
        tool: "get_profile_context" as const,
      });
    }

    const toolRouterModelOrder = await getRotatingModelOrder(apiKey);
    const selectedTool = await decideAssistantTool(
      apiKey,
      conversationMessages,
      toolRouterModelOrder,
    );
    if (selectedTool === "compose_email_draft") {
      const emailModelOrder = await getRotatingModelOrder(apiKey);
      const emailToolResponse = await buildEmailToolResponse(
        apiKey,
        latestUserMessage,
        emailModelOrder,
      );
      return NextResponse.json(emailToolResponse);
    }

    const contextPrompt = await buildProfileContextToolOutput();

    const messages: OpenRouterMessage[] = [
      {
        role: "system",
        content: contextPrompt,
      },
      ...conversationMessages,
    ];

    const initialModelOrder = await getRotatingModelOrder(apiKey);
    let lastErrorMessage = "OpenRouter request failed.";
    let lastStatus = 502;

    for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
      const orderedModels =
        attempt === 0 ? initialModelOrder : await getRotatingModelOrder(apiKey);
      const [primaryModel, ...remainingModels] = orderedModels;
      const fallbackModels = remainingModels.slice(0, MAX_OPENROUTER_FALLBACK_MODELS);
      const selectedModel = primaryModel ?? "openrouter/free";

      try {
        const response = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
            "X-Title": process.env.OPENROUTER_SITE_NAME ?? "xiao.sh",
          },
          body: JSON.stringify({
            model: selectedModel,
            models: fallbackModels,
            provider: {
              allow_fallbacks: true,
            },
            temperature: 0.2,
            max_tokens: 300,
            stream: false,
            messages,
          }),
        });

        const data = (await response.json()) as OpenRouterResponse;

        if (response.ok && !data.error) {
          const answer = parseAnswer(data);
          if (answer) {
            return NextResponse.json({
              answer,
              model: data.model ?? selectedModel,
              rotated: orderedModels.length > 1,
              poolSize: orderedModels.length,
              tool: "get_profile_context" as const,
            });
          }

          lastErrorMessage = "OpenRouter returned empty content.";
          lastStatus = 502;
        } else {
          const errorStatus =
            typeof data.error?.code === "number" ? data.error.code : response.status || 502;
          lastStatus = errorStatus;
          lastErrorMessage = formatOpenRouterErrorMessage(data, "OpenRouter request failed.");

          if (!(isRetriableStatus(errorStatus) || isRetriableProviderError(data))) {
            break;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "OpenRouter request failed.";
        lastErrorMessage = `OpenRouter request failed: ${message}`;
        lastStatus = 502;
      }

      if (attempt === MAX_REQUEST_ATTEMPTS - 1) break;
      await delay(RETRY_BACKOFF_MS * (attempt + 1));
    }

    return NextResponse.json({ error: lastErrorMessage }, { status: lastStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
