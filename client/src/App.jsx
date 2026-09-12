import { useEffect, useRef, useState } from "react";
import { request, streamRequest } from "./api.js";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

function Icon({ name, size = 18 }) {
  const icons = {
    arrow: <><path d="M5 12h13M13 6l6 6-6 6" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    send: <><path d="m21 3-7.5 18-3.8-7.7L2 9.5 21 3Z" /><path d="M9.8 13.3 21 3" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.5V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.5h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V5h2.5v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2.5h-.2a1.7 1.7 0 0 0-1.6 1Z" /></>,
    spark: <><path d="m12 3 1.5 6.5L20 12l-6.5 1.5L12 20l-1.5-6.5L4 12l6.5-2.5L12 3Z" /></>,
    pin: <path d="m15 4 5 5-2.5 2.5v4L14 19l-2-2-3 3-.9-.9 3-3-2-2 3.5-3.5h4L19 8l-4-4Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    moon: <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
}

function renderInline(text) {
  const parts = text.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      try {
        const url = new URL(link[2]);
        if (url.protocol === "http:" || url.protocol === "https:") {
          return <a key={index} href={url.href} target="_blank" rel="noreferrer">{link[1]}</a>;
        }
      } catch {
        // Keep malformed links as plain text.
      }
    }
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    return <span key={index}>{part}</span>;
  });
}

