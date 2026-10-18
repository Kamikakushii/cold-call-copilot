"use client";

import { useCallback, useEffect, useState } from "react";

const API_BASE = "https://cold-call-copilot-backend.onrender.com";

type Quote = { text: string; freq: string };

type StageDef = {
  number: number;
  name: string;
  description: string;
  options: string[];
  quotes?: Quote[];
};

const STAGES: StageDef[] = [
  {
    number: 1,
    name: "Opening",
    description: "Introduce yourself and confirm you are speaking to the right person.",
    options: ["Greeted & identified", "Wrong number", "Gatekeeper", "Call dropped"],
  },
  {
    number: 2,
    name: "Purpose",
    description: "Say, in one breath, exactly why you are calling and what it is about.",
    options: ["Asked what this is about", "Said go ahead", "Not interested", "Wrong person"],
    quotes: [
      { text: "“What is this regarding?”", freq: "≈1 in 3 calls" },
      { text: "“Yeah, tell me.” / “Go ahead.”", freq: "≈1 in 4 calls" },
      { text: "“I don’t think I’m the right person.”", freq: "≈1 in 5 calls" },
    ],
  },
  {
    number: 3,
    name: "Permission",
    description: "Ask for two minutes before you go any further with the conversation.",
    options: ["Gave permission", "Counter-question", "In a hurry", "Call back later"],
    quotes: [
      { text: "“Yeah, tell me, go ahead.”", freq: "≈1 in 3 calls" },
      { text: "“From where are you calling?”", freq: "≈1 in 4 calls" },
      {
        text: "“I’m driving right now — how much time will you take?”",
        freq: "≈1 in 10 calls",
      },
    ],
  },
  {
    number: 4,
    name: "Their business",
    description: "Learn how the company makes money and where it is growing.",
    options: ["Answered openly", "Shared some detail", "Guarded", "Redirected me"],
  },
  {
    number: 5,
    name: "Their need",
    description: "Find the real goal or gap the prospect is trying to close.",
    options: ["Shared a real need", "Said all is good", "Not sure", "No need"],
  },
  {
    number: 6,
    name: "Objection",
    description: "Handle the pushback calmly without losing the thread of the call.",
    options: ["Wrong person", "Send info instead", "Busy / call later", "Not interested"],
    quotes: [
      {
        text: "“I’m not the right person to talk about this.”",
        freq: "≈1 in 4 calls — the single most common objection",
      },
      {
        text: "“Send me an email — I’ll forward it to the relevant person.”",
        freq: "≈1 in 5 calls",
      },
      {
        text: "“I’m not interested at this point of time.”",
        freq: "≈1 in 7 calls",
      },
    ],
  },
  {
    number: 7,
    name: "Next step",
    description: "Agree one concrete move: a meeting, a report, or a callback.",
    options: ["Meeting booked", "Report agreed", "Follow-up call", "Nothing agreed"],
  },
  {
    number: 8,
    name: "Close",
    description: "Confirm the next step, thank them, and end the call politely.",
    options: ["Warm goodbye", "Polite close", "Neutral", "Hung up"],
  },
];

type Call = {
  id: string;
  prospect_name: string;
  company: string;
  outcome: string | null;
  created_at: string;
  final_stage?: number | null;
};

