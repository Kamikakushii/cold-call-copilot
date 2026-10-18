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
    <div className="grid h-screen grid-cols-1 md:grid-cols-2">
      <section className="flex flex-col overflow-y-auto border-r border-zinc-300 bg-white p-6">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Active Call</h1>
          <p className="text-sm text-zinc-500">
            {phase === "setup"
              ? "Set up the prospect, then work the eight stages."
              : `Stage ${stage} of 8 · ${currentStage.name}`}
          </p>
        </header>

        {error && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {phase === "setup" && (
          <div className="flex flex-col gap-4">
            {summary && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Gemini call summary
                </p>
                <p className="mt-1 text-sm text-emerald-950">{summary}</p>
              </div>
            )}

            <form onSubmit={startCall} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Prospect name
                <input
                  value={prospectName}
                  onChange={(event) => setProspectName(event.target.value)}
                  placeholder="e.g. Dev ji"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Company
                <input
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="e.g. Kalpana Chem Supplies"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="mt-1 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
              >
                {busy ? "Starting…" : "Start Call"}
              </button>
            </form>
          </div>
        )}

        {phase === "active" && currentStage && (
          <div className="flex flex-col gap-5">
            <div className="flex gap-1">
              {STAGES.map((item) => (
                <div
                  key={item.number}
                  title={`Stage ${item.number}: ${item.name}`}
                  className={`h-2 flex-1 rounded-full ${
                    item.number < stage
                      ? "bg-emerald-500"
                      : item.number === stage
                        ? "bg-emerald-800"
                        : "bg-zinc-200"
                  }`}
                />
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Stage {currentStage.number} · {currentStage.name}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                Tap what happened, then capture the prospect&apos;s exact words.
              </p>
            </div>

            {currentStage.quotes && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  What prospects say here
                </p>
                <ul className="mt-2 space-y-2">
                  {currentStage.quotes.map((quote) => (
                    <li key={quote.text} className="text-sm text-zinc-800">
                      {quote.text}{" "}
                      <span className="text-xs text-amber-800">({quote.freq})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-medium">What happened?</p>
              <div className="grid grid-cols-2 gap-2">
                {currentStage.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTapped(option)}
                    className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      tapped === option
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1 text-sm font-medium">
              Prospect&apos;s exact words
              <textarea
                value={words}
                onChange={(event) => setWords(event.target.value)}
                rows={4}
                placeholder="Type what the prospect actually said…"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-600"
              />
            </label>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={nextStage}
                disabled={busy}
                className="flex-1 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
              >
                {busy ? "Saving…" : stage === 8 ? "Log Stage 8" : "Next Stage →"}
              </button>
              <button
                type="button"
                onClick={endCall}
                disabled={busy}
                className="flex-1 rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                End Call
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col overflow-y-auto bg-zinc-50 p-6">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Past Calls</h2>
            <p className="text-sm text-zinc-500">
              {calls.length === 0 ? "No calls yet" : `${calls.length} call${calls.length === 1 ? "" : "s"} logged`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadCalls()}
            disabled={callsLoading}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50"
          >
            {callsLoading ? "Loading…" : "Refresh"}
          </button>
        </header>

        {callsError && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {callsError}
          </p>
        )}

        {!callsLoading && !callsError && calls.length === 0 && (
          <p className="text-sm text-zinc-500">
            Past calls will appear here with their final stage and the Gemini summary.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {calls.map((call) => (
            <li
              key={call.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold text-zinc-900">{call.prospect_name}</p>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                  {call.final_stage
                    ? `Stage ${call.final_stage} · ${stageName(call.final_stage)}`
                    : "No stages"}
                </span>
              </div>
              <p className="text-sm text-zinc-500">{call.company}</p>
              {call.outcome ? (
                <p className="mt-2 border-t border-zinc-100 pt-2 text-sm text-zinc-700">
                  {call.outcome}
                </p>
              ) : (
                <p className="mt-2 border-t border-zinc-100 pt-2 text-sm italic text-zinc-400">
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
