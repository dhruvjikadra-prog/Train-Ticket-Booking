import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowsRotate,
    faBars,
    faBuildingColumns,
    faCalendarDays,
    faChevronLeft,
    faChevronRight,
    faClipboardList,
    faCreditCard,
    faDownload,
    faEnvelope,
    faEye,
    faFilter,
    faHouse,
    faLock,
    faMagnifyingGlass,
    faMoon,
    faPhone,
    faReceipt,
    faRightFromBracket,
    faRotateLeft,
    faSun,
    faTicket,
    faTriangleExclamation,
    faUser,
    faUserShield,
    faWallet,
    faXmark
} from "@fortawesome/free-solid-svg-icons";
import "../Styles/AdminDashboard.css";
import "../Styles/AdminPayments.css";
import RailGo from "../Assets/logo.png";

const AUTH_API_BASE = `${API_BASE_URL}/admin/auth`;
const PAYMENTS_API_BASE = `${API_BASE_URL}/admin/payments`;

const authApi = axios.create({ baseURL: AUTH_API_BASE, withCredentials: true });
const paymentsApi = axios.create({ baseURL: PAYMENTS_API_BASE, withCredentials: true });

const currencyFormat = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
});
const numberFormat = new Intl.NumberFormat("en-IN");

const formatCurrency = (value) => currencyFormat.format(Number(value || 0));
const formatNumber = (value) => numberFormat.format(Number(value || 0));

const formatDateTime = (value) => {
    if (!value) return "Not recorded";
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(value));
};

const formatJourneyDate = (value) => {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(new Date(`${value}T00:00:00`));
};

const statusClass = (status) =>
    `ad-status ad-status-${String(status || "unknown").replaceAll("_", "-").toLowerCase()}`;

const METHOD_ICONS = {
    UPI: faReceipt,
    CARD: faCreditCard,
    NETBANKING: faBuildingColumns,
    WALLET: faWallet
};

const DEFAULT_FILTERS = {
    search: "",
    status: "",
    paymentMethod: "",
    createdFrom: "",
    createdTo: ""
};

