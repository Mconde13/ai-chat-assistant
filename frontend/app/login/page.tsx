"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleLogin() {
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.push("/owner");
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h1>Owner Login</h1>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        style={{ display: "block", width: "100%", padding: 8, marginBottom: 8, border: "1px solid #ccc", borderRadius: 4 }}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        style={{ display: "block", width: "100%", padding: 8, marginBottom: 8, border: "1px solid #ccc", borderRadius: 4 }}
      />
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button
        onClick={handleLogin}
        style={{ padding: "8px 16px", background: "#0070f3", color: "white", border: "none", borderRadius: 4 }}
      >
        Log In
      </button>
    </div>
  );
}