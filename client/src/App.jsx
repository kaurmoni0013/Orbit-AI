import { useEffect, useMemo, useRef, useState } from "react";
import { request, streamRequest } from "./api.js";

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const createRequestKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function Icon({ name, size = 18 }) {
  const icons = {
    arrow: <><path d="M5 12h13M13 6l6 6-6 6" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    send: <><path d="m21 3-7.5 18-3.8-7.7L2 9.5 21 3Z" /><path d="M9.8 13.3 21 3" /></>,
    orbit: <><circle cx="12" cy="12" r="7.5" /><path d="M4.8 8.5c3.3 2.4 10.9 2.8 14.4.1M5.3 15.8c3.7-2.8 10.3-2.9 13.7-.2" /><circle cx="12" cy="12" r="1.5" /></>,
    pin: <path d="m15 4 5 5-2.5 2.5v4L14 19l-2-2-3 3-.9-.9 3-3-2-2 3.5-3.5h4L19 8l-4-4Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    moon: <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></>,
    note: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
}

function getResetToken() {
  try {
    return new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
  } catch {
    return "";
  }
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
        return <span key={index}>{part}</span>;
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
  const [mode, setMode] = useState(() => getResetToken() ? "reset" : "login");
  const [form, setForm] = useState({ name: "", age: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const resetToken = useMemo(() => getResetToken(), []);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
    setPreviewUrl("");
    setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
  };

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setPreviewUrl("");
    if (mode === "reset" && form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      let body;
      if (mode === "signup") body = { ...form, age: form.age ? Number(form.age) : undefined };
      else if (mode === "login") body = { email: form.email, password: form.password };
      else if (mode === "forgot") body = { email: form.email };
      else body = { token: resetToken, password: form.password };
      const result = await request(`/user/${mode === "signup" ? "signup" : mode === "login" ? "login" : mode === "forgot" ? "forgot-password" : "reset-password"}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (mode === "forgot") {
        setNotice(result.message);
        setPreviewUrl(result.previewUrl || "");
        if (result.emailSent === false) {
          setError("Email delivery failed on the server. Check the API logs or run npm run mail:check.");
        }
        return;
      }      if (mode === "reset") {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        setMode("login");
        setNotice(result.message);
        setError("");
        setPreviewUrl("");
        setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
        return;
      }
      await onAuthenticated(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "login" ? "Welcome back" : mode === "signup" ? "Create an account" : mode === "forgot" ? "Reset your password" : "Choose a new password";
  const subtitle = mode === "login" ? "Return to your private workspace." : mode === "signup" ? "Start a focused space for questions, decisions, and useful work." : mode === "forgot" ? "Enter the email you use for Orbit. We’ll send a secure reset link." : "Use the link from your email to set a new password.";

  return (
    <main className="auth-layout">
      <section className="auth-editorial">
        <div className="wordmark"><span className="brand-mark"><Icon name="orbit" size={17} /></span><span>ORBIT</span><small>AI WORKSPACE</small></div>
        <div className="editorial-copy">
          <p className="section-label">FIELD NOTE / 01</p>
          <h1>Make room for <em>better questions.</em></h1>
          <p>Orbit is a quiet place to think through the things that matter. Bring a question, a rough idea, or a problem that needs a second pair of eyes.</p>
        </div>
        <div className="editorial-index">
          <div><span>01</span><p>Keep context<br />Close to the work</p></div>
          <div><span>02</span><p>Think in drafts<br />Not conclusions</p></div>
          <div><span>03</span><p>Leave with<br />A useful next step</p></div>
        </div>
      </section>
      <section className="auth-side">
        <div className="auth-card">
          <div className="auth-card-head"><span className="section-label">ACCOUNT ACCESS</span><span className="auth-index">ORBIT / 01</span></div>
          <h2>{title}</h2>
          <p className="auth-subtitle">{subtitle}</p>
          {notice && <p className="notice auth-notice" role="status">{notice}{previewUrl && <a href={previewUrl}>Open local reset link</a>}</p>}
          {mode === "reset" && !resetToken && <p className="error auth-error">This reset link is missing its token.</p>}
          <form onSubmit={submit} className="auth-form">
            {mode === "signup" && <label>Full name<input autoComplete="name" placeholder="Your name" value={form.name} onChange={update("name")} required /></label>}
            {(mode === "login" || mode === "signup" || mode === "forgot") && <label>Email address<input autoComplete="email" type="email" placeholder="you@example.com" value={form.email} onChange={update("email")} required /></label>}
            {(mode === "login" || mode === "signup" || mode === "reset") && <label>Password<input autoComplete={mode === "login" ? "current-password" : "new-password"} type="password" placeholder={mode === "login" ? "Enter your password" : "Create a strong password"} value={form.password} onChange={update("password")} required /></label>}
            {mode === "signup" && <label>Age <span className="label-note">optional</span><input autoComplete="off" type="number" min="10" max="100" placeholder="18" value={form.age} onChange={update("age")} /></label>}
            {mode === "reset" && <label>Confirm password<input autoComplete="new-password" type="password" placeholder="Repeat your new password" value={form.confirmPassword} onChange={update("confirmPassword")} required /></label>}
            {(mode === "signup" || mode === "reset") && <p className="password-note">Use 8+ characters with upper and lowercase letters and a symbol.</p>}
            {error && <p className="error auth-error" role="alert">{error}</p>}
            <button className="primary-button" disabled={busy || (mode === "reset" && !resetToken)}>{busy ? "Working..." : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Save new password"}<Icon name="arrow" size={17} /></button>
          </form>
          {mode === "login" && <><button type="button" className="text-button" onClick={() => changeMode("forgot")}>Forgot your password?</button><button type="button" className="text-button secondary" onClick={() => changeMode("signup")}>New to Orbit? Create an account</button></>}
          {mode === "signup" && <button type="button" className="text-button" onClick={() => changeMode("login")}>Already have an account? Sign in</button>}
          {(mode === "forgot" || mode === "reset") && <button type="button" className="text-button" onClick={() => changeMode("login")}>Back to sign in</button>}
          <p className="privacy-note">Passwords are stored as one-way hashes. Orbit never asks you to share your password by email.</p>
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
  const [bootError, setBootError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("orbit-theme") || "dark"; } catch { return "dark"; }
  });
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [retryPrompt, setRetryPrompt] = useState("");
  const [retryRequestId, setRetryRequestId] = useState("");
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const [streamingChatId, setStreamingChatId] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const composerRef = useRef(null);
  const streamControllerRef = useRef(null);
  const streamGenerationRef = useRef(0);
  const chatLoadControllerRef = useRef(null);
  const chatLoadGenerationRef = useRef(0);

  const loadChats = async () => {
    const result = await request("/chat/getRecentChat?limit=50");
    setChats(result.chats || []);
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const profile = await request("/user/profile");
        if (!active) return;
        setUser(profile);
        try {
          await loadChats();
        } catch (err) {
          if (active && err.name !== "AbortError") setError(err.message);
        }
      } catch (err) {
        if (active && err.status !== 401) setBootError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    void boot();
    return () => {
      active = false;
      chatLoadControllerRef.current?.abort();
    };
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
    try { localStorage.setItem("orbit-theme", theme); } catch { return undefined; }
  }, [theme]);

  const cancelChatLoad = () => {
    chatLoadGenerationRef.current += 1;
    chatLoadControllerRef.current?.abort();
    chatLoadControllerRef.current = null;
  };

  const selectChat = async (chat) => {
    cancelChatLoad();
    const generation = chatLoadGenerationRef.current;
    const controller = new AbortController();
    chatLoadControllerRef.current = controller;
    streamGenerationRef.current += 1;
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    setBusy(false);
    setStreamingMessageId(null);
    setStreamingChatId(null);
    setActiveChat(chat);
    setSidebarOpen(false);
    setError("");
    try {
      const result = await request(`/msg/${chat._id}?limit=100`, { signal: controller.signal });
      if (generation !== chatLoadGenerationRef.current) return;
      setMessages(result.msg || []);
    } catch (err) {
      if (generation === chatLoadGenerationRef.current && err.name !== "AbortError") setError(err.message);
    } finally {
      if (generation === chatLoadGenerationRef.current) chatLoadControllerRef.current = null;
    }
  };

  const newChat = () => {
    cancelChatLoad();
    streamGenerationRef.current += 1;
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    setBusy(false);
    setStreamingMessageId(null);
    setStreamingChatId(null);
    setError("");
    setActiveChat(null);
    setMessages([]);
    setRetryPrompt("");
    setRetryRequestId("");
    setSidebarOpen(false);
  };

  const renameChat = async (chat) => {
    const topic = renameValue.trim();
    if (!topic || topic === chat.topic) {
      setRenamingChatId(null);
      return;
    }
    try {
      const updated = await request(`/chat/${chat._id}`, { method: "PATCH", body: JSON.stringify({ topic }) });
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
    if (!window.confirm(`Delete “${chat.topic || "New conversation"}”? This cannot be undone.`)) return;
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

  const sendMessage = async (event, requestedContent = null, requestIdOverride = null) => {
    event?.preventDefault();
    const content = (requestedContent ?? draft).trim();
    if (!content || busy) return;
    const requestId = requestIdOverride || (requestedContent !== null && retryRequestId ? retryRequestId : createRequestKey());
    setBusy(true);
    setError("");
    setRetryPrompt("");
    if (requestedContent === null) setRetryRequestId(requestId);
    setDraft("");
    const assistantId = `stream-${requestId}`;
    const userMessageId = `pending-${requestId}`;
    const controller = new AbortController();
    const generation = ++streamGenerationRef.current;
    const targetChatId = activeChat?._id || null;
    let completed = false;
    streamControllerRef.current = controller;
    setStreamingMessageId(assistantId);
    setStreamingChatId(targetChatId);
    setMessages((current) => [...current, { _id: userMessageId, role: "user", content }, { _id: assistantId, role: "assistant", content: "" }]);
    try {
      await streamRequest(targetChatId ? `/msg/${targetChatId}/stream` : "/msg/stream", { content, model: DEFAULT_MODEL }, (eventName, data) => {
        if (streamGenerationRef.current !== generation) return;
        if (eventName === "token") {
          setMessages((current) => current.map((message) => message._id === assistantId ? { ...message, content: message.content + data.content } : message));
        }
        if (eventName === "done") {
          completed = true;
          setMessages((current) => current.map((message) => {
            if (message._id === userMessageId && data.userMessageId) return { ...message, _id: data.userMessageId };
            if (message._id === assistantId && data.assistantMessageId) return { ...message, _id: data.assistantMessageId };
            return message;
          }));
          setStreamingChatId(data.chatId);
          if (!targetChatId) {
            setActiveChat({ _id: data.chatId, topic: content.slice(0, 40), model: DEFAULT_MODEL });
            void loadChats();
          }
        }
        if (eventName === "error") throw new Error(data.message);
      }, controller.signal, requestId);
    } catch (err) {
      if (streamGenerationRef.current !== generation) return;
      setMessages((current) => current.filter((message) => message._id !== assistantId && message._id !== userMessageId));
      setError(controller.signal.aborted ? "Generation stopped." : err.message);
      setDraft(content);
      setRetryPrompt(content);
      setRetryRequestId(requestId);
    } finally {
      if (streamGenerationRef.current === generation) {
        if (completed) setRetryRequestId("");
        if (streamControllerRef.current === controller) streamControllerRef.current = null;
        setStreamingMessageId(null);
        setStreamingChatId(null);
        setBusy(false);
      }
    }
  };

  const stopGeneration = () => streamControllerRef.current?.abort(new DOMException("Generation stopped", "AbortError"));

  const retryLastMessage = () => {
    if (!retryPrompt || busy) return;
    const content = retryPrompt;
    const requestId = retryRequestId;
    setRetryPrompt("");
    void sendMessage(null, content, requestId || undefined);
  };

  const handleAuthenticated = async (result) => {
    cancelChatLoad();
    setUser(result);
    setBootError("");
    setError("");
    setChats([]);
    setActiveChat(null);
    setMessages([]);
    setDraft("");
    setSearch("");
    setProfileOpen(false);
    try {
      const profile = await request("/user/profile");
      setUser(profile);
      await loadChats();
    } catch (err) {
      setError(err.message);
    }
  };

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setError("");
    cancelChatLoad();
    streamGenerationRef.current += 1;
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    setBusy(false);
    setStreamingMessageId(null);
    setStreamingChatId(null);
    try {
      await request("/user/logout", { method: "POST" });
      setUser(null);
      setActiveChat(null);
      setMessages([]);
      setChats([]);
      setSearch("");
      setDraft("");
      setRetryPrompt("");
      setRetryRequestId("");
      setProfileOpen(false);
    } catch (err) {
      if (err.status === 503) {
        setUser(null);
        setActiveChat(null);
        setMessages([]);
        setChats([]);
        setSearch("");
        setDraft("");
        setRetryPrompt("");
        setRetryRequestId("");
        setProfileOpen(false);
      }
      setError(err.message);
    } finally {
      setLoggingOut(false);
    }
  };

  if (loading) return <main className="loading-screen"><span className="brand-mark large"><Icon name="orbit" size={26} /></span><p>Opening your workspace...</p></main>;
  if (bootError && !user) return <main className="unavailable-screen"><span className="brand-mark large"><Icon name="orbit" size={26} /></span><p className="section-label">CONNECTION NOTICE</p><h1>Orbit is taking a moment.</h1><p>{bootError}</p><button className="primary-button" onClick={() => window.location.reload()}>Try again <Icon name="arrow" size={17} /></button></main>;
  if (!user) return <AuthScreen onAuthenticated={handleAuthenticated} />;
  const visibleChats = chats.filter((chat) => (chat.topic || "New conversation").toLowerCase().includes(search.toLowerCase()));

  return (
    <main className="app-shell">
      {sidebarOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="logo"><span className="brand-mark"><Icon name="orbit" size={16} /></span><span>orbit</span><b>ai</b></div>
        <button className="new-chat" onClick={newChat}><Icon name="plus" size={17} /> New conversation</button>
        <label className="chat-search"><Icon name="search" size={15} /><input aria-label="Search conversations" placeholder="Search library" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <div className="sidebar-heading"><span>LIBRARY</span><span>{visibleChats.length.toString().padStart(2, "0")}</span></div>
        <div className="chat-list">
          {visibleChats.length ? visibleChats.map((chat) => <div className={`chat-row ${activeChat?._id === chat._id ? "selected" : ""}`} key={chat._id}>
            {renamingChatId === chat._id ? <form className="rename-form" onSubmit={(event) => { event.preventDefault(); renameChat(chat); }}><input aria-label="Conversation name" value={renameValue} maxLength="120" autoFocus onChange={(event) => setRenameValue(event.target.value)} /><button type="submit" aria-label="Save conversation name"><Icon name="check" size={13} /></button><button type="button" aria-label="Cancel rename" onClick={() => setRenamingChatId(null)}><Icon name="close" size={13} /></button></form> : <button className="chat-link" onClick={() => selectChat(chat)}><span className="chat-icon"><span /></span><span>{chat.topic || "New conversation"}</span>{chat.pinned && <Icon name="pin" size={12} />}</button>}
            <div className="chat-actions"><button type="button" aria-label={chat.pinned ? "Unpin conversation" : "Pin conversation"} title={chat.pinned ? "Unpin" : "Pin"} onClick={() => togglePinChat(chat)}><Icon name="pin" size={13} /></button><button type="button" aria-label="Rename conversation" title="Rename" onClick={() => beginRename(chat)}>Rename</button><button type="button" aria-label="Delete conversation" title="Delete" onClick={() => removeChat(chat)}>Delete</button></div>
          </div>) : <p className="sidebar-empty">{search ? "No matching conversations." : "Your saved conversations will appear here."}</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="account"><div className="avatar">{user.name?.[0]?.toUpperCase() || "U"}</div><div className="account-copy"><strong>{user.name}</strong><small>{user.email}</small></div><button className="icon-button" aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"} title={theme === "dark" ? "Light theme" : "Dark theme"} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}><Icon name={theme === "dark" ? "sun" : "moon"} size={15} /></button><button className="icon-button" aria-label="Open account menu" onClick={() => setProfileOpen((open) => !open)}><Icon name="chevron" size={15} /></button></div>
          {profileOpen && <div className="profile-popover"><div><strong>{user.name}</strong><small>{user.email}</small></div><button className="popover-action danger" onClick={logout} disabled={loggingOut}><Icon name="logout" size={15} /> {loggingOut ? "Signing out..." : "Sign out"}</button></div>}
        </div>
      </aside>
      <section className="conversation">
        <header className="topbar"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Icon name="menu" size={20} /></button><div className="topbar-brand"><span className="brand-mark"><Icon name="orbit" size={15} /></span><strong>ORBIT / AI</strong></div><div className="session-title"><span>{activeChat?.topic || "New conversation"}</span><small>{activeChat ? "Saved in your library" : "A blank page, for now"}</small></div><div className="status-pill"><i />{busy ? "GENERATING" : "READY"}</div></header>
        <div className="message-area">
          {!messages.length && <div className="empty-state"><span className="empty-mark"><Icon name="note" size={28} /></span><p className="section-label">OPEN PAGE / 01</p><h1>Start with a question<br /><em>worth keeping.</em></h1><p>Use Orbit to make sense of a topic, shape a draft, or find the next useful move.</p><div className="prompt-grid"><button onClick={() => setDraft("Help me map out a project I am considering.")}><span>PLAN</span>Map a project I’m considering<Icon name="arrow" size={15} /></button><button onClick={() => setDraft("Review this idea and help me find the weak points.")}><span>REVIEW</span>Find the weak points in an idea<Icon name="arrow" size={15} /></button><button onClick={() => setDraft("Explain a difficult concept in plain language.")}><span>LEARN</span>Explain a difficult concept<Icon name="arrow" size={15} /></button><button onClick={() => setDraft("Help me turn a rough draft into something clear.")}><span>WRITE</span>Turn a rough draft into something clear<Icon name="arrow" size={15} /></button></div></div>}
          {messages.map((message, index) => <article className={`message ${message.role}`} key={message._id || index}><div className="message-label"><span className={message.role === "assistant" ? "orbit-dot" : "user-dot"} />{message.role === "assistant" ? "ORBIT" : "YOU"}{message.role === "assistant" && message._id === streamingMessageId && <span className="streaming-indicator" aria-label="Orbit is replying"><i /><i /><i /></span>}</div>{message.role === "assistant" ? <StructuredMessage content={message.content} /> : <p>{message.content}</p>}</article>)}
        </div>
        <div className="composer-wrap">
          {error && <div className="composer-error-actions"><p className="error" role="alert">{error}</p>{retryPrompt && !busy && <button type="button" className="retry-button" onClick={retryLastMessage}>Try again</button>}</div>}
          <form className="composer" onSubmit={sendMessage}><textarea ref={composerRef} aria-label="Message Orbit" value={draft} onChange={(e) => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`; }} placeholder="Write a question or paste a draft..." rows="1" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }} /><button type={busy ? "button" : "submit"} aria-label={busy ? "Stop generating" : "Send message"} className={busy ? "stop-button" : ""} onClick={busy ? stopGeneration : undefined} disabled={!busy && !draft.trim()}>{busy ? "Stop" : <Icon name="send" size={17} />}</button></form>
          <div className="composer-meta"><span>Orbit can make mistakes. Check important details.</span><span>Enter to send · Shift + Enter for a new line</span></div>
        </div>
      </section>
    </main>
  );
}

export default App;
