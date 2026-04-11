import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { API, formatINR } from "../api";
import { v4 as uuidv4 } from "uuid";

export default function Transfer() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [accounts, setAccounts]     = useState([]);
  const [fromAccountId, setFromAccountId] = useState("");
  const [recipientInput, setRecipientInput] = useState("");   // what the user types (ACC...)
  const [resolvedRecipient, setResolvedRecipient] = useState(null); // { id, account_number, account_type }
  const [lookupState, setLookupState] = useState("idle"); // idle | loading | found | not_found
  const [amount, setAmount]           = useState("");
  const [loading, setLoading]         = useState(false);
  const [history, setHistory]         = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Stable ref so addToast never triggers infinite effect loops
  const addToastRef = useRef(addToast);
  useEffect(() => { addToastRef.current = addToast; });

  // Load own accounts on mount
  useEffect(() => {
    if (!user) return;
    API.account.get(`/accounts/user/${user.id}`)
      .then(r => {
        const accs = r.data.accounts || [];
        setAccounts(accs);
        if (accs.length > 0) setFromAccountId(String(accs[0].id));
      })
      .catch(() => addToastRef.current("Failed to load your accounts", "error"));
  }, [user]);

  // Load transaction history whenever the from-account changes
  useEffect(() => {
    if (!fromAccountId) return;
    setIsLoadingHistory(true);
    API.tx.get(`/transactions?accountId=${fromAccountId}`)
      .then(r => setHistory(r.data.transactions || []))
      .catch(() => addToastRef.current("Failed to load transaction history", "error"))
      .finally(() => setIsLoadingHistory(false));
  }, [fromAccountId]); // ← no addToast in deps (infinite-loop fix)

  // Reset resolved recipient whenever the user edits the input
  const handleRecipientChange = (e) => {
    setRecipientInput(e.target.value);
    setResolvedRecipient(null);
    setLookupState("idle");
  };

  // Lookup account number against the backend
  const lookupRecipient = useCallback(async () => {
    const trimmed = recipientInput.trim();
    if (!trimmed) return;
    setLookupState("loading");
    try {
      const { data } = await API.account.get(`/accounts/lookup?accountNumber=${encodeURIComponent(trimmed)}`);
      const acc = data.account;

      // Prevent transferring to own account
      const ownIds = accounts.map(a => String(a.id));
      if (ownIds.includes(String(acc.id))) {
        setLookupState("not_found");
        addToastRef.current("That is your own account. Please enter a different account number.", "error");
        return;
      }

      setResolvedRecipient(acc);
      setLookupState("found");
    } catch {
      setLookupState("not_found");
    }
  }, [recipientInput, accounts]);

  const submit = async (e) => {
    e.preventDefault();
    if (!resolvedRecipient) {
      return addToast("Please verify the recipient account number first.", "error");
    }
    if (String(fromAccountId) === String(resolvedRecipient.id)) {
      return addToast("Cannot transfer to the same account.", "error");
    }
    if (Number(amount) <= 0) {
      return addToast("Amount must be greater than zero.", "error");
    }

    setLoading(true);
    try {
      const idemKey = uuidv4();
      const { data } = await API.tx.post(
        "/transfer",
        {
          fromAccountId: Number(fromAccountId),
          toAccountId:   Number(resolvedRecipient.id),
          amount:        Number(amount),
          userId:        user.id,
        },
        { headers: { "idempotency-key": idemKey } }
      );

      if (data.status === "FLAGGED") {
        addToast(`⚠️ Transfer #${data.txId} is under fraud review`, "warn");
      } else {
        addToast(`✅ Transfer #${data.txId} completed successfully!`, "success");
      }

      // Reset recipient & amount fields
      setRecipientInput("");
      setResolvedRecipient(null);
      setLookupState("idle");
      setAmount("");

      // Refresh history
      API.tx.get(`/transactions?accountId=${fromAccountId}`)
        .then(r => setHistory(r.data.transactions || []));
    } catch (err) {
      addToast(err.response?.data?.error?.message || "Transfer failed to process.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="page-header">
        <h1>Transfer Money</h1>
        <p className="text-muted">Move funds instantly between accounts</p>
      </div>

      <div className="grid two-col">
        {/* ── Transfer Form ── */}
        <div className="surface-card">
          <h3>New Transfer</h3>
          <form onSubmit={submit}>

            {/* From Account */}
            <div className="input-group">
              <label>From Account</label>
              <select
                id="transfer-from"
                value={fromAccountId}
                onChange={e => setFromAccountId(e.target.value)}
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.account_number} — {formatINR(a.balance)}
                  </option>
                ))}
              </select>
            </div>

            {/* Recipient account number lookup */}
            <div className="input-group">
              <label>To Account Number</label>
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <input
                    id="transfer-to"
                    type="text"
                    required
                    placeholder="e.g. ACC1234567890"
                    value={recipientInput}
                    onChange={handleRecipientChange}
                    onBlur={lookupRecipient}
                    style={{
                      textTransform: "uppercase",
                      width: "100%",
                      borderColor: lookupState === "found"
                        ? "var(--success, #22c55e)"
                        : lookupState === "not_found"
                        ? "var(--danger, #ef4444)"
                        : undefined,
                    }}
                    autoComplete="off"
                  />
                  {/* Verified chip */}
                  {lookupState === "found" && resolvedRecipient && (
                    <div style={{
                      marginTop: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      color: "var(--success, #22c55e)",
                      fontWeight: 600,
                    }}>
                      <span>✅</span>
                      <span>
                        {resolvedRecipient.account_number}
                        <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: "6px" }}>
                          ({resolvedRecipient.account_type})
                        </span>
                      </span>
                    </div>
                  )}
                  {lookupState === "not_found" && (
                    <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--danger, #ef4444)", fontWeight: 600 }}>
                      ❌ Account not found. Check the number and try again.
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  id="transfer-verify"
                  onClick={lookupRecipient}
                  disabled={!recipientInput.trim() || lookupState === "loading"}
                  style={{ whiteSpace: "nowrap", marginTop: "0", padding: "10px 14px", flexShrink: 0 }}
                >
                  {lookupState === "loading"
                    ? <><div className="spinner" style={{ width: "14px", height: "14px", borderWidth: "2px", display: "inline-block", marginRight: "4px" }} />Checking…</>
                    : "Verify"}
                </button>
              </div>
            </div>

            {/* Amount */}
            <div className="input-group">
              <label>Amount (₹)</label>
              <input
                id="transfer-amount"
                type="number"
                min="1"
                step="0.01"
                required
                placeholder="e.g. 5000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>

            <button
              id="transfer-submit"
              type="submit"
              disabled={loading || lookupState !== "found"}
              title={lookupState !== "found" ? "Verify recipient account first" : ""}
            >
              {loading
                ? <><div className="spinner" />Executing Transaction…</>
                : "Send Money"}
            </button>
          </form>
        </div>

        {/* ── Transaction History ── */}
        <div className="surface-card">
          <h3>Transaction History</h3>
          {isLoadingHistory ? (
            <div className="empty-state">
              <div className="spinner" style={{ borderColor: "#666", borderTopColor: "#fff", width: "24px", height: "24px", borderWidth: "3px" }} />
              <div className="empty-text">Loading transactions…</div>
            </div>
          ) : history.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">💸</div>
              <div className="empty-text">No transactions yet.</div>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Amount</th><th>Type</th><th>Status</th><th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 10).map(tx => {
                    const isSent = String(tx.from_account_id) === String(fromAccountId);
                    return (
                      <tr key={tx.id}>
                        <td>{tx.id}</td>
                        <td className={isSent ? "text-danger" : "text-success"}>
                          {isSent ? "−" : "+"}{formatINR(tx.amount)}
                        </td>
                        <td>
                          <span style={{ fontSize: "11px", opacity: 0.75 }}>
                            {tx.from_account_id == null ? "Loan Credit" : isSent ? "Sent" : "Received"}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge status-${tx.status?.toLowerCase()}`}>
                            {tx.status}
                          </span>
                        </td>
                        <td>{new Date(tx.created_at).toLocaleDateString("en-IN")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