const PAYMENT_STATUS_OPTIONS = ["INITIATED", "SUCCESS", "FAILED", "REFUNDED"];
const PAYMENT_METHOD_OPTIONS = ["UPI", "CARD", "NETBANKING", "WALLET"];

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function AdminPayments() {
    const navigate = useNavigate();

    const [admin, setAdmin] = useState(null);
    const [authChecked, setAuthChecked] = useState(false);
    const [accessDenied, setAccessDenied] = useState("");

    const [payments, setPayments] = useState([]);
    const [summary, setSummary] = useState(null);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [searchInput, setSearchInput] = useState("");

    const [selectedPayment, setSelectedPayment] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");

    const [exporting, setExporting] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [theme, setTheme] = useState(() => localStorage.getItem("admin-dashboard-theme") || "light");

    useEffect(() => {
        const favicon = document.querySelector("link[rel='icon']");

        if (favicon) {
            favicon.href = "/logo.png";
            favicon.type = "image/png";
        }

        document.title = "Train Booking - Admin Payments";

        return () => {
            favicon.href = "/logo.png";
            favicon.type = "image/png";
            document.title = "Train Booking";
        };
    }, []);

    // Debounce the free-text search so every keystroke doesn't fire a request.
    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters((prev) => ({ ...prev, search: searchInput.trim() }));
        }, 400);
        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        localStorage.setItem("admin-dashboard-theme", theme);
    }, [theme]);

    // Lock background scroll while the detail drawer is open.
    useEffect(() => {
        if (!selectedPayment) return undefined;
        const { style } = document.body;
        const previousOverflow = style.overflow;
        style.overflow = "hidden";
        return () => {
            style.overflow = previousOverflow;
        };
    }, [selectedPayment]);

    const buildParams = useCallback(
        (page = pagination.page, limit = pagination.limit) => {
            const params = { page, limit };
            Object.entries(filters).forEach(([key, value]) => {
                if (value) params[key] = value;
            });
            return params;
        },
        [filters, pagination.page, pagination.limit]
    );

    const loadPayments = useCallback(
        async ({ page = 1, limit = pagination.limit, quiet = false } = {}) => {
            if (quiet) setRefreshing(true);
            else setLoading(true);
            setError("");

            try {
                const response = await paymentsApi.get("/", { params: buildParams(page, limit) });
                setPayments(response.data.payments || []);
                setPagination(
                    response.data.pagination || { page, limit, total: 0, totalPages: 1 }
                );
                setSummary(response.data.summary || null);
            } catch (requestError) {
                if (requestError.response?.status === 401) {
                    try {
                        await authApi.post("/refresh");
                        const retry = await paymentsApi.get("/", { params: buildParams(page, limit) });
                        setPayments(retry.data.payments || []);
                        setPagination(retry.data.pagination || { page, limit, total: 0, totalPages: 1 });
                        setSummary(retry.data.summary || null);
                    } catch {
                        navigate("/admin-login", { replace: true });
                        return;
                    }
                } else if (requestError.response?.status === 403) {
                    setAccessDenied(
                        requestError.response?.data?.message ||
                        "Your admin role doesn't include access to payment reports."
                    );
                } else {
                    setError(
                        requestError.response?.data?.message ||
                        "Unable to load the payment report right now."
                    );
                }
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [buildParams, navigate, pagination.limit]
    );

    // Verify the admin session up front, same pattern as the dashboard, before
    // ever requesting payment data.
    useEffect(() => {
        const checkSession = async () => {
            try {
                const meRes = await authApi.get("/me");
                setAdmin(meRes.data.admin || null);
                setAuthChecked(true);
            } catch (sessionError) {
                if (sessionError.response?.status === 401) {
                    try {
                        await authApi.post("/refresh");
                        const meRes = await authApi.get("/me");
                        setAdmin(meRes.data.admin || null);
                        setAuthChecked(true);
                        return;
                    } catch {
                        navigate("/admin-login", { replace: true });
                        return;
                    }
                }
                navigate("/admin-login", { replace: true });
            }
        };

        checkSession();
    }, [navigate]);

    useEffect(() => {
        if (!authChecked || accessDenied) return;
        loadPayments({ page: 1, limit: pagination.limit });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authChecked, filters]);

    const resetFilters = () => {
        setSearchInput("");
        setFilters(DEFAULT_FILTERS);
    };

    const goToPage = (page) => {
        if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
        loadPayments({ page, limit: pagination.limit });
    };

    const changePageSize = (limit) => {
        loadPayments({ page: 1, limit });
    };

    const openPaymentDetail = async (payment) => {
        setSelectedPayment({ loadingFor: payment.id });
        setDetailLoading(true);
        setDetailError("");

        try {
            const response = await paymentsApi.get(`/${payment.id}`);
            setSelectedPayment(response.data.payment);
        } catch (requestError) {
            if (requestError.response?.status === 401) {
                navigate("/admin-login", { replace: true });
                return;
            }
            setDetailError(
                requestError.response?.data?.message || "Unable to load this payment's details."
            );
        } finally {
            setDetailLoading(false);
        }
    };

    const closeDetail = () => {
        setSelectedPayment(null);
        setDetailError("");
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await paymentsApi.get("/export", {
                params: buildParams(1, pagination.limit),
                responseType: "blob"
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href = url;
            link.download = `payment-report-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (requestError) {
            if (requestError.response?.status === 401) {
                navigate("/admin-login", { replace: true });
                return;
            }
            setError("Unable to export the payment report right now.");
        } finally {
            setExporting(false);
        }
    };

    const handleLogout = async () => {
        try {
            const csrfRes = await authApi.get("/csrf-token");
            await authApi.post("/logout", {}, { headers: { "X-CSRF-Token": csrfRes.data.csrfToken } });
        } finally {
            navigate("/admin-login", { replace: true });
        }
    };

    const navItems = [
        { label: "Dashboard", href: "/admin/dashboard", icon: faHouse, type: "route" },
        { label: "Booking Reports", href: "/admin/bookings", icon: faClipboardList, type: "route" },
        { label: "Payment Reports", href: "/admin/payments", icon: faCreditCard, type: "route", active: true }
    ];

    if (!authChecked) {
        return (
            <div className="ad-page">
                <section className="ad-loading" aria-live="polite">
                    <FontAwesomeIcon icon={faArrowsRotate} className="ad-spin" style={{ fontSize: 30 }} />
                    <span>Verifying admin session</span>
                </section>
            </div>
        );
    }

    if (accessDenied) {
        return (
            <div className="ad-page">
                <section className="apy-denied">
                    <FontAwesomeIcon icon={faLock} style={{ fontSize: 30 }} />
                    <h2>Access denied</h2>
                    <p>{accessDenied}</p>
                    <Link to="/admin/dashboard" className="apy-btn apy-btn--primary">
                        Back to dashboard
                    </Link>
                </section>
            </div>
        );
    }

    return (
        <div className={`ad-page ${theme === "dark" ? "ad-dark" : ""}`}>
            {sidebarOpen && (
                <button
                    className="ad-sidebar-scrim"
                    type="button"
                    aria-label="Close sidebar"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside className={`ad-sidebar ${sidebarOpen ? "is-open" : ""}`}>
                <div className="ad-brand">
                    <img src={RailGo} alt="" style={{ height: "30px", width: "30px", borderRadius: "25px" }} />
                    <div>
                        <strong>Rail Admin</strong>
                        <span>Control Center</span>
                    </div>
                    <button
                        className="ad-sidebar-close"
                        type="button"
                        aria-label="Close sidebar"
                        onClick={() => setSidebarOpen(false)}
                    >
                        <FontAwesomeIcon icon={faXmark} style={{ fontSize: 18 }} />
                    </button>
                </div>

                <nav className="ad-nav" aria-label="Admin navigation">
                    {navItems.map((item) => (
                        <Link
                            key={item.label}
                            to={item.href}
                            className={item.active ? "is-active" : ""}
                            onClick={() => setSidebarOpen(false)}
                        >
                            <FontAwesomeIcon icon={item.icon} style={{ fontSize: 18 }} />
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="ad-admin-card">
                    <div className="ad-admin-avatar">
                        <FontAwesomeIcon icon={faUser} style={{ fontSize: 20 }} />
                    </div>
                    <div>
                        <strong>{admin?.name || "Admin"}</strong>
                        <span>{admin?.role || "admin"}</span>
                    </div>
                </div>
            </aside>

            <main className="ad-main">
                <header className="ad-topbar">
                    <div className="ad-title-wrap">
                        <button
                            className="ad-icon-btn ad-menu-btn"
                            type="button"
                            aria-label="Open sidebar"
                            onClick={() => setSidebarOpen(true)}
                        >
                            <FontAwesomeIcon icon={faBars} style={{ fontSize: 20 }} />
                        </button>
                        <div>
                            <span className="ad-kicker">
                                <FontAwesomeIcon icon={faUserShield} style={{ fontSize: 12, marginRight: 6 }} />
                                Secure Admin
                            </span>
                            <h1>Payment Reports</h1>
                        </div>
                    </div>

                    <div className="ad-top-actions">
                        <button
                            className="ad-icon-btn"
                            type="button"
                            title="Refresh"
                            aria-label="Refresh report"
                            onClick={() => loadPayments({ page: pagination.page, quiet: true })}
                            disabled={refreshing}
                        >
                            <FontAwesomeIcon
                                icon={faArrowsRotate}
                                style={{ fontSize: 19 }}
                                className={refreshing ? "ad-spin" : ""}
                            />
                        </button>
                        <button
                            className="ad-icon-btn"
                            type="button"
                            title="Theme"
                            aria-label="Toggle theme"
                            onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
                        >
                            {theme === "dark" ? (
                                <FontAwesomeIcon icon={faSun} style={{ fontSize: 19 }} />
                            ) : (
                                <FontAwesomeIcon icon={faMoon} style={{ fontSize: 19 }} />
                            )}
                        </button>
                        <button className="ad-logout" type="button" onClick={handleLogout}>
                            <FontAwesomeIcon icon={faRightFromBracket} style={{ fontSize: 18 }} />
                            <span>Sign out</span>
                        </button>
                    </div>
                </header>

                <div className="ad-content">
                    {error && (
                        <div className="ad-alert" role="alert">
                            <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 18 }} />
                            <span>{error}</span>
                        </div>
                    )}

                    {summary && (
                        <section className="ad-stats-grid" aria-label="Report summary">
                            <article className="ad-stat-card" data-tone="cyan">
                                <div className="ad-stat-icon">
                                    <FontAwesomeIcon icon={faReceipt} style={{ fontSize: 21 }} />
                                </div>
                                <span>Payments (filtered)</span>
                                <strong>{formatNumber(summary.totalPayments)}</strong>
                                <small>{formatCurrency(summary.totalAmount)} total</small>
                            </article>
                            <article className="ad-stat-card" data-tone="green">
                                <div className="ad-stat-icon">
                                    <FontAwesomeIcon icon={faTicket} style={{ fontSize: 21 }} />
                                </div>
                                <span>Successful</span>
                                <strong>{formatNumber(summary.success)}</strong>
                                <small>{formatCurrency(summary.successAmount)} collected</small>
                            </article>
                            <article className="ad-stat-card" data-tone="amber">
                                <div className="ad-stat-icon">
                                    <FontAwesomeIcon icon={faTicket} style={{ fontSize: 21 }} />
                                </div>
                                <span>Initiated / Failed</span>
                                <strong>
                                    {formatNumber(summary.initiated)} / {formatNumber(summary.failed)}
                                </strong>
                                <small>Awaiting or unsuccessful</small>
                            </article>
                            <article className="ad-stat-card" data-tone="violet">
                                <div className="ad-stat-icon">
                                    <FontAwesomeIcon icon={faTicket} style={{ fontSize: 21 }} />
                                </div>
                                <span>Refunded</span>
                                <strong>{formatNumber(summary.refunded)}</strong>
                                <small>{formatCurrency(summary.refundedAmount)} returned</small>
                            </article>
                        </section>
                    )}

                    <section className="apy-filters">
                        <div className="apy-filters__row">
                            <label className="ad-search apy-search">
                                <FontAwesomeIcon icon={faMagnifyingGlass} style={{ fontSize: 18 }} />
                                <input
                                    type="search"
                                    placeholder="Search transaction ID, PNR, UPI ID, card, email or mobile"
                                    value={searchInput}
                                    onChange={(event) => setSearchInput(event.target.value)}
                                />
                            </label>

                            <button
                                type="button"
                                className="apy-btn apy-btn--primary apy-export-btn"
                                onClick={handleExport}
                                disabled={exporting}
                            >
                                <FontAwesomeIcon icon={faDownload} style={{ fontSize: 14 }} />
                                {exporting ? "Exporting…" : "Export CSV"}
                            </button>
                        </div>

                        <div className="apy-filters__row apy-filters__row--wrap">
                            <span className="apy-filters__label">
                                <FontAwesomeIcon icon={faFilter} style={{ fontSize: 12 }} /> Filters
                            </span>

                            <select
                                value={filters.status}
                                onChange={(event) =>
                                    setFilters((prev) => ({ ...prev, status: event.target.value }))
                                }
                            >
                                <option value="">Payment status</option>
                                {PAYMENT_STATUS_OPTIONS.map((status) => (
                                    <option key={status} value={status}>
                                        {status}
                                    </option>
                                ))}
                            </select>

                            <select
                                value={filters.paymentMethod}
                                onChange={(event) =>
                                    setFilters((prev) => ({ ...prev, paymentMethod: event.target.value }))
                                }
                            >
                                <option value="">Payment method</option>
                                {PAYMENT_METHOD_OPTIONS.map((method) => (
                                    <option key={method} value={method}>
                                        {method}
                                    </option>
                                ))}
                            </select>

                            <label className="apy-date-field">
                                <span>Created from</span>
                                <input
                                    type="date"
                                    value={filters.createdFrom}
                                    onChange={(event) =>
                                        setFilters((prev) => ({ ...prev, createdFrom: event.target.value }))
                                    }
                                />
                            </label>

                            <label className="apy-date-field">
                                <span>Created to</span>
                                <input
                                    type="date"
                                    value={filters.createdTo}
                                    onChange={(event) =>
                                        setFilters((prev) => ({ ...prev, createdTo: event.target.value }))
                                    }
                                />
                            </label>

                            <button type="button" className="apy-btn apy-reset-btn" onClick={resetFilters}>
                                <FontAwesomeIcon icon={faRotateLeft} style={{ fontSize: 13 }} />
                                Reset
                            </button>
                        </div>
                    </section>

                    <section className="ad-panel ad-table-panel">
                        <div className="ad-panel-head">
                            <div>
                                <span className="ad-kicker">Report</span>
                                <h3>All Payments</h3>
                            </div>
                            <FontAwesomeIcon icon={faCalendarDays} style={{ fontSize: 20 }} />
                        </div>

                        {loading ? (
                            <div className="ad-loading" aria-live="polite" style={{ padding: "60px 0" }}>
                                <FontAwesomeIcon icon={faArrowsRotate} className="ad-spin" style={{ fontSize: 26 }} />
                                <span>Loading payments</span>
                            </div>
                        ) : (
                            <>
                                <div className="ad-table-wrap">
                                    <table className="ad-table">
                                        <thead>
                                            <tr>
                                                <th>Transaction</th>
                                                <th>Booking</th>
                                                <th>Customer</th>
                                                <th>Method</th>
                                                <th>Amount</th>
                                                <th>Status</th>
                                                <th>Created</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {payments.length ? (
                                                payments.map((payment) => (
                                                    <tr key={payment.id}>
                                                        <td>
                                                            <strong>{payment.transactionId}</strong>
                                                            {payment.gatewayPaymentId && (
                                                                <span className="apy-token">
                                                                    {payment.gatewayPaymentId}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <strong>{payment.booking?.pnrNumber || "—"}</strong>
                                                            <span className="apy-token">{payment.bookingToken}</span>
                                                        </td>
                                                        <td>
                                                            <strong>{payment.user?.name || "—"}</strong>
                                                            <span>{payment.user?.email || "—"}</span>
                                                        </td>
                                                        <td>
                                                            <span className="apy-method">
                                                                <FontAwesomeIcon
                                                                    icon={METHOD_ICONS[payment.paymentMethod] || faReceipt}
                                                                    style={{ fontSize: 13 }}
                                                                />
                                                                {payment.methodLabel}
                                                            </span>
                                                        </td>
                                                        <td>{formatCurrency(payment.amount)}</td>
                                                        <td>
                                                            <span className={statusClass(payment.status)}>
                                                                {payment.status}
                                                            </span>
                                                        </td>
                                                        <td>{formatDateTime(payment.createdAt)}</td>
                                                        <td>
                                                            <button
                                                                type="button"
                                                                className="ad-icon-btn"
                                                                title="View full details"
                                                                aria-label="View full payment details"
                                                                onClick={() => openPaymentDetail(payment)}
                                                            >
                                                                <FontAwesomeIcon icon={faEye} style={{ fontSize: 16 }} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="8">
                                                        <div className="ad-empty">No payments match these filters</div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="apy-pagination">
                                    <div className="apy-pagination__size">
                                        <span>Rows per page</span>
                                        <select
                                            value={pagination.limit}
                                            onChange={(event) => changePageSize(Number(event.target.value))}
                                        >
                                            {PAGE_SIZE_OPTIONS.map((size) => (
                                                <option key={size} value={size}>
                                                    {size}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="apy-pagination__controls">
                                        <button
                                            type="button"
                                            className="ad-icon-btn"
                                            disabled={pagination.page <= 1}
                                            onClick={() => goToPage(pagination.page - 1)}
                                            aria-label="Previous page"
                                        >
                                            <FontAwesomeIcon icon={faChevronLeft} style={{ fontSize: 14 }} />
                                        </button>
                                        <span>
                                            Page {pagination.page} of {pagination.totalPages} ·{" "}
                                            {formatNumber(pagination.total)} total
                                        </span>
                                        <button
                                            type="button"
                                            className="ad-icon-btn"
                                            disabled={pagination.page >= pagination.totalPages}
                                            onClick={() => goToPage(pagination.page + 1)}
                                            aria-label="Next page"
                                        >
                                            <FontAwesomeIcon icon={faChevronRight} style={{ fontSize: 14 }} />
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </section>
                </div>
            </main>

            {selectedPayment && (
                <div className="apy-drawer-overlay" role="presentation" onClick={closeDetail}>
                    <aside
                        className="apy-drawer"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Payment details"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="apy-drawer__head">
                            <h2>Payment details</h2>
                            <button
                                type="button"
                                className="ad-icon-btn"
                                aria-label="Close details"
                                onClick={closeDetail}
                            >
                                <FontAwesomeIcon icon={faXmark} style={{ fontSize: 18 }} />
                            </button>
                        </div>

                        {detailLoading ? (
                            <div className="ad-loading" style={{ padding: "60px 0" }}>
                                <FontAwesomeIcon icon={faArrowsRotate} className="ad-spin" style={{ fontSize: 26 }} />
                                <span>Loading payment</span>
                            </div>
                        ) : detailError ? (
                            <div className="ad-alert" role="alert">
                                <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 18 }} />
                                <span>{detailError}</span>
                            </div>
                        ) : (
                            <div className="apy-drawer__body">
                                <div className="apy-drawer__summary">
                                    <div>
                                        <span className="apy-drawer__label">Transaction ID</span>
                                        <strong className="apy-token">{selectedPayment.transactionId}</strong>
                                    </div>
                                    <div>
                                        <span className="apy-drawer__label">Gateway payment ID</span>
                                        <strong className="apy-token">
                                            {selectedPayment.gatewayPaymentId || "—"}
                                        </strong>
                                    </div>
                                    <div>
                                        <span className="apy-drawer__label">Created</span>
                                        <strong>{formatDateTime(selectedPayment.createdAt)}</strong>
                                    </div>
                                </div>

                                <div className="apy-drawer__statuses">
                                    <span className={statusClass(selectedPayment.status)}>
                                        {selectedPayment.status}
                                    </span>
                                    {selectedPayment.gatewayStatus && (
                                        <span className={statusClass(selectedPayment.gatewayStatus)}>
                                            {selectedPayment.gatewayStatus}
                                        </span>
                                    )}
                                </div>

                                <section className="apy-drawer__section">
                                    <h3>Amount</h3>
                                    <div className="apy-kv-grid">
                                        <div>
                                            <span>Amount</span>
                                            <strong>{formatCurrency(selectedPayment.amount)}</strong>
                                        </div>
                                        <div>
                                            <span>Currency</span>
                                            <strong>{selectedPayment.currency}</strong>
                                        </div>
                                        <div>
                                            <span>Payment method</span>
                                            <strong>
                                                <FontAwesomeIcon
                                                    icon={METHOD_ICONS[selectedPayment.paymentMethod] || faReceipt}
                                                    style={{ fontSize: 12, marginRight: 6 }}
                                                />
                                                {selectedPayment.paymentMethod}
                                            </strong>
                                        </div>
                                    </div>
                                </section>

                                <section className="apy-drawer__section">
                                    <h3>Method details</h3>
                                    <div className="apy-kv-grid">
                                        {selectedPayment.paymentMethod === "UPI" && (
                                            <div>
                                                <span>UPI ID</span>
                                                <strong>{selectedPayment.paymentDetails?.upiId || "—"}</strong>
                                            </div>
                                        )}
                                        {selectedPayment.paymentMethod === "CARD" && (
                                            <>
                                                <div>
                                                    <span>Card</span>
                                                    <strong>
                                                        {selectedPayment.paymentDetails?.cardBrand || "Card"} •••• {" "}
                                                        {selectedPayment.paymentDetails?.cardLast4 || "----"}
                                                    </strong>
                                                </div>
                                                <div>
                                                    <span>Name on card</span>
                                                    <strong>
                                                        {selectedPayment.paymentDetails?.nameOnCard || "—"}
                                                    </strong>
                                                </div>
                                            </>
                                        )}
                                        {selectedPayment.paymentMethod === "NETBANKING" && (
                                            <>
                                                <div>
                                                    <span>Bank</span>
                                                    <strong>{selectedPayment.paymentDetails?.bankName || "—"}</strong>
                                                </div>
                                                <div>
                                                    <span>Account</span>
                                                    <strong>
                                                        {selectedPayment.paymentDetails?.accountNumber
                                                            ? `•••• ${selectedPayment.paymentDetails.accountNumber.slice(-4)}`
                                                            : "—"}
                                                    </strong>
                                                </div>
                                                <div>
                                                    <span>IFSC code</span>
                                                    <strong>{selectedPayment.paymentDetails?.ifscCode || "—"}</strong>
                                                </div>
                                                <div>
                                                    <span>Account holder</span>
                                                    <strong>
                                                        {selectedPayment.paymentDetails?.accountHolder || "—"}
                                                    </strong>
                                                </div>
                                            </>
                                        )}
                                        {selectedPayment.paymentMethod === "WALLET" && (
                                            <>
                                                <div>
                                                    <span>Wallet</span>
                                                    <strong>
                                                        {selectedPayment.paymentDetails?.walletName || "—"}
                                                    </strong>
                                                </div>
                                                <div>
                                                    <span>Wallet mobile</span>
                                                    <strong>
                                                        {selectedPayment.paymentDetails?.walletMobile || "—"}
                                                    </strong>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </section>

                                <section className="apy-drawer__section">
                                    <h3>Lifecycle</h3>
                                    <div className="apy-timeline">
                                        <div className="apy-timeline-row">
                                            <span className="apy-timeline-dot" />
                                            <div>
                                                <strong>Paid</strong>
                                                <small>Payment marked successful</small>
                                            </div>
                                            <time>{formatDateTime(selectedPayment.paidAt)}</time>
                                        </div>
                                        <div className="apy-timeline-row">
                                            <span className="apy-timeline-dot apy-timeline-dot--warn" />
                                            <div>
                                                <strong>Failed</strong>
                                                <small>{selectedPayment.failureReason || "No failure reason given"}</small>
                                            </div>
                                            <time>{formatDateTime(selectedPayment.failedAt)}</time>
                                        </div>
                                        <div className="apy-timeline-row">
                                            <span className="apy-timeline-dot apy-timeline-dot--muted" />
                                            <div>
                                                <strong>Refunded</strong>
                                                <small>Amount returned to the customer</small>
                                            </div>
                                            <time>{formatDateTime(selectedPayment.refundedAt)}</time>
                                        </div>
                                    </div>
                                </section>

                                <section className="apy-drawer__section">
                                    <h3>Booking</h3>
                                    <div className="apy-kv-grid">
                                        <div>
                                            <span>PNR</span>
                                            <strong>{selectedPayment.booking?.pnrNumber || "—"}</strong>
                                        </div>
                                        <div>
                                            <span>Booking token</span>
                                            <strong className="apy-token">{selectedPayment.bookingToken}</strong>
                                        </div>
                                        <div>
                                            <span>Route</span>
                                            <strong>
                                                {selectedPayment.booking
                                                    ? `${selectedPayment.booking.fromStation} → ${selectedPayment.booking.toStation}`
                                                    : "—"}
                                            </strong>
                                        </div>
                                        <div>
                                            <span>Journey date</span>
                                            <strong>{formatJourneyDate(selectedPayment.booking?.journeyDate)}</strong>
                                        </div>
                                        <div>
                                            <span>Train</span>
                                            <strong>{selectedPayment.booking?.trainNo || "—"}</strong>
                                        </div>
                                        <div>
                                            <span>Booking status</span>
                                            <strong>
                                                {selectedPayment.booking?.bookingStatus
                                                    ? String(selectedPayment.booking.bookingStatus).replaceAll("_", " ")
                                                    : "—"}
                                            </strong>
                                        </div>
                                    </div>
                                </section>

                                <section className="apy-drawer__section">
                                    <h3>Customer</h3>
                                    <div className="apy-kv-grid">
                                        <div>
                                            <span>Name</span>
                                            <strong>{selectedPayment.user?.name || "—"}</strong>
                                        </div>
                                        <div>
                                            <span>
                                                <FontAwesomeIcon icon={faEnvelope} style={{ fontSize: 11, marginRight: 4 }} />
                                                Email
                                            </span>
                                            <strong>{selectedPayment.user?.email || "—"}</strong>
                                        </div>
                                        <div>
                                            <span>
                                                <FontAwesomeIcon icon={faPhone} style={{ fontSize: 11, marginRight: 4 }} />
                                                Mobile
                                            </span>
                                            <strong>{selectedPayment.user?.mobile || "—"}</strong>
                                        </div>
                                    </div>
                                </section>

                                <section className="apy-drawer__section">
                                    <h3>Record</h3>
                                    <div className="apy-kv-grid">
                                        <div>
                                            <span>Last updated</span>
                                            <strong>{formatDateTime(selectedPayment.updatedAt)}</strong>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}
                    </aside>
                </div>
            )}
        </div>
    );
}

export default AdminPayments;