import { useEffect, useState } from "react";
import { request } from "./api.js";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = mode === "signup" ? form : { email: form.email, password: form.password };
      const result = await request(`/user/${mode}`, { method: "POST", body: JSON.stringify(body) });
      onAuthenticated(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-layout">
      <section className="brand-panel">
        <span className="eyebrow">ORBIT ARENA / 01</span>
        <h1>Train your<br /><em>next move.</em></h1>
        <p>A sharp AI clubhouse for strategy, creation, and getting the edge on your next challenge.</p>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <div className="card-heading">
          <span className="eyebrow">{mode === "login" ? "BACK IN THE ARENA" : "JOIN THE ROSTER"}</span>
          <h2>{mode === "login" ? "Sign in to your workspace" : "Create your workspace"}</h2>
        </div>
        {mode === "signup" && <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />}
        <input type="email" placeholder="Email address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        {error && <p className="error">{error}</p>}
        <button className="primary-button" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"} <span>→</span></button>
        <button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadChats = async () => {
    const result = await request("/chat/getRecentChat");
    setChats(result.chats || []);
  };

  useEffect(() => {
    request("/user/profile")
      .then((profile) => {
        setUser(profile);
        return loadChats();
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const selectChat = async (chat) => {
    setActiveChat(chat);
    setError("");
    try {
      const result = await request(`/msg/${chat._id}`);
      setMessages(result.msg || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const newChat = async () => {
    setError("");
    try {
      const result = await request("/chat/createChat", { method: "POST", body: JSON.stringify({ model: DEFAULT_MODEL }) });
      const chat = { _id: result.chatId, topic: result.topic };
      setChats((current) => [chat, ...current]);
      setActiveChat(chat);
      setMessages([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError("");
    const content = draft.trim();
    setDraft("");
    try {
      const result = await request(activeChat ? `/msg/${activeChat._id}` : "/msg", {
        method: "POST",
        body: JSON.stringify({ content, model: DEFAULT_MODEL }),
      });
      setMessages((current) => [
        ...current,
        { role: "user", content },
        { role: "assistant", content: result.reply },
      ]);
      if (!activeChat) {
        await loadChats();
      }
    } catch (err) {
      setError(err.message);
      setDraft(content);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    try {
      await request("/user/logout", { method: "POST" });
      setUser(null);
      setActiveChat(null);
      setMessages([]);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <main className="loading-screen">Loading your arena...</main>;
  if (!user) return <AuthScreen onAuthenticated={(result) => setUser(result)} />;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="logo"><span>✦</span> orbit <b>arena</b></div>
        <button className="new-chat" onClick={newChat}>＋ Start a session</button>
        <p className="sidebar-label">MATCH HISTORY</p>
        <div className="chat-list">
          {chats.map((chat) => <button className={`chat-link ${activeChat?._id === chat._id ? "selected" : ""}`} key={chat._id} onClick={() => selectChat(chat)}>{chat.topic || "New conversation"}</button>)}
        </div>
        <div className="account">
          <div className="avatar">{user.name?.[0]?.toUpperCase() || "U"}</div>
          <div><strong>{user.name}</strong><small>{user.email}</small></div>
          <button className="logout" onClick={logout}>↪</button>
        </div>
      </aside>
      <section className="conversation">
        <header className="topbar"><span><i className="live-mark" />{activeChat?.topic || "Warm-up session"}</span><span className="status-dot">● SYSTEM ONLINE</span></header>
        <div className="message-area">
          {!messages.length && <div className="empty-state"><span className="spark">✦</span><p className="eyebrow">READY WHEN YOU ARE</p><h1>What’s the play?</h1><p>Ask for a game plan, break down a problem, or explore a new idea.</p></div>}
          {messages.map((message, index) => <article className={`message ${message.role}`} key={message._id || index}><div className="message-label">{message.role === "assistant" ? "ORBIT / COACH" : "YOU / PLAYER"}</div><p>{message.content}</p></article>)}
          {busy && <div className="typing">ORBIT IS DRAWING UP THE PLAY<span>...</span></div>}
        </div>
        <div className="composer-wrap">
          {error && <p className="error composer-error">{error}</p>}
          <form className="composer" onSubmit={sendMessage}><textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message Orbit..." rows="1" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }} /><button disabled={busy || !draft.trim()}>↑</button></form>
          <small>AI is a co-pilot, not a referee. Check important calls.</small>
        </div>
      </section>
    </main>
  );
}

export default App;