function StructuredMessage({ content }) {
  const blocks = [];
  const paragraph = [];
  const list = [];
  let listType = null;
  let code = null;
  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(<p key={`p-${blocks.length}`}>{renderInline(paragraph.join(" "))}</p>);
      paragraph.length = 0;
    }
  };
  const flushList = () => {
    if (!list.length) return;
    const List = listType === "ordered" ? "ol" : "ul";
    blocks.push(<List key={`list-${blocks.length}`}>{list.map((item, index) => <li key={index}>{renderInline(item)}</li>)}</List>);
    list.length = 0;
    listType = null;
  };

  content.split("\n").forEach((line, index) => {
    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      if (code === null) code = [];
      else {
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
      onAuthenticated(await request(`/user/${mode}`, { method: "POST", body: JSON.stringify(body) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-layout">
      <section className="brand-panel">
        <div className="brand-kicker"><span className="brand-symbol"><Icon name="spark" size={17} /></span> ORBIT AI <span>INTELLIGENT WORKSPACE</span></div>
        <div className="brand-copy">
          <p className="eyebrow">THINK CLEARLY. CREATE FREELY.</p>
          <h1>Your ideas,<br /><em>in orbit.</em></h1>
          <p className="brand-description">A calm, intelligent space to explore questions, shape ideas, and turn conversations into momentum.</p>
        </div>
        <div className="brand-stats"><span><b>01</b> PRIVATE BY DESIGN</span><span><b>∞</b> ROOM TO EXPLORE</span></div>
      </section>
      <section className="auth-side">
        <div className="auth-card">
          <div className="auth-topline"><span className="eyebrow">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</span><span className="auth-step">ORBIT AI</span></div>
          <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p className="auth-subtitle">{mode === "login" ? "Sign in to continue to your intelligent space." : "Start a new space for thinking, making, and exploring."}</p>
          <form onSubmit={submit} className="auth-form">
            {mode === "signup" && <label>Full name<input autoComplete="name" placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>}
            <label>Email address<input autoComplete="email" type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label>Password<input autoComplete={mode === "login" ? "current-password" : "new-password"} type="password" placeholder="Enter your password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
            {error && <p className="error auth-error">{error}</p>}
            <button className="primary-button" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"} <Icon name="arrow" size={17} /></button>
          </form>
          <button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>{mode === "login" ? "Don’t have an account? Sign up" : "Already have an account? Sign in"}</button>
          <p className="privacy-note">Your conversations stay private. Use Orbit AI responsibly.</p>
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
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("orbit-theme") || "dark");
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [retryPrompt, setRetryPrompt] = useState("");
  const composerRef = useRef(null);
  const streamControllerRef = useRef(null);
  const streamGenerationRef = useRef(0);

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
  useEffect(() => () => {
    streamGenerationRef.current += 1;
    streamControllerRef.current?.abort();
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("orbit-theme", theme);
  }, [theme]);

  const selectChat = async (chat) => {
    streamGenerationRef.current += 1;
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    setBusy(false);
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
    streamGenerationRef.current += 1;
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    setBusy(false);
    setError("");
    setActiveChat(null);
    setMessages([]);
    setRetryPrompt("");
    setSidebarOpen(false);
  };
  const renameChat = async (chat) => {
    const topic = renameValue.trim();
    if (!topic || topic === chat.topic) {
      setRenamingChatId(null);
      return;
    }
    try {
      const updated = await request(`/chat/${chat._id}`, {
        method: "PATCH",
        body: JSON.stringify({ topic: topic.trim() }),
      });
      setChats((current) => current.map((item) => item._id === chat._id ? { ...item, topic: updated.topic } : item));
      setActiveChat((current) => current?._id === chat._id ? { ...current, topic: updated.topic } : current);
      setRenamingChatId(null);
    } catch (err) {
      setError(err.message);
    }
  };
  const beginRename = (chat) => {
    setRenamingChatId(chat._id);
    setRenameValue(chat.topic || "New conversation");
  };
  const togglePinChat = async (chat) => {
    try {
      const updated = await request(`/chat/${chat._id}/pin`, { method: "POST" });
      setChats((current) => current.map((item) => item._id === chat._id ? { ...item, pinned: updated.pinned } : item));
    } catch (err) {
      setError(err.message);
    }
  };
  const removeChat = async (chat) => {
    if (!window.confirm(`Delete "${chat.topic || "New conversation"}"? This cannot be undone.`)) return;
    try {
      await request(`/chat/${chat._id}`, { method: "DELETE" });
      setChats((current) => current.filter((item) => item._id !== chat._id));
      if (activeChat?._id === chat._id) {
        setActiveChat(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err.message);
    }
  };
  const sendMessage = async (event, requestedContent = null) => {
    event?.preventDefault();
    const content = (requestedContent ?? draft).trim();
    if (!content || busy) return;
    setBusy(true);
    setError("");
    setRetryPrompt("");
    setDraft("");
    const assistantId = `stream-${Date.now()}`;
    const userMessageId = `pending-${Date.now()}`;
    const controller = new AbortController();
    const generation = ++streamGenerationRef.current;
    streamControllerRef.current = controller;
    setMessages((current) => [...current, { _id: userMessageId, role: "user", content }, { _id: assistantId, role: "assistant", content: "" }]);
    try {
      await streamRequest(activeChat ? `/msg/${activeChat._id}/stream` : "/msg/stream", { content, model: DEFAULT_MODEL }, (eventName, data) => {
        if (streamGenerationRef.current !== generation) return;
        if (eventName === "token") {
          setMessages((current) => current.map((message) => message._id === assistantId ? { ...message, content: message.content + data.content } : message));
        }
        if (eventName === "done" && !activeChat) {
          setActiveChat({ _id: data.chatId, topic: content.slice(0, 40), model: DEFAULT_MODEL });
          loadChats();
        }
        if (eventName === "error") throw new Error(data.message);
      }, controller.signal);
    } catch (err) {
      if (streamGenerationRef.current !== generation) return;
      setMessages((current) => current.filter((message) => message._id !== assistantId && message._id !== userMessageId));
      setError(controller.signal.aborted ? "Generation stopped." : err.message);
      setDraft(content);
      setRetryPrompt(content);
    } finally {
      if (streamGenerationRef.current === generation) {
        if (streamControllerRef.current === controller) streamControllerRef.current = null;
        setBusy(false);
      }
    }
  };
  const stopGeneration = () => {
    streamControllerRef.current?.abort(new DOMException("Generation stopped", "AbortError"));
  };
  const logout = async () => {
    try {
      streamGenerationRef.current += 1;
      streamControllerRef.current?.abort();
      streamControllerRef.current = null;
      setBusy(false);
      await request("/user/logout", { method: "POST" });
      setUser(null);
      setActiveChat(null);
      setMessages([]);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <main className="loading-screen"><span className="brand-symbol large"><Icon name="spark" size={28} /></span><p>Preparing your workspace...</p></main>;
  if (!user) return <AuthScreen onAuthenticated={(result) => setUser(result)} />;
  const visibleChats = chats.filter((chat) => (chat.topic || "New conversation").toLowerCase().includes(search.toLowerCase()));

  return (
    <main className="app-shell">
      {sidebarOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="logo"><span className="brand-symbol"><Icon name="spark" size={16} /></span> orbit <b>ai</b></div>
        <button className="new-chat" onClick={newChat}><Icon name="plus" size={17} /> New chat <kbd>⌘ K</kbd></button>
        <label className="chat-search"><Icon name="search" size={15} /><input aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <div className="sidebar-heading"><span>CONVERSATIONS</span><span>{visibleChats.length}</span></div>
        <div className="chat-list">
          {visibleChats.length ? visibleChats.map((chat) => <div className={`chat-row ${activeChat?._id === chat._id ? "selected" : ""}`} key={chat._id}>
            {renamingChatId === chat._id ? <form className="rename-form" onSubmit={(event) => { event.preventDefault(); renameChat(chat); }}><input value={renameValue} maxLength="120" autoFocus onChange={(event) => setRenameValue(event.target.value)} /><button type="submit" aria-label="Save conversation name"><Icon name="check" size={13} /></button><button type="button" aria-label="Cancel rename" onClick={() => setRenamingChatId(null)}><Icon name="close" size={13} /></button></form> : <button className="chat-link" onClick={() => selectChat(chat)}><span className="chat-icon"><span /></span><span>{chat.topic || "New conversation"}</span>{chat.pinned && <Icon name="pin" size={12} />}</button>}
            <div className="chat-actions">
              <button type="button" aria-label={chat.pinned ? "Unpin conversation" : "Pin conversation"} title={chat.pinned ? "Unpin" : "Pin"} onClick={() => togglePinChat(chat)}><Icon name="pin" size={13} /></button>
              <button type="button" aria-label="Rename conversation" title="Rename" onClick={() => beginRename(chat)}>Rename</button>
              <button type="button" aria-label="Delete conversation" title="Delete" onClick={() => removeChat(chat)}>Delete</button>
            </div>
          </div>) : <p className="sidebar-empty">{search ? "No matching conversations." : "Your conversations will appear here."}</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="account">
            <div className="avatar">{user.name?.[0]?.toUpperCase() || "U"}</div>
            <div className="account-copy"><strong>{user.name}</strong><small>{user.email}</small></div>
            <button className="icon-button" aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"} title={theme === "dark" ? "Light theme" : "Dark theme"} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}><Icon name={theme === "dark" ? "sun" : "moon"} size={15} /></button>
            <button className="icon-button" aria-label="Open account menu" onClick={() => setProfileOpen((open) => !open)}><Icon name="chevron" size={15} /></button>
          </div>
          {profileOpen && <div className="profile-popover"><div><strong>{user.name}</strong><small>{user.email}</small></div><button className="popover-action"><Icon name="settings" size={15} /> Settings</button><button className="popover-action danger" onClick={logout}><Icon name="logout" size={15} /> Sign out</button></div>}
        </div>
      </aside>
      <section className="conversation">
        <header className="topbar"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Icon name="menu" size={20} /></button><div className="topbar-brand"><span className="brand-symbol"><Icon name="spark" size={15} /></span><strong>Orbit AI</strong></div><div className="session-title"><span>{activeChat?.topic || "New conversation"}</span><small>{activeChat ? "Conversation" : "Ready when you are"}</small></div><div className="status-dot"><i /> ONLINE</div></header>
        <div className="message-area">
          {!messages.length && <div className="empty-state"><span className="spark"><Icon name="spark" size={34} /></span><p className="eyebrow">YOUR INTELLIGENT SPACE</p><h1>What would you like to explore?</h1><p>Ask a question, work through an idea, or start creating something new.</p><div className="prompt-grid"><button onClick={() => setDraft("Explain a programming concept simply.")}><span className="prompt-icon">01</span>Explain a programming concept<Icon name="arrow" size={15} /></button><button onClick={() => setDraft("Help me debug my code.")}><span className="prompt-icon">02</span>Help me debug my code<Icon name="arrow" size={15} /></button><button onClick={() => setDraft("Write something thoughtful for me.")}><span className="prompt-icon">03</span>Write something for me<Icon name="arrow" size={15} /></button><button onClick={() => setDraft("Help me learn something new.")}><span className="prompt-icon">04</span>Help me learn something new<Icon name="arrow" size={15} /></button></div></div>}
          {messages.map((message, index) => <article className={`message ${message.role}`} key={message._id || index}><div className="message-label"><span className={message.role === "assistant" ? "coach-dot" : "player-dot"} />{message.role === "assistant" ? "ORBIT AI" : "YOU"}{busy && message.role === "assistant" && message._id?.startsWith("stream-") && <span className="streaming-indicator" aria-label="Orbit AI is replying"><i /><i /><i /></span>}</div>{message.role === "assistant" ? <StructuredMessage content={message.content} /> : <p>{message.content}</p>}</article>)}
        </div>
        <div className="composer-wrap">
          {error && <div className="composer-error-actions"><p className="error">{error}</p>{retryPrompt && !busy && <button type="button" className="retry-button" onClick={() => sendMessage(null, retryPrompt)}>Retry</button>}</div>}
          <form className="composer" onSubmit={sendMessage}><textarea ref={composerRef} value={draft} onChange={(e) => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`; }} placeholder="Message Orbit AI..." rows="1" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }} /><button type={busy ? "button" : "submit"} aria-label={busy ? "Stop generating" : "Send message"} className={busy ? "stop-button" : ""} onClick={busy ? stopGeneration : undefined} disabled={!busy && !draft.trim()}>{busy ? "Stop" : <Icon name="send" size={17} />}</button></form>
          <div className="composer-meta"><span>Orbit AI can make mistakes. Check important information.</span><span>Enter to send · Shift + Enter for new line</span></div>
        </div>
      </section>
    </main>
  );
}

export default App;
