import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useToast } from "../contexts/ToastContext";
import { API } from "../api";

export default function Register() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [form, setForm]       = useState({ username: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      return addToast("Passwords do not match.", "error");
    }
    if (form.password.length < 6) {
      return addToast("Password must be at least 6 characters.", "error");
    }

    setLoading(true);
    try {
      await API.user.post("/users/register", { 
        username: form.username, 
        email: form.email, 
        password: form.password 
      });
      addToast("Account created successfully. Please login.", "success");
      navigate("/login");
    } catch (err) {
      addToast(err.response?.data?.error?.message || "Registration failed.", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-container">
      <div className="surface-card auth-card">
        <div className="auth-logo">🏦</div>
        <h2>Create Account</h2>
        <p className="auth-subtitle">Join NexusBank today</p>
        <form onSubmit={submit}>
          <div className="input-group">
            <label>Username</label>
            <input required autoFocus onChange={e => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="input-group">
            <label>Email Address</label>
            <input type="email" required onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="input-group">
            <label>Password</label>
            <input type="password" required onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="input-group">
            <label>Confirm Password</label>
            <input type="password" required onChange={e => setForm({ ...form, confirm: e.target.value })} />
          </div>
          <button type="submit" disabled={loading} style={{ marginTop: "12px" }}>
            {loading ? <><div className="spinner"></div> Creating...</> : "Sign Up"}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
