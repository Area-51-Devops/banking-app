import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { API, formatINR } from "../api";
import { v4 as uuidv4 } from "uuid";

const BILLER_ICONS = { ELECTRICITY: "⚡", WATER: "💧", BROADBAND: "🌐", GAS: "🔥" };

export default function BillPay() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [billers, setBillers]     = useState([]);
  const [accounts, setAccounts]   = useState([]);
  const [history, setHistory]     = useState([]);
  const [form, setForm]           = useState({ accountId: "", billerCode: "", amount: "" });
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      API.payment.get("/billers"),
      API.account.get(`/accounts/user/${user.id}`),
      API.payment.get(`/payments/user/${user.id}`)
    ]).then(([b, a, p]) => {
      setBillers(b.data.billers || []);
      const accs = a.data.accounts || [];
      setAccounts(accs);
      if (accs.length > 0) setForm(f => ({ ...f, accountId: String(accs[0].id) }));
      setHistory(p.data.payments || []);
    }).catch(() => {
        addToast("Failed to fetch biller metadata.", "error");
    });
  }, [user, addToast]);

  const submit = async (e) => {
    e.preventDefault();

    if (!form.billerCode) return addToast("Please select a biller from the grid.", "error");
    if (Number(form.amount) <= 0) return addToast("Payment amount must be greater than zero.", "error");

    setLoading(true);
    try {
      const idemKey = uuidv4();
      const { data } = await API.payment.post("/pay-bill",
        { accountId: Number(form.accountId), billerCode: form.billerCode, amount: Number(form.amount) },
        { headers: { "idempotency-key": idemKey } }
      );
      addToast(`✅ Payment to ${data.billerName} of ${formatINR(form.amount)} completed!`, "success");
      
      setForm({ ...form, amount: "", billerCode: "" });

      // Refresh balances and history
      const [p, a] = await Promise.all([
        API.payment.get(`/payments/user/${user.id}`),
        API.account.get(`/accounts/user/${user.id}`)
      ]);
      setHistory(p.data.payments || []);
      setAccounts(a.data.accounts || []);
    } catch (err) {
      addToast(err.response?.data?.error?.message || "Bill payment failed to process.", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="app-container">
      <div className="page-header">
        <h1>Bill Payments</h1>
        <p className="text-muted">Pay your utility bills instantly</p>
      </div>

      {/* Biller Grid */}
      <div className="biller-grid" style={{ marginBottom: "32px" }}>
        {billers.map(b => (
          <div key={b.code}
            className={`biller-card surface-card ${form.billerCode === b.code ? "biller-selected" : ""}`}
            onClick={() => setForm({ ...form, billerCode: b.code })}>
            <div className="biller-icon">{BILLER_ICONS[b.code] || "🏢"}</div>
            <div className="biller-name">{b.name}</div>
          </div>
        ))}
        {billers.length === 0 && <p className="text-muted">Loading billers...</p>}
      </div>

      <div className="grid two-col">
        <div className="surface-card">
          <h3>Pay Bill</h3>
          <form onSubmit={submit}>
            <div className="input-group">
              <label>Pay From</label>
              <select id="pay-from" value={form.accountId}
                onChange={e => setForm({ ...form, accountId: e.target.value })}>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.account_number} — {formatINR(a.balance)}
                  </option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>Biller</label>
              <div style={{ padding: "12px", border: "1px solid var(--border-subtle)", borderRadius: "6px", background: "var(--bg-surface)", color: "var(--text-main)" }}>
                {form.billerCode ? billers.find(b => b.code === form.billerCode)?.name || "Selected" : "— Select a biller from above —"}
              </div>
            </div>
            <div className="input-group">
              <label>Amount (₹)</label>
              <input id="pay-amount" type="number" min="1" step="0.01" required placeholder="e.g. 1500"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <button id="pay-submit" type="submit" disabled={loading || !form.billerCode}>
               {loading ? <><div className="spinner"></div> Processing...</> : "Pay Now"}
            </button>
          </form>
        </div>

        <div className="surface-card">
          <h3>Payment History</h3>
          {history.length === 0
            ? (
              <div className="empty-state">
                  <div className="empty-icon">🧾</div>
                  <div className="empty-text">No bill payments found.</div>
              </div>
            )
            : (
              <div className="table-container">
                <table>
                  <thead><tr><th>Biller</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {history.slice(0, 10).map(p => (
                      <tr key={p.id}>
                        <td>{p.biller_name}</td>
                        <td>{formatINR(p.amount)}</td>
                        <td><span className={`status-badge status-${p.status?.toLowerCase()}`}>{p.status}</span></td>
                        <td>{new Date(p.created_at).toLocaleDateString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
