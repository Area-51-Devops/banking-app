import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useToast } from "../contexts/ToastContext";
import { API } from "../api";

export default function Register() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const strength = (() => {
    const p = form.password;
    if (!p) return 0;
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    return score;
  })();

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "#ef4444", "#f59e0b", "#3b82f6", "#10b981"][strength];

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return addToast("Passwords do not match.", "error");
    if (form.password.length < 6) return addToast("Password must be at least 6 characters.", "error");

    setLoading(true);
    try {
      await API.user.post("/users/register", {
        username: form.username,
        email: form.email,
        password: form.password,
      });
      addToast("Account created successfully. Please login.", "success");
      navigate("/login");
    } catch (err) {
      addToast(err.response?.data?.error?.message || "Registration failed.", "error");
    } finally { setLoading(false); }
  };

  const inputStyle = {
    width: "100%", padding: "13px 14px 13px 44px",
    background: "#161b22", border: "1px solid #30363d", borderRadius: "10px",
    color: "#f0f6fc", fontSize: "0.95rem", outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    fontFamily: "inherit", boxSizing: "border-box",
  };
  const labelStyle = {
    display: "block", fontSize: "0.82rem", fontWeight: 600,
    color: "#8b949e", marginBottom: "8px", letterSpacing: "0.02em", textTransform: "uppercase",
  };

  return (
    <div style={{
      display: "flex", minHeight: "100vh", background: "#0d1117",
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>

      {/* ── LEFT PANEL ── */}
      <div style={{
        flex: "0 0 48%", position: "relative", overflow: "hidden",
        background: "linear-gradient(145deg, #0f2027, #161b35, #0d2137)",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "60px 64px",
      }}>
        {/* Ambient blobs */}
        <div style={{
          position: "absolute", width: "460px", height: "460px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)",
          top: "-80px", right: "-100px", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", width: "360px", height: "360px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
          bottom: "-60px", left: "-80px", pointerEvents: "none",
        }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "60px" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: "linear-gradient(135deg, #10b981, #059669)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px", boxShadow: "0 8px 20px rgba(16,185,129,0.35)",
          }}>🏦</div>
          <span style={{ fontSize: "1.35rem", fontWeight: 700, color: "#f0f6fc", letterSpacing: "-0.01em" }}>
            NexusBank
          </span>
        </div>

        <h1 style={{
          fontSize: "2.6rem", fontWeight: 800, color: "#f0f6fc",
          lineHeight: 1.15, letterSpacing: "-0.03em", marginBottom: "20px",
        }}>
          Start your<br />
          <span style={{
            background: "linear-gradient(90deg, #34d399, #6ee7b7)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>financial journey.</span>
        </h1>
        <p style={{ color: "#8b949e", fontSize: "1rem", lineHeight: 1.7, marginBottom: "48px", maxWidth: "360px" }}>
          Open your account in under 60 seconds. No paperwork, no branch visit — just seamless digital banking.
        </p>

        {/* Steps */}
        {[
          { step: "01", title: "Create your account", sub: "Free — takes under a minute" },
          { step: "02", title: "Fund your wallet", sub: "Top up instantly via UPI/NEFT" },
          { step: "03", title: "Transfer & grow", sub: "Loans, payments, and more" },
        ].map(s => (
          <div key={s.step} style={{
            display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "24px",
          }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0,
              background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.72rem", fontWeight: 700, color: "#10b981",
            }}>{s.step}</div>
            <div>
              <div style={{ color: "#f0f6fc", fontWeight: 600, fontSize: "0.92rem", marginBottom: "2px" }}>{s.title}</div>
              <div style={{ color: "#6e7681", fontSize: "0.82rem" }}>{s.sub}</div>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", gap: "10px", marginTop: "32px" }}>
          {["Free Account", "Instant Setup", "Secure & Private"].map(b => (
            <span key={b} style={{
              padding: "5px 13px", borderRadius: "20px", fontSize: "0.73rem", fontWeight: 600,
              color: "#34d399", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
            }}>{b}</span>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL — Form ── */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "40px 32px", background: "#0d1117", position: "relative",
        overflowY: "auto",
      }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.025,
          backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "40px 40px", pointerEvents: "none",
        }} />

        <div style={{
          width: "100%", maxWidth: "420px", position: "relative", zIndex: 1,
          animation: "fadeIn 0.4s ease-out", padding: "20px 0",
        }}>
          <div style={{ marginBottom: "32px" }}>
            <h2 style={{
              fontSize: "1.75rem", fontWeight: 700, color: "#f0f6fc",
              letterSpacing: "-0.02em", margin: "0 0 8px",
            }}>Create account</h2>
            <p style={{ margin: 0, color: "#6e7681", fontSize: "0.9rem" }}>
              Join thousands of NexusBank customers today
            </p>
          </div>

          <form onSubmit={submit} noValidate>

            {/* Username */}
            <div style={{ marginBottom: "18px" }}>
              <label style={labelStyle}>Username</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "16px", opacity: 0.5, pointerEvents: "none" }}>👤</span>
                <input
                  required autoFocus placeholder="Choose a username"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = "#10b981"; e.target.style.boxShadow = "0 0 0 3px rgba(16,185,129,0.2)"; }}
                  onBlur={e => { e.target.style.borderColor = "#30363d"; e.target.style.boxShadow = "none"; }}
                />
              </div>
            </div>

            {/* Email */}
            <div style={{ marginBottom: "18px" }}>
              <label style={labelStyle}>Email Address</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "16px", opacity: 0.5, pointerEvents: "none" }}>✉️</span>
                <input
                  type="email" required placeholder="you@example.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = "#10b981"; e.target.style.boxShadow = "0 0 0 3px rgba(16,185,129,0.2)"; }}
                  onBlur={e => { e.target.style.borderColor = "#30363d"; e.target.style.boxShadow = "none"; }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: "6px" }}>
              <label style={labelStyle}>Password</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "16px", opacity: 0.5, pointerEvents: "none" }}>🔒</span>
                <input
                  type={showPass ? "text" : "password"} required placeholder="Create a strong password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  style={{ ...inputStyle, paddingRight: "48px" }}
                  onFocus={e => { e.target.style.borderColor = "#10b981"; e.target.style.boxShadow = "0 0 0 3px rgba(16,185,129,0.2)"; }}
                  onBlur={e => { e.target.style.borderColor = "#30363d"; e.target.style.boxShadow = "none"; }}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "#6e7681", fontSize: "14px", width: "auto", padding: "4px" }}>
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {/* Strength bar */}
            {form.password && (
              <div style={{ marginBottom: "18px" }}>
                <div style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{
                      flex: 1, height: "3px", borderRadius: "2px",
                      background: i <= strength ? strengthColor : "#21262d",
                      transition: "background 0.3s",
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: "0.75rem", color: strengthColor, fontWeight: 600 }}>
                  {strengthLabel} password
                </span>
              </div>
            )}

            {/* Confirm */}
            <div style={{ marginBottom: "28px" }}>
              <label style={labelStyle}>Confirm Password</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "16px", opacity: 0.5, pointerEvents: "none" }}>🔑</span>
                <input
                  type="password" required placeholder="Re-enter your password"
                  value={form.confirm}
                  onChange={e => setForm({ ...form, confirm: e.target.value })}
                  style={{
                    ...inputStyle,
                    borderColor: form.confirm && form.confirm !== form.password ? "#ef4444" : "#30363d",
                  }}
                  onFocus={e => {
                    if (!form.confirm || form.confirm === form.password) {
                      e.target.style.borderColor = "#10b981";
                      e.target.style.boxShadow = "0 0 0 3px rgba(16,185,129,0.2)";
                    }
                  }}
                  onBlur={e => {
                    e.target.style.boxShadow = "none";
                    e.target.style.borderColor = form.confirm && form.confirm !== form.password ? "#ef4444" : "#30363d";
                  }}
                />
                {form.confirm && (
                  <span style={{
                    position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)",
                    fontSize: "14px",
                  }}>
                    {form.confirm === form.password ? "✅" : "❌"}
                  </span>
                )}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "14px",
                background: loading ? "#374151" : "linear-gradient(135deg, #10b981, #059669)",
                color: "#fff", border: "none", borderRadius: "10px",
                fontWeight: 700, fontSize: "0.95rem", cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit", transition: "all 0.2s",
                boxShadow: loading ? "none" : "0 4px 20px rgba(16,185,129,0.35)",
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
                  Creating Account…
                </>
              ) : "Create Account →"}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "24px 0" }}>
            <div style={{ flex: 1, height: "1px", background: "#21262d" }} />
            <span style={{ color: "#6e7681", fontSize: "0.78rem" }}>Already registered?</span>
            <div style={{ flex: 1, height: "1px", background: "#21262d" }} />
          </div>

          <Link
            to="/login"
            style={{
              display: "block", width: "100%", padding: "13px",
              textAlign: "center", borderRadius: "10px",
              border: "1px solid #30363d", color: "#c9d1d9",
              textDecoration: "none", fontSize: "0.9rem", fontWeight: 600,
              transition: "all 0.2s", background: "transparent",
              boxSizing: "border-box",
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = "#10b981"; e.currentTarget.style.color = "#34d399"; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = "#30363d"; e.currentTarget.style.color = "#c9d1d9"; }}
          >
            Sign in to existing account
          </Link>

          <p style={{ textAlign: "center", color: "#484f58", fontSize: "0.75rem", marginTop: "28px" }}>
            By continuing, you agree to NexusBank's Terms of Service
          </p>
        </div>
      </div>
    </div>
  );
}
