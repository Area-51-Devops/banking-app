import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { API, formatINR } from "../api";

const TABS = [
  { id: "overview",  label: "📊 Overview" },
  { id: "fraud",     label: "🛡️ Fraud Review" },
  { id: "loans",     label: "💼 Loan Management" },
  { id: "users",     label: "👥 User Management" },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [activeTab, setActiveTab]       = useState("overview");
  const [loans, setLoans]               = useState([]);
  const [users, setUsers]               = useState([]);
  const [pagination, setPagination]     = useState({ page: 1, pages: 0, total: 0 });
  const [loanFilter, setLoanFilter]     = useState("ALL");
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [usernameCache, setUsernameCache] = useState({});
  const [flaggedTxs, setFlaggedTxs]     = useState([]);
  const [flaggedPagination, setFlaggedPagination] = useState({ page: 1, pages: 0, total: 0 });
  const [loadingFlagged, setLoadingFlagged] = useState(false);
  const [stats, setStats]               = useState({ total: 0, pending: 0, approved: 0, rejected: 0, fraudPending: 0 });

  // ── Fetch Flagged Transactions ──────────────────────────────────────────
  const fetchFlaggedTxs = useCallback(async (page = 1) => {
    setLoadingFlagged(true);
    try {
      const r = await API.tx.get(`/transactions/flagged?page=${page}&limit=15`);
      setFlaggedTxs(r.data.transactions || []);
      setFlaggedPagination({
        page: r.data.pagination.page,
        pages: r.data.pagination.pages,
        total: r.data.pagination.total,
      });

      // Resolve missing usernames without joining tables
      const missing = [...new Set((r.data.transactions || []).map(t => t.from_user_id))].filter(id => id && !usernameCache[id]);
      if (missing.length > 0) {
        const newCache = { ...usernameCache };
        await Promise.all(missing.map(async id => {
          try {
            const res = await API.user.get(`/users/${id}`);
            newCache[id] = res.data.user.username;
          } catch {
            newCache[id] = `User #${id}`;
          }
        }));
        setUsernameCache(prev => ({...prev, ...newCache}));
      }
    } catch (err) {
      addToast(err.response?.data?.error?.message || "Failed to fetch flagged transactions", "error");
    } finally {
      setLoadingFlagged(false);
    }
  }, [usernameCache, addToast]);

  // ── Fetch all loans (paginated + filtered) ──────────────────────────────
  const fetchLoans = useCallback(async (page = 1, filter = loanFilter) => {
    setLoadingLoans(true);
    try {
      const statusParam = filter !== "ALL" ? `&status=${filter}` : "";
      const r = await API.loan.get(`/loans/all?page=${page}&limit=15${statusParam}`);
      const fetchedLoans = r.data.loans || [];
      setLoans(fetchedLoans);
      setPagination({
        page: r.data.pagination.page,
        pages: r.data.pagination.pages,
        total: r.data.pagination.total,
      });

      // Resolve missing usernames without joining tables
      const missing = [...new Set(fetchedLoans.map(l => l.user_id))].filter(id => !usernameCache[id]);
      if (missing.length > 0) {
        const newCache = { ...usernameCache };
        await Promise.all(missing.map(async id => {
          try {
            const res = await API.user.get(`/users/${id}`);
            newCache[id] = res.data.user.username;
          } catch {
            newCache[id] = `User #${id}`;
          }
        }));
        setUsernameCache(newCache);
      }
    } catch (err) {
      addToast(err.response?.data?.error?.message || "Failed to fetch loans", "error");
    } finally {
      setLoadingLoans(false);
    }
  }, [loanFilter, usernameCache, addToast]);

  // ── Fetch stats from all-loans endpoint ────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const [all, pending, approved, rejected, fraud] = await Promise.all([
        API.loan.get("/loans/all?limit=1"),
        API.loan.get("/loans/all?limit=1&status=PENDING"),
        API.loan.get("/loans/all?limit=1&status=APPROVED"),
        API.loan.get("/loans/all?limit=1&status=REJECTED"),
        API.tx.get("/transactions/flagged?limit=1"),
      ]);
      setStats({
        total:    all.data.pagination.total,
        pending:  pending.data.pagination.total,
        approved: approved.data.pagination.total,
        rejected: rejected.data.pagination.total,
        fraudPending: fraud.data.pagination.total,
      });
    } catch { /* stats are non-critical */ }
  }, []);

  // ── Fetch users ─────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    // We filter using the user list from the loan cache + direct calls; iterate pages
    // Since no dedicated /users endpoint exists, we show cached users from loan resolution
    // and note their IDs
    setLoadingUsers(false);
  }, []);

  useEffect(() => {
    if (activeTab === "overview") fetchStats();
    if (activeTab === "fraud") fetchFlaggedTxs(1);
    if (activeTab === "loans") fetchLoans(1, loanFilter);
    if (activeTab === "users") fetchUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "loans") fetchLoans(1, loanFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanFilter]);

  // ── Approve / Reject ────────────────────────────────────────────────────
  const handleStatusChange = async (loanId, newStatus) => {
    setActionLoading(`loan-${loanId}`);
    try {
      await API.loan.patch(`/loans/${loanId}/status`, { status: newStatus });
      addToast(`Loan #${loanId} ${newStatus.toLowerCase()} successfully.`, "success");
      setLoans(prev => prev.map(l => l.id === loanId ? { ...l, status: newStatus } : l));
      fetchStats();
    } catch (err) {
      addToast(err.response?.data?.error?.message || "Failed to update loan.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleFraudStatusChange = async (txId, newStatus) => {
    setActionLoading(`fraud-${txId}`);
    try {
      await API.tx.patch(`/transactions/${txId}/fraud-status`, { status: newStatus });
      addToast(`Transaction ${newStatus.toLowerCase()} successfully. User notified.`, "success");
      setFlaggedTxs(prev => prev.filter(t => t.id !== txId));
      fetchStats();
    } catch (err) {
      addToast(err.response?.data?.error?.message || "Failed to update fraud status.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = () => { logout(); };

  // ── STATUS badge colour helper ──────────────────────────────────────────
  const statusColor = { PENDING: "#f59e0b", APPROVED: "#10b981", REJECTED: "#ef4444" };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f1117", color: "#e2e8f0", fontFamily: "'Inter', sans-serif" }}>

      {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
      <aside style={{
        width: "240px", flexShrink: 0, background: "#161b27",
        borderRight: "1px solid #2d3748", display: "flex", flexDirection: "column"
      }}>
        <div style={{ padding: "28px 20px 20px", borderBottom: "1px solid #2d3748" }}>
          <div style={{ fontSize: "24px", marginBottom: "4px" }}>🏦</div>
          <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#fff" }}>NexusBank</div>
          <div style={{
            marginTop: "4px", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.08em",
            color: "#7c3aed", background: "#2e1065", padding: "2px 8px", borderRadius: "20px",
            display: "inline-block"
          }}>ADMIN PORTAL</div>
        </div>

        <nav style={{ flex: 1, padding: "16px 12px" }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "10px 14px", marginBottom: "4px", borderRadius: "8px", border: "none",
              background: activeTab === tab.id ? "#7c3aed22" : "transparent",
              color: activeTab === tab.id ? "#a78bfa" : "#94a3b8",
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontSize: "0.9rem", cursor: "pointer",
              borderLeft: activeTab === tab.id ? "3px solid #7c3aed" : "3px solid transparent",
              transition: "all 0.15s"
            }}>
              {tab.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: "16px", borderTop: "1px solid #2d3748" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "50%", background: "#7c3aed",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, color: "#fff"
            }}>
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#fff" }}>{user?.username}</div>
              <div style={{ fontSize: "0.7rem", color: "#7c3aed" }}>Administrator</div>
            </div>
          </div>
          <button onClick={handleLogout} style={{
            width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ef444455",
            background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: "0.85rem",
            transition: "background 0.15s"
          }}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ────────────────────────────────────────────── */}
      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>

        {/* ── OVERVIEW TAB ───────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div>
            <h1 style={{ margin: "0 0 8px", fontSize: "1.6rem", fontWeight: 700, color: "#fff" }}>Admin Overview</h1>
            <p style={{ margin: "0 0 32px", color: "#64748b" }}>System-wide loan statistics at a glance.</p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px", marginBottom: "40px" }}>
              {[
                { label: "Total Applications", value: stats.total,    color: "#7c3aed", icon: "📋" },
                { label: "Pending Loans",      value: stats.pending,  color: "#f59e0b", icon: "⏳" },
                { label: "Approved Loans",     value: stats.approved, color: "#10b981", icon: "✅" },
                { label: "Rejected Loans",     value: stats.rejected, color: "#ef4444", icon: "❌" },
                { label: "Fraud Review",       value: stats.fraudPending, color: "#e11d48", icon: "🛡️" },
              ].map(s => (
                <div key={s.label} style={{
                  background: "#161b27", border: "1px solid #2d3748", borderRadius: "12px",
                  padding: "20px", borderTop: `3px solid ${s.color}`
                }}>
                  <div style={{ fontSize: "1.6rem", marginBottom: "8px" }}>{s.icon}</div>
                  <div style={{ fontSize: "2rem", fontWeight: 700, color: "#fff" }}>{s.value}</div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "4px" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{
              background: "#161b27", border: "1px solid #2d3748", borderRadius: "12px", padding: "24px"
            }}>
              <h3 style={{ margin: "0 0 12px", color: "#a78bfa" }}>Quick Actions</h3>
              <p style={{ color: "#64748b", margin: "0 0 16px" }}>
                Jump directly to pending items that need your review.
              </p>
              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={() => { setLoanFilter("PENDING"); setActiveTab("loans"); }} style={{
                  padding: "10px 20px", borderRadius: "8px", background: "#7c3aed",
                  border: "none", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem"
                }}>
                  Review {stats.pending} Pending Loan{stats.pending !== 1 ? "s" : ""} →
                </button>
                <button onClick={() => { setActiveTab("fraud"); }} style={{
                  padding: "10px 20px", borderRadius: "8px", background: "#e11d48",
                  border: "none", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem"
                }}>
                  {stats.fraudPending} Fraud Alert{stats.fraudPending !== 1 ? "s" : ""} →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── FRAUD REVIEW TAB ──────────────────────────────────────────── */}
        {activeTab === "fraud" && (
          <div>
            <h1 style={{ margin: "0 0 8px", fontSize: "1.6rem", fontWeight: 700, color: "#fff" }}>Fraud Review Dashboard</h1>
            <p style={{ margin: "0 0 24px", color: "#64748b" }}>Transactions flagged by the automated anti-fraud engine.</p>

            <div style={{ background: "#161b27", border: "1px solid #2d3748", borderRadius: "12px", overflow: "hidden" }}>
              {loadingFlagged ? (
                <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>Loading transactions...</div>
              ) : flaggedTxs.length === 0 ? (
                <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>🛡️</div>
                  No completely pending flagged transactions. Good job!
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #2d3748" }}>
                      {["TX ID", "Sender", "From Acc", "Amount", "Flagged On", "Actions"].map(h => (
                        <th key={h} style={{ padding: "14px 16px", textAlign: "left", fontSize: "0.75rem", color: "#64748b", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {flaggedTxs.map((tx, i) => (
                      <tr key={tx.id} style={{ borderBottom: i < flaggedTxs.length - 1 ? "1px solid #1e2535" : "none" }}>
                        <td style={{ padding: "14px 16px", color: "#e11d48", fontWeight: 600, fontSize: "0.85rem" }}>#{tx.id}</td>
                        <td style={{ padding: "14px 16px", fontWeight: 600, color: "#e2e8f0" }}>{usernameCache[tx.from_user_id] || "..."}</td>
                        <td style={{ padding: "14px 16px", color: "#94a3b8" }}>ID: {tx.from_account_id}</td>
                        <td style={{ padding: "14px 16px", color: "#f87171", fontWeight: 700, fontSize: "1.1rem" }}>{formatINR(tx.amount)}</td>
                        <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "0.85rem" }}>{new Date(tx.created_at).toLocaleString("en-IN")}</td>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              disabled={actionLoading === `fraud-${tx.id}`}
                              onClick={() => handleFraudStatusChange(tx.id, "APPROVED")}
                              style={{
                                padding: "5px 14px", borderRadius: "6px", border: "1px solid #10b981",
                                background: "#10b98122", color: "#10b981", cursor: "pointer",
                                fontSize: "0.82rem", fontWeight: 600, opacity: actionLoading === `fraud-${tx.id}` ? 0.5 : 1
                              }}>
                              {actionLoading === `fraud-${tx.id}` ? "..." : "Approve (Clean)"}
                            </button>
                            <button
                              disabled={actionLoading === `fraud-${tx.id}`}
                              onClick={() => handleFraudStatusChange(tx.id, "REJECTED")}
                              style={{
                                padding: "5px 14px", borderRadius: "6px", border: "1px solid #e11d48",
                                background: "#e11d4822", color: "#e11d48", cursor: "pointer",
                                fontSize: "0.82rem", fontWeight: 600, opacity: actionLoading === `fraud-${tx.id}` ? 0.5 : 1
                              }}>
                              Reject (Fraud)
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            {/* Pagination for flagged */}
            {!loadingFlagged && flaggedPagination.pages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "20px", alignItems: "center" }}>
                <button
                  disabled={flaggedPagination.page <= 1}
                  onClick={() => fetchFlaggedTxs(flaggedPagination.page - 1)}
                  style={{
                    padding: "7px 18px", borderRadius: "6px", border: "1px solid #2d3748",
                    background: flaggedPagination.page <= 1 ? "#1e2535" : "#2d3748",
                    color: flaggedPagination.page <= 1 ? "#374151" : "#e2e8f0", cursor: flaggedPagination.page <= 1 ? "not-allowed" : "pointer"
                  }}>← Prev</button>
                <span style={{ color: "#64748b", fontSize: "0.85rem" }}>Page {flaggedPagination.page} of {flaggedPagination.pages}</span>
                <button
                  disabled={flaggedPagination.page >= flaggedPagination.pages}
                  onClick={() => fetchFlaggedTxs(flaggedPagination.page + 1)}
                  style={{
                    padding: "7px 18px", borderRadius: "6px", border: "1px solid #2d3748",
                    background: flaggedPagination.page >= flaggedPagination.pages ? "#1e2535" : "#2d3748",
                    color: flaggedPagination.page >= flaggedPagination.pages ? "#374151" : "#e2e8f0", cursor: flaggedPagination.page >= flaggedPagination.pages ? "not-allowed" : "pointer"
                  }}>Next →</button>
              </div>
            )}
          </div>
        )}

        {/* ── LOANS TAB ──────────────────────────────────────────── */}
        {activeTab === "loans" && (
          <div>
            <h1 style={{ margin: "0 0 8px", fontSize: "1.6rem", fontWeight: 700, color: "#fff" }}>Loan Management</h1>
            <p style={{ margin: "0 0 24px", color: "#64748b" }}>Review, approve, or reject customer loan applications.</p>

            {/* Filters */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
              {["ALL", "PENDING", "APPROVED", "REJECTED"].map(f => (
                <button key={f} onClick={() => setLoanFilter(f)} style={{
                  padding: "6px 16px", borderRadius: "20px", border: "1px solid",
                  borderColor: loanFilter === f ? "#7c3aed" : "#2d3748",
                  background: loanFilter === f ? "#7c3aed22" : "transparent",
                  color: loanFilter === f ? "#a78bfa" : "#64748b",
                  cursor: "pointer", fontSize: "0.85rem", fontWeight: loanFilter === f ? 600 : 400
                }}>
                  {f}
                </button>
              ))}
            </div>

            {/* Table */}
            <div style={{ background: "#161b27", border: "1px solid #2d3748", borderRadius: "12px", overflow: "hidden" }}>
              {loadingLoans ? (
                <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>Loading loan data...</div>
              ) : loans.length === 0 ? (
                <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>📂</div>
                  No loan applications match this filter.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #2d3748" }}>
                      {["ID", "Applicant", "Amount", "EMI", "Tenure", "Applied On", "Status", "Actions"].map(h => (
                        <th key={h} style={{ padding: "14px 16px", textAlign: "left", fontSize: "0.75rem", color: "#64748b", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((loan, i) => (
                      <tr key={loan.id} style={{ borderBottom: i < loans.length - 1 ? "1px solid #1e2535" : "none" }}>
                        <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "0.85rem" }}>#{loan.id}</td>
                        <td style={{ padding: "14px 16px", fontWeight: 600, color: "#e2e8f0" }}>{usernameCache[loan.user_id] || "..."}</td>
                        <td style={{ padding: "14px 16px", color: "#a78bfa", fontWeight: 600 }}>{formatINR(loan.amount)}</td>
                        <td style={{ padding: "14px 16px", color: "#94a3b8" }}>{formatINR(loan.emi_amount)}/mo</td>
                        <td style={{ padding: "14px 16px", color: "#94a3b8" }}>{loan.tenure_months}m @ {Number(loan.interest_rate)}%</td>
                        <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "0.85rem" }}>{new Date(loan.created_at).toLocaleDateString("en-IN")}</td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{
                            padding: "3px 10px", borderRadius: "12px", fontSize: "0.78rem", fontWeight: 600,
                            background: `${statusColor[loan.status]}22`,
                            color: statusColor[loan.status]
                          }}>
                            {loan.status}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          {loan.status === "PENDING" ? (
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                disabled={actionLoading === `loan-${loan.id}`}
                                onClick={() => handleStatusChange(loan.id, "APPROVED")}
                                style={{
                                  padding: "5px 14px", borderRadius: "6px", border: "1px solid #10b981",
                                  background: "#10b98122", color: "#10b981", cursor: "pointer",
                                  fontSize: "0.82rem", fontWeight: 600, opacity: actionLoading === `loan-${loan.id}` ? 0.5 : 1
                                }}>
                                {actionLoading === `loan-${loan.id}` ? "..." : "Approve"}
                              </button>
                              <button
                                disabled={actionLoading === `loan-${loan.id}`}
                                onClick={() => handleStatusChange(loan.id, "REJECTED")}
                                style={{
                                  padding: "5px 14px", borderRadius: "6px", border: "1px solid #ef4444",
                                  background: "#ef444422", color: "#ef4444", cursor: "pointer",
                                  fontSize: "0.82rem", fontWeight: 600, opacity: actionLoading === `loan-${loan.id}` ? 0.5 : 1
                                }}>
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: "#374151", fontSize: "0.85rem" }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {!loadingLoans && pagination.pages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginTop: "20px", alignItems: "center" }}>
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => fetchLoans(pagination.page - 1, loanFilter)}
                  style={{
                    padding: "7px 18px", borderRadius: "6px", border: "1px solid #2d3748",
                    background: pagination.page <= 1 ? "#1e2535" : "#2d3748",
                    color: pagination.page <= 1 ? "#374151" : "#e2e8f0", cursor: pagination.page <= 1 ? "not-allowed" : "pointer"
                  }}>← Prev</button>
                <span style={{ color: "#64748b", fontSize: "0.85rem" }}>Page {pagination.page} of {pagination.pages} ({pagination.total} total)</span>
                <button
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => fetchLoans(pagination.page + 1, loanFilter)}
                  style={{
                    padding: "7px 18px", borderRadius: "6px", border: "1px solid #2d3748",
                    background: pagination.page >= pagination.pages ? "#1e2535" : "#2d3748",
                    color: pagination.page >= pagination.pages ? "#374151" : "#e2e8f0", cursor: pagination.page >= pagination.pages ? "not-allowed" : "pointer"
                  }}>Next →</button>
              </div>
            )}
          </div>
        )}

        {/* ── USERS TAB ──────────────────────────────────────────── */}
        {activeTab === "users" && (
          <div>
            <h1 style={{ margin: "0 0 8px", fontSize: "1.6rem", fontWeight: 700, color: "#fff" }}>User Management</h1>
            <p style={{ margin: "0 0 24px", color: "#64748b" }}>View all registered users resolved from loan applications.</p>

            {Object.keys(usernameCache).length === 0 ? (
              <div style={{
                background: "#161b27", border: "1px solid #2d3748", borderRadius: "12px",
                padding: "60px", textAlign: "center", color: "#64748b"
              }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>👥</div>
                <p>No user data yet. Visit Loan Management first to load applicant data.</p>
                <button onClick={() => setActiveTab("loans")} style={{
                  marginTop: "12px", padding: "9px 20px", borderRadius: "8px",
                  background: "#7c3aed", border: "none", color: "#fff", cursor: "pointer", fontWeight: 600
                }}>Go to Loan Management</button>
              </div>
            ) : (
              <div style={{ background: "#161b27", border: "1px solid #2d3748", borderRadius: "12px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #2d3748" }}>
                      {["User ID", "Username", "Has Loans"].map(h => (
                        <th key={h} style={{ padding: "14px 16px", textAlign: "left", fontSize: "0.75rem", color: "#64748b", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(usernameCache).map(([id, name], i) => (
                      <tr key={id} style={{ borderBottom: i < Object.keys(usernameCache).length - 1 ? "1px solid #1e2535" : "none" }}>
                        <td style={{ padding: "14px 16px", color: "#64748b" }}>#{id}</td>
                        <td style={{ padding: "14px 16px", fontWeight: 600, color: "#e2e8f0" }}>{name}</td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ color: "#10b981", fontWeight: 600, fontSize: "0.85rem" }}>
                            {loans.filter(l => String(l.user_id) === String(id)).length} loan(s)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
