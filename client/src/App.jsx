import { useEffect, useRef, useState } from "react";
import { request, streamRequest } from "./api.js";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

function renderInline(text) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <span key={index}>{part}</span>;
  });
}

function StructuredMessage({ content }) {
  const lines = content.split("\n");
  const blocks = [];
  let paragraph = [];
  let list = [];
  let listType = null;
  let code = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(<p key={`p-${blocks.length}`}>{renderInline(paragraph.join(" "))}</p>);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (!list.length) return;
    const List = listType === "ordered" ? "ol" : "ul";
    blocks.push(<List key={`list-${blocks.length}`}>{list.map((item, index) => <li key={index}>{renderInline(item)}</li>)}</List>);
    list = [];
    listType = null;
  };

  lines.forEach((line, index) => {
    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      if (code === null) {
        code = [];
      } else {
        blocks.push(<pre key={`code-${index}`}><code>{code.join("\n")}</code></pre>);
        code = null;
      }
      return;
    }
    if (code !== null) {
      code.push(line);
      return;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const Heading = `h${heading[1].length}`;
      blocks.push(<Heading key={`h-${index}`}>{renderInline(heading[2])}</Heading>);
    } else if (bullet || numbered) {
      flushParagraph();
      const nextType = numbered ? "ordered" : "unordered";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      list.push((bullet || numbered)[1]);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  });

  if (code !== null) blocks.push(<pre key="code-final"><code>{code.join("\n")}</code></pre>);
  flushParagraph();
  flushList();
  return <div className="structured-message">{blocks}</div>;
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", age: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = mode === "signup"
        ? { ...form, age: form.age ? Number(form.age) : undefined }
        : { email: form.email, password: form.password };
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
        <div className="brand-kicker"><span className="brand-mark">✦</span> ORBIT ARENA <span>AI WORKSPACE</span></div>
        <div className="brand-copy">
          <p className="eyebrow">YOUR SECOND BRAIN, SHARPENED</p>
          <h1>Make your<br /><em>next move.</em></h1>
          <p className="brand-description">A focused AI workspace for strategy, creation, and getting the edge on whatever comes next.</p>
        </div>
        <div className="brand-stats"><span><b>01</b> PRIVATE WORKSPACE</span><span><b>24/7</b> CREATIVE SPARRING</span></div>
      </section>
      <section className="auth-side">
        <div className="auth-card">
          <div className="auth-topline"><span className="eyebrow">{mode === "login" ? "WELCOME BACK" : "NEW TO ORBIT"}</span><span className="auth-step">0{mode === "login" ? "1" : "2"} / 02</span></div>
          <h2>{mode === "login" ? "Sign in to your workspace" : "Create your workspace"}</h2>
          <p className="auth-subtitle">{mode === "login" ? "Pick up exactly where you left off." : "A clear space for your clearest thinking."}</p>
          <form onSubmit={submit} className="auth-form">
            {mode === "signup" && <div className="field-row"><label>Full name<input autoComplete="name" placeholder="Ada Lovelace" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Age <span>(optional)</span><input type="number" min="10" max="100" placeholder="28" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></label></div>}
            <label>Email address<input autoComplete="email" type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label>Password<input autoComplete={mode === "login" ? "current-password" : "new-password"} type="password" placeholder="At least 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
            {error && <p className="error auth-error">{error}</p>}
            <button className="primary-button" disabled={busy}>{busy ? "Opening workspace..." : mode === "login" ? "Enter workspace" : "Create workspace"} <span>↗</span></button>
          </form>
          <button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>{mode === "login" ? "New here? Create an account →" : "Already have an account? Sign in →"}</button>
          <p className="privacy-note">By continuing, you agree to keep your workspace private and use AI responsibly.</p>
        </div>
      </section>
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
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const composerRef = useRef(null);

  const loadChats = async () => {
    const result = await request("/chat/getRecentChat?limit=50");
    setChats(result.chats || []);
  };

  useEffect(() => {
    request("/user/profile").then((profile) => {
      setUser(profile);
      return loadChats();
    }).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    composerRef.current?.focus();
  }, [activeChat]);

  const selectChat = async (chat) => {
    setActiveChat(chat);
    setSidebarOpen(false);
    setError("");
    try {
      const result = await request(`/msg/${chat._id}?limit=100`);
      setMessages(result.msg || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const newChat = async () => {
    setError("");
    try {
      const result = await request("/chat/createChat", { method: "POST", body: JSON.stringify({ model: DEFAULT_MODEL }) });
      const chat = { _id: result.chatId, topic: result.topic, model: DEFAULT_MODEL };
      setChats((current) => [chat, ...current]);
      setActiveChat(chat);
      setMessages([]);
      setSidebarOpen(false);
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
    const assistantId = `stream-${Date.now()}`;
    setMessages((current) => [...current, { role: "user", content }, { _id: assistantId, role: "assistant", content: "" }]);
    try {
      await streamRequest(activeChat ? `/msg/${activeChat._id}/stream` : "/msg/stream", { content, model: DEFAULT_MODEL }, (eventName, data) => {
        if (eventName === "token") {
          setMessages((current) => current.map((message) => message._id === assistantId ? { ...message, content: message.content + data.content } : message));
        }
        if (eventName === "done" && !activeChat) {
          setActiveChat({ _id: data.chatId, topic: content.slice(0, 40), model: DEFAULT_MODEL });
          loadChats();
        }
        if (eventName === "error") throw new Error(data.message);
      });
    } catch (err) {
      setMessages((current) => current.filter((message) => message._id !== assistantId));
      setError(err.message);
      setDraft(content);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    try {
      await request("/user/logout", { method: "POST" });
      setUser(null); setActiveChat(null); setMessages([]);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <main className="loading-screen"><span className="brand-mark">✦</span><p>Preparing your workspace...</p></main>;
  if (!user) return <AuthScreen onAuthenticated={(result) => setUser(result)} />;

  return (
    <main className="app-shell">
      {sidebarOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="logo"><span className="brand-mark">✦</span> orbit <b>arena</b></div>
        <button className="new-chat" onClick={newChat}><span>＋</span> New session <kbd>⌘ K</kbd></button>
        <div className="sidebar-heading"><span>RECENT SESSIONS</span><span>{chats.length}</span></div>
        <div className="chat-list">
          {chats.length ? chats.map((chat) => <button className={`chat-link ${activeChat?._id === chat._id ? "selected" : ""}`} key={chat._id} onClick={() => selectChat(chat)}><span className="chat-icon">◌</span><span>{chat.topic || "New conversation"}</span></button>) : <p className="sidebar-empty">Your sessions will appear here.</p>}
        </div>
        <div className="sidebar-bottom"><div className="account"><div className="avatar">{user.name?.[0]?.toUpperCase() || "U"}</div><div><strong>{user.name}</strong><small>{user.email}</small></div></div><button className="logout" onClick={logout}>Sign out <span>↗</span></button></div>
      </aside>
      <section className="conversation">
        <header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(true)}>☰</button><div className="session-title"><i className="live-mark" /><span>{activeChat?.topic || "New session"}</span></div><div className="status-dot"><i /> SYSTEM ONLINE</div></header>
        <div className="message-area">
          {!messages.length && <div className="empty-state"><span className="spark">✦</span><p className="eyebrow">READY WHEN YOU ARE</p><h1>What’s the play?</h1><p>Ask for a game plan, break down a problem, or explore a new idea.</p><div className="prompt-grid"><button onClick={() => setDraft("Help me map out a focused plan for this week.")}>Plan my week <span>↗</span></button><button onClick={() => setDraft("Help me think through a difficult decision.")}>Think it through <span>↗</span></button></div></div>}
          {messages.map((message, index) => <article className={`message ${message.role}`} key={message._id || index}><div className="message-label"><span className={message.role === "assistant" ? "coach-dot" : "player-dot"} />{message.role === "assistant" ? "ORBIT / COACH" : "YOU / PLAYER"}</div>{message.role === "assistant" ? <StructuredMessage content={message.content} /> : <p>{message.content}</p>}{busy && message._id?.startsWith("stream-") && <span className="cursor">▋</span>}</article>)}
        </div>
        <div className="composer-wrap">
          {error && <p className="error composer-error">{error}</p>}
          <form className="composer" onSubmit={sendMessage}><textarea ref={composerRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask Orbit anything..." rows="1" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }} /><button aria-label="Send message" disabled={busy || !draft.trim()}>↑</button></form>
          <div className="composer-meta"><span><i /> Orbit can make mistakes. Check important calls.</span><span>↵ send &nbsp; ⇧↵ new line</span></div>
        </div>
      </section>
    </main>
  );
}

export default App;
