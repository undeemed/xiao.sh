import { Suspense } from "react";
import ChatClient from "./chat-client";

function ChatFallback() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-10 md:px-8 md:py-12">
      <section className="border border-[var(--line)] bg-[var(--panel)] p-4 md:p-6">
        <p className="text-sm text-[var(--muted)]">Loading chat...</p>
      </section>
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatFallback />}>
      <ChatClient />
    </Suspense>
  );
}

