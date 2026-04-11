import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { API, formatINR } from "../api";
import { v4 as uuidv4 } from "uuid";

export default function Transfer() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [accounts, setAccounts]           = useState([]);
  const [fromAccountId, setFromAccountId] = useState("");
  const [recipientInput, setRecipientInput]     = useState("");
  const [resolvedRecipient, setResolvedRecipient] = useState(null);
  const [lookupState, setLookupState]     = useState("idle"); // idle | loading | found | not_found
  const [amount, setAmount]               = useState("");
  const [loading, setLoading]             = useState(false);
  const [history, setHistory]             = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Stable ref so addToast never re-triggers effects
  const addToastRef = useRef(addToast);
  useEffect(() => { addToastRef.current = addToast; });

  // Load own accounts
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

  // Load transaction history when from-account changes
  useEffect(() => {
    if (!fromAccountId) return;
    setIsLoadingHistory(true);
    API.tx.get(`/transactions?accountId=${fromAccountId}`)
      .then(r => setHistory(r.data.transactions || []))
      .catch(() => addToastRef.current("Failed to load transaction history", "error"))
      .finally(() => setIsLoadingHistory(false));
  }, [fromAccountId]);

  // Reset verified state when user edits the recipient input
  const handleRecipientChange = (e) => {
    setRecipientInput(e.target.value);
    setResolvedRecipient(null);
    setLookupState("idle");
  };

  // Auto-verify when user finishes typing (on blur)
  const lookupRecipient = useCallback(async () => {
    const trimmed = recipientInput.trim().toUpperCase();
    if (!trimmed) return;
    setLookupState("loading");
    try {
      const { data } = await API.account.get(
        `/accounts/lookup?accountNumber=${encodeURIComponent(trimmed)}`
      );
      const acc = data.account;
      // Block transfers to own accounts
      if (accounts.map(a => String(a.id)).includes(String(acc.id))) {
        setLookupState("not_found");
        addToastRef.current("That is your own account. Enter a recipient's account number.", "error");
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
      return addToast("Please enter and verify the recipient account number first.", "error");
    }
    if (!amount || Number(amount) <= 0) {
      return addToast("Please enter a valid amount greater than zero.", "error");
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

      // Reset fields
      setRecipientInput("");
      setResolvedRecipient(null);
      setLookupState("idle");
      setAmount("");

      // Refresh history
      API.tx.get(`/transactions?accountId=${fromAccountId}`)
        .then(r => setHistory(r.data.transactions || []));

    } catch (err) {
      // Try all common error response shapes before falling back
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        "Transfer failed. Please try again.";
      addToast(msg, "error");
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
          <form onSubmit={submit} noValidate>

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

            {/* Recipient — full width, auto-verify on blur */}
            <div className="input-group">
              <label htmlFor="transfer-to">To Account Number</label>
              <input
                id="transfer-to"
                type="text"
                placeholder="e.g. ACC1234567890"
                value={recipientInput}
                onChange={handleRecipientChange}
                onBlur={lookupRecipient}
                autoComplete="off"
                spellCheck={false}
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  borderColor:
                    lookupState === "found"     ? "var(--clr-success, #22c55e)" :
                    lookupState === "not_found" ? "var(--clr-danger,  #ef4444)" :
                    undefined,
                  transition: "border-color 0.2s",
                }}
              />

              {/* Status row below the input */}
              <div style={{ minHeight: "22px", marginTop: "6px", fontSize: "12px", fontWeight: 600 }}>
                {lookupState === "loading" && (
                  <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <div className="spinner" style={{ width: "12px", height: "12px", borderWidth: "2px" }} />
                    Verifying…
                  </span>
                )}
                {lookupState === "found" && resolvedRecipient && (
                  <span style={{ color: "var(--clr-success, #22c55e)" }}>
                    ✅ {resolvedRecipient.account_number}
                    <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: "6px" }}>
                      {resolvedRecipient.account_type} account
                    </span>
                  </span>
                )}
                {lookupState === "not_found" && (
                  <span style={{ color: "var(--clr-danger, #ef4444)" }}>
                    ❌ Account not found. Double-check the number.
                  </span>
                )}
                {lookupState === "idle" && recipientInput.length > 3 && (
                  <span style={{ color: "var(--text-muted)" }}>
                    Click away from the field to verify
                  </span>
                )}
              </div>
            </div>

            {/* Amount */}
            <div className="input-group">
              <label htmlFor="transfer-amount">Amount (₹)</label>
              <input
                id="transfer-amount"
                type="number"
                min="1"
                step="0.01"
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
              style={{ opacity: lookupState !== "found" ? 0.6 : 1 }}
            >
              {loading
                ? <><div className="spinner" /> Executing Transaction…</>
                : "Send Money"}
            </button>

          </form>
        </div>

        {/* ── Transaction History ── */}
        <div className="surface-card">
          <h3>Transaction History</h3>
          {isLoadingHistory ? (
            <div className="empty-state">
              <div className="spinner" style={{ width: "24px", height: "24px", borderWidth: "3px" }} />
              <div className="empty-text">Loading…</div>
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
                    <th>#</th>
                    <th>Amount</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 10).map(tx => {
                    const isSent = tx.from_account_id != null &&
                                   String(tx.from_account_id) === String(fromAccountId);
                    const isLoan = tx.from_account_id == null;
                    return (
                      <tr key={tx.id}>
                        <td style={{ color: "var(--text-muted)", fontSize: "12px" }}>#{tx.id}</td>
                        <td style={{ fontWeight: 600 }}
                          className={isSent ? "text-danger" : "text-success"}>
                          {isSent ? "−" : "+"}{formatINR(tx.amount)}
                        </td>
                        <td style={{ fontSize: "11px", opacity: 0.75 }}>
                          {isLoan ? "Loan Credit" : isSent ? "Sent" : "Received"}
                        </td>
                        <td>
                          <span className={`status-badge status-${tx.status?.toLowerCase()}`}>
                            {tx.status}
                          </span>
                        </td>
                        <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          {new Date(tx.created_at).toLocaleDateString("en-IN")}
                        </td>
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
