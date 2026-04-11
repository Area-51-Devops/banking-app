import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { API, formatINR } from "../api";
import { v4 as uuidv4 } from "uuid";

export default function Transfer() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [accounts, setAccounts]   = useState([]);
  const [form, setForm]           = useState({ fromAccountId: "", toAccountId: "", amount: "" });
  const [loading, setLoading]     = useState(false);
  const [history, setHistory]     = useState([]);

  useEffect(() => {
    if (!user) return;
    API.account.get(`/accounts/user/${user.id}`)
      .then(r => {
        const accs = r.data.accounts || [];
        setAccounts(accs);
        if (accs.length > 0) setForm(f => ({ ...f, fromAccountId: String(accs[0].id) }));
      });
    API.tx.get(`/transactions?accountId=`).then(r => setHistory(r.data.transactions || [])).catch(() => {});
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();

    // Pre-flight validation
    if (form.fromAccountId === form.toAccountId) {
      return addToast("Cannot transfer to the same account.", "error");
    }
    if (Number(form.amount) <= 0) {
      return addToast("Amount must be greater than zero.", "error");
    }

    setLoading(true);
    try {
      const idemKey = uuidv4();
      const { data } = await API.tx.post("/transfer",
        {
          fromAccountId: Number(form.fromAccountId),
          toAccountId:   Number(form.toAccountId),
          amount:        Number(form.amount),
          userId:        user.id
        },
        { headers: { "idempotency-key": idemKey } }
      );
      
      if (data.status === "FLAGGED") {
        addToast(`⚠️ Transfer #${data.txId} is under fraud review`, "warn");
      } else {
        addToast(`✅ Transfer #${data.txId} completed successfully!`, "success");
      }
      setForm({ ...form, amount: "", toAccountId: "" }); // Reset specific fields

      // Refresh history quietly
      const accs = accounts.map(a => a.id);
      if (accs[0]) {
        API.tx.get(`/transactions?accountId=${accs[0]}`).then(r => setHistory(r.data.transactions || []));
      }
    } catch (err) {
      addToast(err.response?.data?.error?.message || "Transfer failed to process.", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="app-container">
      <div className="page-header">
        <h1>Transfer Money</h1>
        <p className="text-muted">Move funds instantly between accounts</p>
      </div>

      <div className="grid two-col">
        <div className="surface-card">
          <h3>New Transfer</h3>
          <form onSubmit={submit}>
            <div className="input-group">
              <label>From Account</label>
              <select id="transfer-from" value={form.fromAccountId}
                onChange={e => setForm({ ...form, fromAccountId: e.target.value })}>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.account_number} — {formatINR(a.balance)}
                  </option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>To Account ID</label>
              <input id="transfer-to" type="number" required placeholder="Recipient account ID"
                value={form.toAccountId}
                onChange={e => setForm({ ...form, toAccountId: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Amount (₹)</label>
              <input id="transfer-amount" type="number" min="1" step="0.01" required
                placeholder="e.g. 5000"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <button id="transfer-submit" type="submit" disabled={loading}>
              {loading ? <><div className="spinner"></div> Executing Transaction...</> : "Send Money"}
            </button>
          </form>
        </div>

        <div className="surface-card">
          <h3>Transaction History</h3>
          {history.length === 0
            ? (
              <div className="empty-state">
                  <div className="empty-icon">💸</div>
                  <div className="empty-text">No outgoing transactions yet.</div>
              </div>
            )
            : (
              <div className="table-container">
                <table>
                  <thead><tr><th>#</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {history.slice(0, 10).map(tx => (
                      <tr key={tx.id}>
                        <td>{tx.id}</td>
                        <td>{formatINR(tx.amount)}</td>
                        <td><span className={`status-badge status-${tx.status?.toLowerCase()}`}>{tx.status}</span></td>
                        <td>{new Date(tx.created_at).toLocaleDateString("en-IN")}</td>
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
