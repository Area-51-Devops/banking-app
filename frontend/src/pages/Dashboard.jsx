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
  const [loading, setLoading]     = useState(true);
  
  // Modal state
  const [topupModal, setTopupModal] = useState({ isOpen: false, accountId: null, amount: "" });
  const [submitting, setSubmitting] = useState(false);

  // Error boundary state
  const [pageError, setPageError] = useState(false);

  const load = async () => {
    setPageError(false);
    try {
      const [accRes, sumRes] = await Promise.all([
        API.account.get(`/accounts/user/${user.id}`),
        API.report.get(`/reports/summary/${user.id}`)
      ]);
      setAccounts(accRes.data.accounts || []);
      setSummary(sumRes.data.summary);
      setTxHistory(sumRes.data.summary?.recentTransactions || []);
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
      // Refresh accounts list quietly
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
      <div className="app-container">
        <div className="skeleton skeleton-title"></div>
        <div className="summary-strip glass-card" style={{ display: "flex", gap: "20px" }}>
           <div className="skeleton skeleton-text" style={{ flex: 1, height: "60px" }}></div>
           <div className="skeleton skeleton-text" style={{ flex: 1, height: "60px" }}></div>
           <div className="skeleton skeleton-text" style={{ flex: 1, height: "60px" }}></div>
        </div>
        <div className="grid"><div className="skeleton skeleton-card"></div></div>
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
    <div className="app-container">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="text-muted">Welcome back, <strong>{user?.username}</strong></p>
      </div>

      {sumResExists() && (
        <div className="summary-strip glass-card">
          <div className="summary-item">
            <span className="summary-label">Total Balance</span>
            <span className="summary-value balance-gradient">{formatINR(summary.totalBalance)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total Sent</span>
            <span className="summary-value text-danger">{formatINR(summary.totalDebits)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total Received</span>
            <span className="summary-value text-success">{formatINR(summary.totalCredits)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Active Loans</span>
            <span className="summary-value">{summary.activeLoanCount}</span>
          </div>
        </div>
      )}

      {/* Account Cards */}
      <h2 className="section-title">My Accounts</h2>
      <div className="grid">
        {accounts.map(acc => (
          <div key={acc.id} className="glass-card account-card">
            <div className="account-type-badge">{acc.account_type}</div>
            <div className="account-number">{acc.account_number}</div>
            <div className="balance-amount">{formatINR(acc.balance)}</div>
            <button className="btn-secondary" 
              onClick={() => setTopupModal({ isOpen: true, accountId: acc.id, amount: "" })}>
              + Top Up
            </button>
          </div>
        ))}
        {accounts.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🏦</div>
            <div className="empty-text">No accounts discovered.</div>
          </div>
        )}
      </div>

      <h2 className="section-title">Recent Transactions</h2>
      <div className="glass-card">
        {txHistory.length === 0
          ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <div className="empty-text">No recent transactions to display.</div>
            </div>
          )
          : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>From</th><th>To</th><th>Amount</th><th>Status</th><th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {txHistory.map(tx => (
                    <tr key={tx.id}>
                      <td>{tx.id}</td>
                      <td>{tx.from_account_id}</td>
                      <td>{tx.to_account_id}</td>
                      <td className={tx.from_account_id === accounts[0]?.id ? "text-danger" : "text-success"}>
                        {formatINR(tx.amount)}
                      </td>
                      <td><span className={`status-badge status-${tx.status?.toLowerCase()}`}>{tx.status}</span></td>
                      <td>{new Date(tx.created_at).toLocaleDateString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <Modal 
        isOpen={topupModal.isOpen} 
        onClose={() => setTopupModal({ ...topupModal, isOpen: false })}
        title="Top Up Account">
        <form onSubmit={handleTopup}>
          <div className="input-group">
            <label>Amount (₹)</label>
            <input 
              type="number" 
              min="1" 
              step="0.01" 
              required 
              autoFocus
              placeholder="e.g. 5000"
              value={topupModal.amount}
              onChange={e => setTopupModal({ ...topupModal, amount: e.target.value })} 
            />
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? <><div className="spinner"></div> Processing...</> : "Add Funds"}
          </button>
        </form>
      </Modal>
    </div>
  );

  function sumResExists() {
    return summary && typeof summary.totalBalance !== 'undefined';
  }
}
