import axios from "axios";

const userURL =
  (typeof window !== "undefined" && window.__ENV__ && window.__ENV__.USER_URL) ||
  import.meta.env?.VITE_USER_URL ||
  "";

const accountURL =
  (typeof window !== "undefined" && window.__ENV__ && window.__ENV__.ACCOUNT_URL) ||
  import.meta.env?.VITE_ACCOUNT_URL ||
  "";

const txURL =
  (typeof window !== "undefined" && window.__ENV__ && window.__ENV__.TX_URL) ||
  import.meta.env?.VITE_TX_URL ||
  "";

const loanURL =
  (typeof window !== "undefined" && window.__ENV__ && window.__ENV__.LOAN_URL) ||
  import.meta.env?.VITE_LOAN_URL ||
  "";

const reportURL =
  (typeof window !== "undefined" && window.__ENV__ && window.__ENV__.REPORT_URL) ||
  import.meta.env?.VITE_REPORT_URL ||
  "";

const timeout = Number(
  (typeof window !== "undefined" && window.__ENV__ && window.__ENV__.API_TIMEOUT) ||
  import.meta.env?.VITE_API_TIMEOUT ||
  10000
);

export const API = {
	user: axios.create({ baseURL: userURL, timeout }),
	account: axios.create({ baseURL: accountURL, timeout }),
	tx: axios.create({ baseURL: txURL, timeout }),
	loan: axios.create({ baseURL: loanURL, timeout }),
	report: axios.create({ baseURL: reportURL, timeout })
}
