import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { API, formatINR } from "../api";

export default function Loans() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [loans, setLoans]         = useState([]);
  const [emi, setEmi]             = useState(null);
  const [form, setForm]           = useState({ amount: "", tenureMonths: "12", interestRate: "10" });
  const [loading, setLoading]     = useState(false);
  const [calcLoading, setCalcLoading] = useState(false);

  const loadLoans = () => {
    API.loan.get(`/loans/user/${user.id}`)
      .then(r => setLoans(r.data.loans || []))
      .catch(() => {});
  };

  useEffect(() => { if (user) loadLoans(); }, [user]);

  const calcEmi = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      return addToast("Please enter a valid loan amount to calculate EMI.", "warn");
    }
    setCalcLoading(true);
    try {
      const { data } = await API.loan.post("/loans/emi", {
        amount: Number(form.amount),
        tenureMonths: Number(form.tenureMonths),
        interestRate: Number(form.interestRate)
      });
      setEmi(data);
    } catch { 
      setEmi(null);
      addToast("Failed to calculate EMI.", "error"); 
    } finally {
      setCalcLoading(false);
    }
  };

  const applyLoan = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) < 1000) {
      return addToast("Minimum loan amount is ₹1,000.", "error");
    }

    setLoading(true);
    try {
      const { data } = await API.loan.post("/loans", {
        userId: user.id,
        amount: Number(form.amount),
        tenureMonths: Number(form.tenureMonths),
        interestRate: Number(form.interestRate)
      });
      addToast(`Loan application #${data.loanId} submitted! EMI: ${formatINR(data.emi)}/month`, "success");
      setForm({ ...form, amount: "" });
      setEmi(null);
      loadLoans();
    } catch (err) {
      addToast(err.response?.data?.error?.message || "Loan application failed", "error");
    } finally { setLoading(false); }
  };

  return (
    <div className="app-container">
      <div className="page-header">
        <h1>Loans</h1>
        <p className="text-muted">Apply for instant loans at competitive interest rates</p>
      </div>

      <div className="grid two-col">
        {/* Application Form */}
        <div className="glass-card">
          <h3>Apply for a Loan</h3>
          <form onSubmit={applyLoan}>
            <div className="input-group">
              <label>Loan Amount (₹)</label>
              <input id="loan-amount" type="number" min="1000" required placeholder="e.g. 100000"
                value={form.amount} onChange={e => { setForm({ ...form, amount: e.target.value }); setEmi(null); }} />
            </div>
            <div className="input-group">
              <label>Tenure (months)</label>
              <select id="loan-tenure" value={form.tenureMonths}
                onChange={e => { setForm({ ...form, tenureMonths: e.target.value }); setEmi(null); }}>
                {[6, 12, 24, 36, 60].map(m => <option key={m} value={m}>{m} months</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Interest Rate (% p.a.)</label>
              <input id="loan-rate" type="number" min="1" max="36" step="0.1" required
                value={form.interestRate}
                onChange={e => { setForm({ ...form, interestRate: e.target.value }); setEmi(null); }} />
            </div>
            <button type="button" className="btn-secondary" id="calc-emi" onClick={calcEmi}
              disabled={calcLoading}
              style={{ marginBottom: "12px" }}>
              {calcLoading ? "Calculating..." : "Calculate EMI"}
            </button>
            {emi && (
              <div className="emi-preview glass-card" style={{ padding: "16px", marginBottom: "16px", animation: "fadeIn 0.3s ease" }}>
                <div className="emi-row"><span>Monthly EMI</span><strong>{formatINR(emi.emi)}</strong></div>
                <div className="emi-row"><span>Total Payable</span><strong>{formatINR(emi.totalPayable)}</strong></div>
                <div className="emi-row"><span>Total Interest</span><strong className="text-danger">{formatINR(emi.totalInterest)}</strong></div>
              </div>
            )}
            <button id="loan-submit" type="submit" disabled={loading}>
              {loading ? <><div className="spinner"></div> Submitting Request...</> : "Apply Now"}
            </button>
          </form>
        </div>

        {/* Loan History */}
        <div className="glass-card">
          <h3>My Loans</h3>
          {loans.length === 0
            ? (
              <div className="empty-state">
                  <div className="empty-icon">📝</div>
                  <div className="empty-text">No active loan applications.</div>
              </div>
            )
            : loans.map(loan => (
              <div key={loan.id} className="loan-item">
                <div className="loan-header">
                  <span className="loan-amount">{formatINR(loan.amount)}</span>
                  <span className={`status-badge status-${loan.status?.toLowerCase()}`}>{loan.status}</span>
                </div>
                <div className="loan-meta">
                  {loan.tenure_months}m @ {loan.interest_rate}% •
                  EMI: {formatINR(loan.emi_amount)}
                </div>
                <div className="loan-date text-muted">
                  Applied: {new Date(loan.created_at).toLocaleDateString("en-IN")}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
