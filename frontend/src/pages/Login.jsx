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

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate("/dashboard");
    } catch (err) {
      addToast(err.response?.data?.error?.message || "Login failed. Please check credentials.", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-container">
      <div className="glass-card auth-card">
        <div className="auth-logo">🏦</div>
        <h2>Welcome Back</h2>
        <p className="auth-subtitle">Sign in to your banking account</p>
        <form onSubmit={submit}>
          <div className="input-group">
            <label>Username</label>
            <input id="login-username" required autoFocus
              onChange={e => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="input-group">
            <label>Password</label>
            <input id="login-password" type="password" required
              onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          <button id="login-submit" type="submit" disabled={loading} style={{ marginTop: "12px" }}>
             {loading ? <><div className="spinner"></div> Authenticating...</> : "Sign In"}
          </button>
        </form>
        <p className="auth-footer">
          New here? <Link to="/register">Open an account</Link>
        </p>
      </div>
    </div>
  );
}