function stageName(number: number | null | undefined): string {
  if (!number) return "No stages logged";
  const stage = STAGES.find((s) => s.number === number);
  return stage ? stage.name : `Stage ${number}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? (body as { detail: unknown }).detail
        : null;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
  }
  return body as T;
}

export default function Home() {
  const [phase, setPhase] = useState<"setup" | "active">("setup");
  const [prospectName, setProspectName] = useState("");
  const [company, setCompany] = useState("");
  const [callId, setCallId] = useState<string | null>(null);
  const [stage, setStage] = useState(1);
  const [tapped, setTapped] = useState<string | null>(null);
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [calls, setCalls] = useState<Call[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [callsError, setCallsError] = useState<string | null>(null);

  const loadCalls = useCallback(async () => {
    setCallsLoading(true);
    setCallsError(null);
    try {
      setCalls(await api<Call[]>("/calls"));
    } catch (err) {
      setCallsError(errorMessage(err));
    } finally {
      setCallsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api<Call[]>("/calls")
      .then((data) => {
        if (active) setCalls(data);
      })
      .catch((err: unknown) => {
        if (active) setCallsError(errorMessage(err));
      })
      .finally(() => {
        if (active) setCallsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (phase !== "active") return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const currentStage = STAGES[stage - 1];
  const upcomingStage = stage < 8 ? STAGES[stage] : null;
  const timerText = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(
    elapsed % 60,
  ).padStart(2, "0")}`;

  async function startCall(event: React.FormEvent) {
    event.preventDefault();
    if (!prospectName.trim() || !company.trim()) {
      setError("Enter a prospect name and company to start.");
      return;
    }
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const call = await api<Call>("/calls", {
        method: "POST",
        body: JSON.stringify({
          prospect_name: prospectName.trim(),
          company: company.trim(),
        }),
      });
      setCallId(call.id);
      setStage(1);
      setTapped(null);
      setWords("");
      setElapsed(0);
      setPhase("active");
      void loadCalls();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function nextStage() {
    if (!callId) return;
    if (!tapped) {
      setError("Tap what happened before moving to the next stage.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/calls/${callId}/stages`, {
        method: "POST",
        body: JSON.stringify({
          stage_number: stage,
          button_tapped: tapped,
          prospect_words: words.trim(),
        }),
      });
      setTapped(null);
      setWords("");
      setStage((value) => Math.min(value + 1, 8));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function endCall() {
    if (!callId) return;
    setBusy(true);
    setError(null);
    try {
      const call = await api<Call>(`/calls/${callId}`, { method: "PUT" });
      setSummary(call.outcome ?? "Call closed.");
      setPhase("setup");
      setCallId(null);
      setStage(1);
      setTapped(null);
      setWords("");
      setProspectName("");
      setCompany("");
      setElapsed(0);
      void loadCalls();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-screen grid-cols-1 gap-6 bg-white p-6 md:grid-cols-2">
      <section className="flex flex-col gap-6 overflow-y-auto rounded-xl border-2 border-gray-900 bg-white p-8 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.3)]">
        <header className="flex items-center justify-between border-b border-gray-200 pb-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">
            Company · Call Guide
          </span>
          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 font-mono text-xs text-gray-600 transition-all duration-200">
            {timerText}
          </span>
        </header>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {phase === "setup" && (
          <div className="flex flex-col gap-6">
            {summary && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">
                  Gemini call summary
                </p>
                <p className="mt-2 text-sm leading-relaxed text-gray-800">{summary}</p>
              </div>
            )}

            <form onSubmit={startCall} className="flex flex-col gap-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">
                  New call
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Enter the prospect details to open the call guide.
                </p>
              </div>
              <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                Prospect name
                <input
                  value={prospectName}
                  onChange={(event) => setProspectName(event.target.value)}
                  placeholder="e.g. Dev ji"
                  className="rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-800 outline-none transition-all duration-200 focus:border-blue-600 focus:ring-0"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                Company
                <input
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="e.g. Kalpana Chem Supplies"
                  className="rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-800 outline-none transition-all duration-200 focus:border-blue-600 focus:ring-0"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "Starting…" : "Start Call"}
              </button>
            </form>
          </div>
        )}

        {phase === "active" && currentStage && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-lg font-bold text-gray-900">{prospectName || "Prospect"}</p>
              <p className="text-sm text-gray-500">{company}</p>
            </div>

            <div className="flex gap-2">
              {STAGES.map((item) => (
                <span
                  key={item.number}
                  title={`Stage ${item.number}: ${item.name}`}
                  className={`flex h-8 w-8 items-center justify-center rounded border text-xs font-semibold transition-all duration-200 ${
                    item.number === stage
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-300 bg-white text-gray-500"
                  }`}
                >
                  {item.number}
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                Stage {currentStage.number} of 8
              </p>
              <h2 className="text-2xl font-bold text-gray-900">{currentStage.name}</h2>
              <p className="text-sm leading-relaxed text-gray-500">
                {currentStage.description}
              </p>
            </div>

            {currentStage.quotes && (
              <div className="flex flex-col gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                  She may say
                </p>
                <div className="flex flex-col gap-2">
                  {currentStage.quotes.map((quote) => (
                    <div
                      key={quote.text}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 transition-all duration-200 hover:border-gray-300"
                    >
                      {quote.text}{" "}
                      <span className="text-xs text-gray-400">({quote.freq})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                What happened
              </p>
              <div className="grid grid-cols-2 gap-3">
                {currentStage.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTapped(option)}
                    className={`rounded-lg border px-4 py-3 text-sm font-medium transition-all duration-200 ${
                      tapped === option
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-300 bg-white text-gray-800 hover:border-gray-400 hover:bg-gray-50"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                Her words
              </span>
              <textarea
                value={words}
                onChange={(event) => setWords(event.target.value)}
                rows={4}
                placeholder="Type what the prospect actually said…"
                className="rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-800 outline-none transition-all duration-200 placeholder:text-gray-400 focus:border-blue-600 focus:ring-0"
              />
            </label>

            <div className="flex gap-3 border-t border-gray-200 pt-5">
              <button
                type="button"
                onClick={nextStage}
                disabled={busy}
                className="flex-1 rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-gray-900 disabled:opacity-50"
              >
                {busy
                  ? "Saving…"
                  : upcomingStage
                    ? `Next: ${upcomingStage.name}`
                    : "Log Stage 8"}
              </button>
              <button
                type="button"
                onClick={endCall}
                disabled={busy}
                className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-all duration-200 hover:bg-gray-50 disabled:opacity-50"
              >
                End Call
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-6 overflow-y-auto rounded-xl border border-gray-200 bg-white p-8">
        <header className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">
            The second screen: Past Calls
          </span>
          <button
            type="button"
            onClick={() => void loadCalls()}
            disabled={callsLoading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 disabled:opacity-50"
          >
            {callsLoading ? "Loading…" : "Refresh"}
          </button>
        </header>

        <div className="flex flex-col gap-2">
          <p className="text-lg font-bold text-gray-900">
            {calls.length === 0
              ? "No calls yet"
              : `${calls.length} call${calls.length === 1 ? "" : "s"} logged`}
          </p>
          <p className="text-sm text-gray-500">
            Each entry shows the stage the call reached and the Gemini summary.
          </p>
        </div>

        {callsError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {callsError}
          </p>
        )}

        {!callsLoading && !callsError && calls.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
            Past calls will appear here with their final stage and the Gemini summary.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {calls.map((call) => (
            <li
              key={call.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-all duration-200 hover:border-gray-300 hover:shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-bold text-gray-900">{call.prospect_name}</p>
                <p className="text-sm text-gray-500">{call.company}</p>
                {call.outcome && (
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {call.outcome}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-right text-xs font-semibold text-blue-600">
                {call.final_stage
                  ? `Stage ${call.final_stage} · ${stageName(call.final_stage)}`
                  : "No stages"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
