import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate  = useNavigate();
  const [form, setForm]       = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.username, form.password);
    } catch (err) {
      addToast(err.response?.data?.error?.message || "Login failed. Please check credentials.", "error");
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex", minHeight: "100vh", background: "#0d1117",
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>

      {/* ── LEFT PANEL — Branding ── */}
      <div style={{
        flex: "0 0 52%", position: "relative", overflow: "hidden",
        background: "linear-gradient(145deg, #0f0c29, #1a1a3e, #0d1b4b)",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "60px 64px",
      }}>
        {/* Ambient blobs */}
        <div style={{
          position: "absolute", width: "500px", height: "500px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)",
          top: "-100px", left: "-100px", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", width: "400px", height: "400px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.14) 0%, transparent 70%)",
          bottom: "-80px", right: "-80px", pointerEvents: "none",
        }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "64px" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: "linear-gradient(135deg, #6366f1, #3b82f6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px", boxShadow: "0 8px 20px rgba(99,102,241,0.4)",
          }}>🏦</div>
          <span style={{ fontSize: "1.35rem", fontWeight: 700, color: "#f0f6fc", letterSpacing: "-0.01em" }}>
            NexusBank
          </span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: "2.8rem", fontWeight: 800, color: "#f0f6fc",
          lineHeight: 1.15, letterSpacing: "-0.03em", marginBottom: "20px",
        }}>
          Your finances,<br />
          <span style={{
            background: "linear-gradient(90deg, #818cf8, #60a5fa)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>redefined.</span>
        </h1>
        <p style={{ color: "#8b949e", fontSize: "1.05rem", lineHeight: 1.7, marginBottom: "56px", maxWidth: "380px" }}>
          Enterprise-grade banking infrastructure with real-time transfers, instant loans, and secure transaction processing.
        </p>

        {/* Feature pills */}
        {[
          { icon: "⚡", text: "Instant transfers — zero delays" },
          { icon: "🛡️", text: "Enterprise-grade security" },
          { icon: "💼", text: "Loans approved in minutes" },
        ].map(f => (
          <div key={f.text} style={{
            display: "flex", alignItems: "center", gap: "14px",
            marginBottom: "18px", padding: "14px 18px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: "12px", border: "1px solid rgba(255,255,255,0.07)",
            backdropFilter: "blur(8px)",
          }}>
            <span style={{ fontSize: "1.2rem" }}>{f.icon}</span>
            <span style={{ color: "#c9d1d9", fontSize: "0.92rem", fontWeight: 500 }}>{f.text}</span>
          </div>
        ))}

        {/* Trust badges */}
        <div style={{ display: "flex", gap: "12px", marginTop: "40px", flexWrap: "wrap" }}>
          {["256-bit SSL", "RBI Compliant", "ISO 27001"].map(badge => (
            <span key={badge} style={{
              padding: "5px 14px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 600,
              color: "#818cf8", background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.3)",
            }}>{badge}</span>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL — Form ── */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "40px 32px", background: "#0d1117", position: "relative",
      }}>
        {/* subtle grid */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.025,
          backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "40px 40px", pointerEvents: "none",
        }} />

        <div style={{
          width: "100%", maxWidth: "400px", position: "relative", zIndex: 1,
          animation: "fadeIn 0.4s ease-out",
        }}>
          <div style={{ marginBottom: "36px" }}>
            <h2 style={{
              fontSize: "1.75rem", fontWeight: 700, color: "#f0f6fc",
              letterSpacing: "-0.02em", margin: "0 0 8px",
            }}>Sign in</h2>
            <p style={{ margin: 0, color: "#6e7681", fontSize: "0.9rem" }}>
              Welcome back — enter your credentials to continue
            </p>
          </div>

          <form onSubmit={submit} noValidate>

            {/* Username */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{
                display: "block", fontSize: "0.82rem", fontWeight: 600,
                color: "#8b949e", marginBottom: "8px", letterSpacing: "0.02em", textTransform: "uppercase",
              }}>Username</label>
              <div style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)",
                  fontSize: "16px", opacity: 0.5, pointerEvents: "none",
                }}>👤</span>
                <input
                  id="login-username"
                  required
                  autoFocus
                  placeholder="Enter your username"
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  style={{
                    width: "100%", padding: "13px 14px 13px 44px",
                    background: "#161b22", border: "1px solid #30363d", borderRadius: "10px",
                    color: "#f0f6fc", fontSize: "0.95rem", outline: "none",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                    fontFamily: "inherit", boxSizing: "border-box",
                  }}
                  onFocus={e => { e.target.style.borderColor = "#6366f1"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.2)"; }}
                  onBlur={e => { e.target.style.borderColor = "#30363d"; e.target.style.boxShadow = "none"; }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: "28px" }}>
              <label style={{
                display: "block", fontSize: "0.82rem", fontWeight: 600,
                color: "#8b949e", marginBottom: "8px", letterSpacing: "0.02em", textTransform: "uppercase",
              }}>Password</label>
              <div style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)",
                  fontSize: "16px", opacity: 0.5, pointerEvents: "none",
                }}>🔒</span>
                <input
                  id="login-password"
                  type={showPass ? "text" : "password"}
                  required
                  placeholder="Enter your password"
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  style={{
                    width: "100%", padding: "13px 48px 13px 44px",
                    background: "#161b22", border: "1px solid #30363d", borderRadius: "10px",
                    color: "#f0f6fc", fontSize: "0.95rem", outline: "none",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                    fontFamily: "inherit", boxSizing: "border-box",
                  }}
                  onFocus={e => { e.target.style.borderColor = "#6366f1"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.2)"; }}
                  onBlur={e => { e.target.style.borderColor = "#30363d"; e.target.style.boxShadow = "none"; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{
                    position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                    background: "transparent", border: "none", cursor: "pointer",
                    color: "#6e7681", fontSize: "14px", width: "auto", padding: "4px",
                    transition: "color 0.2s",
                  }}
                  title={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "14px",
                background: loading ? "#374151" : "linear-gradient(135deg, #6366f1, #4f46e5)",
                color: "#fff", border: "none", borderRadius: "10px",
                fontWeight: 700, fontSize: "0.95rem", cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit", transition: "all 0.2s",
                boxShadow: loading ? "none" : "0 4px 20px rgba(99,102,241,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
              }}
              onMouseOver={e => { if (!loading) e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseOut={e => { e.currentTarget.style.transform = "translateY(0)"; }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite",
                  }} />
                  Authenticating…
                </>
              ) : "Sign In →"}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "28px 0" }}>
            <div style={{ flex: 1, height: "1px", background: "#21262d" }} />
            <span style={{ color: "#6e7681", fontSize: "0.78rem" }}>New to NexusBank?</span>
            <div style={{ flex: 1, height: "1px", background: "#21262d" }} />
          </div>

          <Link
            to="/register"
            style={{
              display: "block", width: "100%", padding: "13px",
              textAlign: "center", borderRadius: "10px",
              border: "1px solid #30363d", color: "#c9d1d9",
              textDecoration: "none", fontSize: "0.9rem", fontWeight: 600,
              transition: "all 0.2s", background: "transparent",
              boxSizing: "border-box",
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = "#6366f1"; e.currentTarget.style.color = "#818cf8"; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = "#30363d"; e.currentTarget.style.color = "#c9d1d9"; }}
          >
            Create an account
          </Link>

          <p style={{ textAlign: "center", color: "#484f58", fontSize: "0.75rem", marginTop: "32px" }}>
            Protected by 256-bit TLS encryption
          </p>
        </div>
      </div>
    </div>
  );
}
