import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { API } from "../api";

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(true);

  const load = async () => {
    try {
      const { data } = await API.notify.get(`/notifications/${user.id}`);
      setNotifications(data.notifications || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { if (user) load(); }, [user]);

  const markRead = async (id) => {
    try {
      await API.notify.patch(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await API.notify.patch(`/notifications/user/${user.id}/read-all`);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    } catch {}
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) return <div className="app-container"><p className="text-muted">Loading…</p></div>;

  return (
    <div className="app-container">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>Notifications
            {unreadCount > 0 && <span className="badge-count">{unreadCount}</span>}
          </h1>
          <p className="text-muted">Your account activity feed</p>
        </div>
        {unreadCount > 0 && (
          <button className="btn-secondary" id="mark-all-read" onClick={markAllRead}>
            Mark all read
          </button>
        )}
      </div>

      <div className="surface-card" style={{ padding: 0 }}>
        {notifications.length === 0
          ? <p className="text-muted empty-state" style={{ padding: "40px" }}>You're all caught up! 🎉</p>
          : notifications.map(n => (
            <div key={n.id}
              className={`notif-item ${n.is_read ? "notif-read" : "notif-unread"}`}
              onClick={() => !n.is_read && markRead(n.id)}>
              <div className="notif-icon">{getIcon(n.event_type)}</div>
              <div className="notif-body">
                <div className="notif-message">{n.message}</div>
                <div className="notif-time text-muted">
                  {new Date(n.created_at).toLocaleString("en-IN")}
                </div>
              </div>
              {!n.is_read && <div className="notif-dot" />}
            </div>
          ))}
      </div>
    </div>
  );
}

function getIcon(eventType) {
  const icons = {
    TransactionCompleted:    "✅",
    TransactionFlagged:      "⚠️",
    FraudRejected:           "🚫",
    FraudApproved:           "✅",
    LoanApplicationReceived: "📝",
    LoanApproved:            "🎉",
    LoanRejected:            "❌",
    PaymentCompleted:        "💳",
  };
  return icons[eventType] || "🔔";
}
