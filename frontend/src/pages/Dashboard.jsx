import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { API, formatINR } from "../api";
import Modal from "../components/Modal";

export default function Dashboard() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [accounts, setAccounts]   = useState([]);
  const [summary, setSummary]     = useState(null);
  const [txHistory, setTxHistory] = useState([]);
  const [activeLoans, setActiveLoans] = useState([]);
  const [loading, setLoading]     = useState(true);
  
  // Modal state
  const [topupModal, setTopupModal] = useState({ isOpen: false, accountId: null, amount: "" });
  const [submitting, setSubmitting] = useState(false);

  // Error boundary state
  const [pageError, setPageError] = useState(false);

  const load = async () => {
    setPageError(false);
    try {
      const [accRes, sumRes, loanRes] = await Promise.all([
        API.account.get(`/accounts/user/${user.id}`),
        API.report.get(`/reports/summary/${user.id}`),
        API.loan.get(`/loans/user/${user.id}`)
      ]);
      setAccounts(accRes.data.accounts || []);
      setSummary(sumRes.data.summary);
      setTxHistory(sumRes.data.summary?.recentTransactions || []);
      setActiveLoans((loanRes.data.loans || []).filter(l => l.status === 'APPROVED'));
    } catch (err) {
      console.error("Dashboard load error", err);
      setPageError(true);
      addToast("Failed to load dashboard data. Please retry later.", "error");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const handleTopup = async (e) => {
    e.preventDefault();
    if (!topupModal.amount || Number(topupModal.amount) <= 0) {
      return addToast("Please enter a valid amount greater than 0.", "error");
    }

    setSubmitting(true);
    try {
      await API.account.post(`/accounts/${topupModal.accountId}/topup`, { amount: Number(topupModal.amount) });
      addToast(`Successfully topped up ${formatINR(topupModal.amount)}!`, "success");
      setTopupModal({ isOpen: false, accountId: null, amount: "" });
      const res = await API.account.get(`/accounts/user/${user.id}`);
      setAccounts(res.data.accounts || []);
    } catch (err) {
      addToast(err.response?.data?.error?.message || "Top-up failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="app-container" style={{ padding: "40px" }}>
        <h2 style={{ color: "#fff", marginBottom: "20px" }}>Loading Dashboard...</h2>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="app-container empty-state">
        <div className="empty-icon">⚠️</div>
        <h3>Disconnected</h3>
        <p className="empty-text">We couldn't reach the banking servers.</p>
        <button onClick={() => { setLoading(true); load(); }} style={{ maxWidth: "200px", margin: "20px auto" }}>
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ padding: "40px", maxWidth: "1200px", margin: "0 auto", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "32px", borderBottom: "1px solid #2d3748", paddingBottom: "20px" }}>
        <div>
          <h1 style={{ margin: "0 0 8px", fontSize: "2.2rem", fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>Dashboard</h1>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "1.1rem" }}>
            Welcome back, <strong style={{ color: "#e2e8f0" }}>{user?.username}</strong>
          </p>
        </div>
        <div style={{ padding: "10px 20px", background: "#1e2535", borderRadius: "30px", border: "1px solid #2d3748", display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }}></div>
          <span style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 600 }}>SYSTEM SECURE</span>
        </div>
      </div>

      {summary && typeof summary.totalBalance !== 'undefined' && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", marginBottom: "40px" }}>
          <div style={{ background: "linear-gradient(135deg, #161b27 0%, #1a202c 100%)", borderRadius: "16px", padding: "24px", border: "1px solid #2d3748", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "linear-gradient(90deg, #3b82f6, #8b5cf6)" }}></div>
            <div style={{ fontSize: "0.9rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Total Balance</div>
            <div style={{ fontSize: "2.4rem", fontWeight: 700, color: "#fff", letterSpacing: "-0.03em" }}>{formatINR(summary.totalBalance)}</div>
          </div>
          <div style={{ background: "#161b27", borderRadius: "16px", padding: "24px", border: "1px solid #2d3748" }}>
            <div style={{ fontSize: "0.9rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Total Received</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 600, color: "#10b981" }}>+{formatINR(summary.totalCredits)}</div>
          </div>
          <div style={{ background: "#161b27", borderRadius: "16px", padding: "24px", border: "1px solid #2d3748" }}>
            <div style={{ fontSize: "0.9rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Total Sent</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 600, color: "#ef4444" }}>-{formatINR(summary.totalDebits)}</div>
          </div>
          <div style={{ background: "#161b27", borderRadius: "16px", padding: "24px", border: "1px solid #2d3748" }}>
            <div style={{ fontSize: "0.9rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Active Loans</div>
            <div style={{ fontSize: "1.8rem", fontWeight: 600, color: "#fff" }}>{summary.activeLoanCount}</div>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: "1.3rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "16px" }}>My Accounts</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "24px", marginBottom: "40px" }}>
        {accounts.map(acc => (
          <div key={acc.id} style={{ 
            background: "linear-gradient(180deg, #1e2535 0%, #161b27 100%)", borderRadius: "16px", padding: "24px", 
            border: "1px solid #2d3748", boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)", position: "relative"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <span style={{ background: "#3b82f622", color: "#60a5fa", padding: "4px 10px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.05em" }}>{acc.account_type}</span>
              <span style={{ background: "#2d3748", padding: "4px 8px", borderRadius: "6px", fontSize: "0.8rem", color: "#94a3b8", fontFamily: "monospace" }}>ID: {acc.id}</span>
            </div>
            <div style={{ fontSize: "1.1rem", color: "#94a3b8", marginBottom: "4px", letterSpacing: "0.1em" }}>{acc.account_number}</div>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: "#fff", marginBottom: "24px" }}>{formatINR(acc.balance)}</div>
            <button 
              onClick={() => setTopupModal({ isOpen: true, accountId: acc.id, amount: "" })}
              style={{ width: "100%", padding: "12px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer", transition: "background 0.2s" }}
              onMouseOver={e => e.target.style.background = "#2563eb"}
              onMouseOut={e => e.target.style.background = "#3b82f6"}
            >
              + Top Up Funds
            </button>
          </div>
        ))}
      </div>

      {activeLoans.length > 0 && (
        <div style={{ marginBottom: "40px" }}>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "16px" }}>Active Loans</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "24px" }}>
            {activeLoans.map(loan => (
              <div key={loan.id} style={{ 
                background: "#161b27", borderRadius: "16px", padding: "24px", 
                border: "1px solid #2d3748", borderLeft: "4px solid #8b5cf6"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <span style={{ color: "#a78bfa", fontWeight: 600 }}>Loan Principal</span>
                  <span style={{ background: "#8b5cf622", color: "#a78bfa", padding: "4px 10px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700 }}>{loan.status}</span>
                </div>
                <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#fff", marginBottom: "12px" }}>{formatINR(loan.amount)}</div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "0.9rem" }}>
                  <span>{loan.tenure_months} Months • {Number(loan.interest_rate)}% APR</span>
                  <span style={{ color: "#e2e8f0", fontWeight: 600 }}>EMI: {formatINR(loan.emi_amount)}/mo</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 style={{ fontSize: "1.3rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "16px" }}>Recent Transactions</h2>
      <div style={{ background: "#161b27", borderRadius: "16px", border: "1px solid #2d3748", overflow: "hidden" }}>
        {txHistory.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>No recent transactions to display.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#1e2535" }}>
              <tr>
                {["Ref ID", "From", "To", "Amount", "Status", "Date"].map(h => (
                  <th key={h} style={{ padding: "16px 20px", textAlign: "left", fontSize: "0.75rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #2d3748" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txHistory.map((tx, i) => {
                const isDebit = tx.from_account_id != null && tx.from_account_id === accounts[0]?.id;
                return (
                  <tr key={tx.id} style={{ borderBottom: i < txHistory.length - 1 ? "1px solid #1e2535" : "none" }}>
                    <td style={{ padding: "16px 20px", color: "#64748b", fontFamily: "monospace", fontSize: "0.85rem" }}>{tx.id.substring(0,8)}...</td>
                    <td style={{ padding: "16px 20px", color: "#e2e8f0" }}>{tx.from_account_id == null ? <span style={{ color: "#10b981", fontSize: "0.75rem", fontWeight: 700, padding: "2px 8px", background: "#10b98122", borderRadius: "12px" }}>SYSTEM</span> : tx.from_account_number}</td>
                    <td style={{ padding: "16px 20px", color: "#e2e8f0" }}>{tx.to_account_number}</td>
                    <td style={{ padding: "16px 20px", color: isDebit ? "#ef4444" : "#10b981", fontWeight: 600, fontSize: "1.05rem" }}>
                      {isDebit ? "-" : "+"}{formatINR(tx.amount)}
                    </td>
                    <td style={{ padding: "16px 20px" }}>
                      <span style={{ 
                        padding: "4px 10px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700,
                        background: tx.status === 'SUCCESS' ? "#10b98122" : tx.status === 'FAILED' ? "#ef444422" : tx.status === 'FLAGGED' ? "#e11d4822" : "#f59e0b22",
                        color: tx.status === 'SUCCESS' ? "#10b981" : tx.status === 'FAILED' ? "#ef4444" : tx.status === 'FLAGGED' ? "#e11d48" : "#f59e0b"
                      }}>{tx.status}</span>
                    </td>
                    <td style={{ padding: "16px 20px", color: "#94a3b8", fontSize: "0.85rem" }}>{new Date(tx.created_at).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={topupModal.isOpen} onClose={() => setTopupModal({ ...topupModal, isOpen: false })} title="Top Up Account">
        <form onSubmit={handleTopup}>
          <div className="input-group">
            <label style={{ color: "#e2e8f0", fontSize: "0.9rem", fontWeight: 500, marginBottom: "8px", display: "block" }}>Amount (₹)</label>
            <input 
              type="number" min="1" step="1" required autoFocus placeholder="e.g. 5000"
              style={{ width: "100%", padding: "12px", background: "#0f1117", border: "1px solid #2d3748", borderRadius: "8px", color: "#fff", fontSize: "1rem", outline: "none" }}
              value={topupModal.amount} onChange={e => setTopupModal({ ...topupModal, amount: e.target.value })} 
            />
          </div>
          <button type="submit" disabled={submitting} style={{ 
            width: "100%", padding: "14px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px", 
            fontWeight: 600, fontSize: "1rem", cursor: submitting ? "not-allowed" : "pointer", marginTop: "20px", opacity: submitting ? 0.7 : 1
          }}>
            {submitting ? "Processing..." : "Confirm Top Up"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
