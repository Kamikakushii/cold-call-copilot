"use client";

import { useCallback, useEffect, useState } from "react";

const API_BASE = "http://localhost:8000";

type Quote = { text: string; freq: string };

type StageDef = {
  number: number;
  name: string;
  options: string[];
  quotes?: Quote[];
};

const STAGES: StageDef[] = [
  {
    number: 1,
    name: "Opening",
    options: ["Greeted & identified", "Wrong number", "Gatekeeper", "Call dropped"],
  },
  {
    number: 2,
    name: "Purpose",
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
    options: ["Answered openly", "Shared some detail", "Guarded", "Redirected me"],
  },
  {
    number: 5,
    name: "Their need",
    options: ["Shared a real need", "Said all is good", "Not sure", "No need"],
  },
  {
    number: 6,
    name: "Objection",
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
    options: ["Meeting booked", "Report agreed", "Follow-up call", "Nothing agreed"],
  },
  {
    number: 8,
    name: "Close",
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

const PANE =
  "flex flex-col gap-8 overflow-y-auto rounded-2xl border border-zinc-800/50 bg-zinc-900/40 p-8 shadow-2xl backdrop-blur-md";
const FIELD =
  "w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-100 transition-all duration-300 ease-in-out outline-none placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-0";
const PRIMARY =
  "rounded-xl bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition-all duration-300 ease-in-out hover:bg-white disabled:opacity-50";
const OUTLINE =
  "rounded-xl border border-zinc-800 text-zinc-400 transition-all duration-300 ease-in-out hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-50";
const LABEL = "flex flex-col gap-2 text-sm font-medium text-zinc-400";

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

  const currentStage = STAGES[stage - 1];

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
      void loadCalls();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-screen grid-cols-1 gap-8 bg-zinc-950 p-8 md:grid-cols-2">
      <section className={PANE}>
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Active Call</h1>
          <p className="text-sm text-zinc-400">
            {phase === "setup"
              ? "Set up the prospect, then work the eight stages."
              : `Stage ${stage} of 8 · ${currentStage.name}`}
          </p>
        </header>

        {error && (
          <p className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-300 transition-all duration-300 ease-in-out">
            {error}
          </p>
        )}

        {phase === "setup" && (
          <div className="flex flex-col gap-8">
            {summary && (
              <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/60 p-5 transition-all duration-300 ease-in-out">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  Gemini call summary
                </p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-100">{summary}</p>
              </div>
            )}

            <form onSubmit={startCall} className="flex flex-col gap-6">
              <label className={LABEL}>
                Prospect name
                <input
                  value={prospectName}
                  onChange={(event) => setProspectName(event.target.value)}
                  placeholder="e.g. Dev ji"
                  className={FIELD}
                />
              </label>
              <label className={LABEL}>
                Company
                <input
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="e.g. Kalpana Chem Supplies"
                  className={FIELD}
                />
              </label>
              <button type="submit" disabled={busy} className={PRIMARY}>
                {busy ? "Starting…" : "Start Call"}
              </button>
            </form>
          </div>
        )}

        {phase === "active" && currentStage && (
          <div className="flex flex-col gap-8">
            <div className="flex items-center gap-2">
              {STAGES.map((item) => (
                <span
                  key={item.number}
                  title={`Stage ${item.number}: ${item.name}`}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-all duration-300 ease-in-out ${
                    item.number < stage
                      ? "bg-zinc-100 text-zinc-950"
                      : item.number === stage
                        ? "bg-zinc-100/10 text-zinc-50 ring-1 ring-zinc-100"
                        : "bg-zinc-800/60 text-zinc-500"
                  }`}
                >
                  {item.number}
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Stage {currentStage.number} · {currentStage.name}
              </p>
              <p className="text-sm text-zinc-400">
                Tap what happened, then capture the prospect&apos;s exact words.
              </p>
            </div>

            {currentStage.quotes && (
              <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/60 p-5 transition-all duration-300 ease-in-out">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  What prospects say here
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {currentStage.quotes.map((quote) => (
                    <li
                      key={quote.text}
                      className="flex flex-col gap-0.5 text-sm text-zinc-100"
                    >
                      {quote.text}
                      <span className="text-xs text-zinc-500">{quote.freq}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-zinc-400">What happened?</p>
              <div className="grid grid-cols-2 gap-3">
                {currentStage.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTapped(option)}
                    className={
                      tapped === option
                        ? "rounded-xl border border-zinc-100 bg-zinc-100 px-4 py-3 text-left text-sm font-medium text-zinc-950 transition-all duration-300 ease-in-out hover:bg-white"
                        : `${OUTLINE} px-4 py-3 text-left text-sm`
                    }
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <label className={LABEL}>
              Prospect&apos;s exact words
              <textarea
                value={words}
                onChange={(event) => setWords(event.target.value)}
                rows={4}
                placeholder="Type what the prospect actually said…"
                className={FIELD}
              />
            </label>

            <div className="flex gap-4">
              <button type="button" onClick={nextStage} disabled={busy} className={`${PRIMARY} flex-1`}>
                {busy ? "Saving…" : stage === 8 ? "Log Stage 8" : "Next Stage →"}
              </button>
              <button type="button" onClick={endCall} disabled={busy} className={`${PRIMARY} flex-1`}>
                End Call
              </button>
            </div>
          </div>
        )}
      </section>

      <section className={PANE}>
        <header className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-50">Past Calls</h2>
            <p className="text-sm text-zinc-400">
              {calls.length === 0
                ? "No calls yet"
                : `${calls.length} call${calls.length === 1 ? "" : "s"} logged`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadCalls()}
            disabled={callsLoading}
            className={`${OUTLINE} px-4 py-2 text-sm`}
          >
            {callsLoading ? "Loading…" : "Refresh"}
          </button>
        </header>

        {callsError && (
          <p className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-300 transition-all duration-300 ease-in-out">
            {callsError}
          </p>
        )}

        {!callsLoading && !callsError && calls.length === 0 && (
          <p className="text-sm text-zinc-500">
            Past calls will appear here with their final stage and the Gemini summary.
          </p>
        )}

        <ul className="flex flex-col gap-4">
          {calls.map((call) => (
            <li
              key={call.id}
              className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5 transition-all duration-300 ease-in-out hover:border-zinc-700/60 hover:bg-zinc-900/60"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold text-zinc-50">{call.prospect_name}</p>
                <span className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs font-medium text-zinc-300 transition-all duration-300 ease-in-out">
                  {call.final_stage
                    ? `Stage ${call.final_stage} · ${stageName(call.final_stage)}`
                    : "No stages"}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-400">{call.company}</p>
              {call.outcome ? (
                <p className="mt-3 border-t border-zinc-800/70 pt-3 text-sm leading-relaxed text-zinc-300">
                  {call.outcome}
                </p>
              ) : (
                <p className="mt-3 border-t border-zinc-800/70 pt-3 text-sm italic text-zinc-500">
                  No summary yet
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
