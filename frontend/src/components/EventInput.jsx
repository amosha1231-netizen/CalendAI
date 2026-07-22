import { useState } from "react";
import { Loader2, Send } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function EventInput({ onAddEvents }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/parse-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      if (!res.ok) throw new Error("Failed to parse schedule");

      const data = await res.json();
      if (Array.isArray(data.events) && data.events.length > 0) {
        onAddEvents(data.events);
        setText("");
      } else {
        setError("No events were found in that text.");
      }
    } catch (err) {
      console.error(err);
      setError("Unable to process your request right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder='Example: "On Thursday I have a meeting from 8:00 to 9:00"'
        disabled={loading}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading || !text.trim()}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Parse schedule
      </button>
    </form>
  );
}
