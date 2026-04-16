import axios from "axios";

// Using relative paths because Nginx now reverse-proxies to the backend services
// This allows the app to work seamlessly when deployed on EC2 or anywhere else,
// regardless of the public IP or DNS name.
export const BASE_URLS = {
  user:    import.meta.env.VITE_APP_USER_URL,
  account: import.meta.env.VITE_APP_ACCOUNT_URL,
  tx:      import.meta.env.VITE_APP_TRANSACTION_URL,
  payment: import.meta.env.VITE_APP_PAYMENT_URL,
  loan:    import.meta.env.VITE_APP_LOAN_URL,
  notify:  import.meta.env.VITE_APP_NOTIFY_URL,
  report:  import.meta.env.VITE_APP_REPORT_URL,
};

const timeout = 10000;

function makeClient(baseURL) {
  const instance = axios.create({ baseURL, timeout });
  // Attach JWT if present
  instance.interceptors.request.use((cfg) => {
    const token = localStorage.getItem("token");
    if (token) cfg.headers["Authorization"] = `Bearer ${token}`;
    return cfg;
  });
  // Auto-logout on 401 (expired or invalid token)
  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err.response?.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        // Force a clean page reload to /login, clearing all React state
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
      return Promise.reject(err);
    }
  );
  return instance;
}

export const API = {
  user:    makeClient(BASE_URLS.user),
  account: makeClient(BASE_URLS.account),
  tx:      makeClient(BASE_URLS.tx),
  payment: makeClient(BASE_URLS.payment),
  loan:    makeClient(BASE_URLS.loan),
  notify:  makeClient(BASE_URLS.notify),
  report:  makeClient(BASE_URLS.report),
};

/** Format a number as Indian Rupees */
export function formatINR(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount ?? 0);
}
