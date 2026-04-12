import { useAuth } from "../contexts/AuthContext";
import { useNavigate, NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { API } from "../api";

export default function Navbar() {
  const { user, logout, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  // Admin users have their own portal layout — no banking navbar needed
  if (isLoggedIn && user?.role === 'ADMIN') return null;

  useEffect(() => {
    if (!user) return;
    const poll = () => {
      API.notify.get(`/notifications/${user.id}`)
        .then(r => setUnread((r.data.notifications || []).filter(n => !n.is_read).length))
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [user]);

  const handleLogout = () => { logout(); setMenuOpen(false); };
  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className="navbar">
      <div className="nav-brand" onClick={() => navigate("/dashboard")}>
        <span className="nav-logo">🏦</span>
        <span className="nav-title">NexusBank</span>
      </div>
      {isLoggedIn && (
        <>
          <button className="mobile-toggle" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? "✕" : "☰"}
          </button>
          <div className={`nav-links ${menuOpen ? "open" : ""}`}>
            <NavLink to="/dashboard"     onClick={closeMenu} className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Dashboard</NavLink>
            <NavLink to="/transfer"      onClick={closeMenu} className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Transfer</NavLink>
            <NavLink to="/loans"         onClick={closeMenu} className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Loans</NavLink>
            <NavLink to="/bill-pay"      onClick={closeMenu} className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Bill Pay</NavLink>
            <NavLink to="/notifications" onClick={closeMenu} className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
              Notifications {unread > 0 && <span className="badge-count">{unread}</span>}
            </NavLink>
          </div>
          <div className="nav-user">
            <span className="nav-avatar">{user.username?.[0]?.toUpperCase()}</span>
            <button className="btn-logout" id="nav-logout" onClick={handleLogout}>Logout</button>
          </div>
        </>
      )}
    </nav>
  );
}
