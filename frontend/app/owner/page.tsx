"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type OwnerMessage = {
  id: number;
  customer_name: string;
  purpose: string;
  draft_text: string;
  status: string;
  created_at: string;
};

type Appointment = {
  customer_name: string;
  service: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function OwnerDashboard() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [messages, setMessages] = useState<OwnerMessage[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [loading, setLoading] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [scheduleError, setScheduleError] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.push("/login");
    } else {
      setCheckingAuth(false);
      loadMessages();
      loadSchedule();
    }
  }

  async function getAuthHeader() {
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token}` };
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function loadMessages() {
    const headers = await getAuthHeader();
    const res = await fetch(`${BACKEND_URL}/owner-messages`, { headers });
    if (res.status === 401 || res.status === 403) {
      await supabase.auth.signOut();
      router.push("/login");
      return;
    }
    if (!res.ok) return;
    setMessages(await res.json());
  }

  async function loadSchedule() {
    setScheduleError("");
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${BACKEND_URL}/schedule`, { headers });
      if (res.status === 401 || res.status === 403) {
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setScheduleError(data.detail || "Could not load today's schedule.");
        return;
      }
      setAppointments(data.appointments);
    } catch {
      setScheduleError("Could not load today's schedule.");
    }
  }

  async function generateSummary() {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${BACKEND_URL}/day-summary`, { headers });
      if (res.status === 401 || res.status === 403) {
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setSummaryError(data.detail || "Could not generate the summary.");
      } else {
        setSummary(data.summary);
      }
    } catch {
      setSummaryError("Could not generate the summary.");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function draftNewText() {
    if (!customerName || !purpose) return;
    setLoading(true);
    const headers = await getAuthHeader();
    await fetch(
      `${BACKEND_URL}/draft-text?customer_name=${encodeURIComponent(customerName)}&purpose=${encodeURIComponent(purpose)}`,
      { method: "POST", headers }
    );
    setCustomerName("");
    setPurpose("");
    await loadMessages();
    setLoading(false);
  }

  async function approveMessage(id: number) {
    const headers = await getAuthHeader();
    await fetch(`${BACKEND_URL}/owner-messages/${id}/approve`, { method: "POST", headers });
    await loadMessages();
  }

  if (checkingAuth) {
    return <div style={{ textAlign: "center", marginTop: 80 }}>Checking login...</div>;
  }

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Owner Dashboard</h1>
        <button onClick={handleLogout} style={{ padding: "6px 12px", background: "#eee", border: "1px solid #ccc", borderRadius: 4 }}>
          Log Out
        </button>
      </div>

      <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Today&apos;s schedule</h3>
          <button
            onClick={generateSummary}
            disabled={summaryLoading}
            style={{ padding: "6px 12px", background: "#0070f3", color: "white", border: "none", borderRadius: 4 }}
          >
            {summaryLoading ? "Summarizing..." : "Summarize my day"}
          </button>
        </div>
        {summary && <p style={{ background: "#f5f5f5", borderRadius: 4, padding: 12 }}>{summary}</p>}
        {summaryError && <p style={{ color: "red" }}>{summaryError}</p>}
        {scheduleError && <p style={{ color: "red" }}>{scheduleError}</p>}
        {!scheduleError && appointments.length === 0 && <p>No appointments today.</p>}
        {appointments.map((appt, i) => (
          <div key={i} style={{ padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid #eee" }}>
            <strong>{formatTime(appt.start_time)} – {formatTime(appt.end_time)}</strong>{" "}
            {appt.customer_name} · {appt.service}
          </div>
        ))}
      </div>

      <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h3>Draft a new text</h3>
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Customer name"
          style={{ display: "block", width: "100%", padding: 8, marginBottom: 8, border: "1px solid #ccc", borderRadius: 4 }}
        />
        <input
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="Purpose (e.g. appointment reminder for 2pm)"
          style={{ display: "block", width: "100%", padding: 8, marginBottom: 8, border: "1px solid #ccc", borderRadius: 4 }}
        />
        <button
          onClick={draftNewText}
          disabled={loading}
          style={{ padding: "8px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 4 }}
        >
          {loading ? "Drafting..." : "Draft Text"}
        </button>
      </div>

      <h3>Messages</h3>
      {messages.map((msg) => (
        <div key={msg.id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div><strong>{msg.customer_name}</strong> — {msg.purpose}</div>
          <p>{msg.draft_text}</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{
              padding: "2px 8px",
              borderRadius: 4,
              background: msg.status === "approved" ? "#d4f4dd" : "#fff3cd",
              fontSize: 12
            }}>
              {msg.status}
            </span>
            {msg.status === "pending_approval" && (
              <button
                onClick={() => approveMessage(msg.id)}
                style={{ padding: "4px 12px", background: "#28a745", color: "white", border: "none", borderRadius: 4 }}
              >
                Approve
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}