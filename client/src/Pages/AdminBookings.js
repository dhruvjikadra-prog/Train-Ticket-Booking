import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowsRotate,
    faBars,
    faCalendarDays,
    faChevronLeft,
    faChevronRight,
    faClipboardList,
    faDownload,
    faEnvelope,
    faEye,
    faFilter,
    faHouse,
    faLock,
    faMagnifyingGlass,
    faMoon,
    faPhone,
    faRightFromBracket,
    faRotateLeft,
    faSun,
    faTicket,
    faTriangleExclamation,
    faUser,
    faUserShield,
    faXmark
} from "@fortawesome/free-solid-svg-icons";
import "../Styles/AdminDashboard.css";
import "../Styles/AdminBookings.css";
import RailGo from "../Assets/logo.png";

const AUTH_API_BASE = `${API_BASE_URL}/admin/auth`;
const BOOKINGS_API_BASE = `${API_BASE_URL}/admin/bookings`;

const authApi = axios.create({ baseURL: AUTH_API_BASE, withCredentials: true });
const bookingsApi = axios.create({ baseURL: BOOKINGS_API_BASE, withCredentials: true });

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

const DEFAULT_FILTERS = {
    search: "",
    bookingStatus: "",
    paymentStatus: "",
    cancellationStatus: "",
    classCode: "",
    journeyDateFrom: "",
    journeyDateTo: ""
};

const BOOKING_STATUS_OPTIONS = [
    "pending",
    "seat_selected",
    "review_completed",
    "payment_processing",
    "payment_success",
    "completed",
    "expired"
];

const PAYMENT_STATUS_OPTIONS = ["pending", "processing", "paid", "failed", "refunded"];

const CANCELLATION_STATUS_OPTIONS = ["ACTIVE", "PARTIAL_CANCELLED", "FULLY_CANCELLED"];

const CLASS_OPTIONS = ["SL", "3A", "2A", "1A", "CC", "EC"];

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function AdminBookings() {
    const navigate = useNavigate();

    const [admin, setAdmin] = useState(null);
    const [authChecked, setAuthChecked] = useState(false);
    const [accessDenied, setAccessDenied] = useState("");

    const [bookings, setBookings] = useState([]);
    const [summary, setSummary] = useState(null);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [searchInput, setSearchInput] = useState("");

    const [selectedBooking, setSelectedBooking] = useState(null);
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

        document.title = "Train Booking - Admin Bookings";

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

    const loadBookings = useCallback(
        async ({ page = 1, limit = pagination.limit, quiet = false } = {}) => {
            if (quiet) setRefreshing(true);
            else setLoading(true);
            setError("");

            try {
                const response = await bookingsApi.get("/", { params: buildParams(page, limit) });
                setBookings(response.data.bookings || []);
                setPagination(
                    response.data.pagination || { page, limit, total: 0, totalPages: 1 }
                );
                setSummary(response.data.summary || null);
            } catch (requestError) {
                if (requestError.response?.status === 401) {
                    try {
                        await authApi.post("/refresh");
                        const retry = await bookingsApi.get("/", { params: buildParams(page, limit) });
                        setBookings(retry.data.bookings || []);
                        setPagination(retry.data.pagination || { page, limit, total: 0, totalPages: 1 });
                        setSummary(retry.data.summary || null);
                    } catch {
                        navigate("/admin-login", { replace: true });
                        return;
                    }
                } else if (requestError.response?.status === 403) {
                    setAccessDenied(
                        requestError.response?.data?.message ||
                        "Your admin role doesn't include access to booking reports."
                    );
                } else {
                    setError(
                        requestError.response?.data?.message ||
                        "Unable to load the booking report right now."
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
    // ever requesting booking data.
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
        loadBookings({ page: 1, limit: pagination.limit });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authChecked, filters]);

    const resetFilters = () => {
        setSearchInput("");
        setFilters(DEFAULT_FILTERS);
    };

    const goToPage = (page) => {
        if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
        loadBookings({ page, limit: pagination.limit });
    };

    const changePageSize = (limit) => {
        loadBookings({ page: 1, limit });
    };

    const openBookingDetail = async (booking) => {
        setSelectedBooking({ loadingFor: booking.id });
        setDetailLoading(true);
        setDetailError("");

        try {
            const response = await bookingsApi.get(`/${booking.id}`);
            setSelectedBooking(response.data.booking);
        } catch (requestError) {
            if (requestError.response?.status === 401) {
                navigate("/admin-login", { replace: true });
                return;
            }
            setDetailError(
                requestError.response?.data?.message || "Unable to load this booking's details."
            );
        } finally {
            setDetailLoading(false);
        }
    };

    const closeDetail = () => {
        setSelectedBooking(null);
        setDetailError("");
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await bookingsApi.get("/export", {
                params: buildParams(1, pagination.limit),
                responseType: "blob"
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href = url;
            link.download = `booking-report-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (requestError) {
            if (requestError.response?.status === 401) {
                navigate("/admin-login", { replace: true });
                return;
            }
            setError("Unable to export the booking report right now.");
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
        { label: "Booking Reports", href: "/admin/bookings", icon: faClipboardList, type: "route", active: true }
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
                <section className="abk-denied">
                    <FontAwesomeIcon icon={faLock} style={{ fontSize: 30 }} />
                    <h2>Access denied</h2>
                    <p>{accessDenied}</p>
                    <Link to="/admin/dashboard" className="abk-btn abk-btn--primary">
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
                            <h1>Booking Reports</h1>
                        </div>
                    </div>

                    <div className="ad-top-actions">
                        <button
                            className="ad-icon-btn"
                            type="button"
                            title="Refresh"
                            aria-label="Refresh report"
                            onClick={() => loadBookings({ page: pagination.page, quiet: true })}
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
                                    <FontAwesomeIcon icon={faTicket} style={{ fontSize: 21 }} />
                                </div>
                                <span>Bookings (filtered)</span>
                                <strong>{formatNumber(summary.totalBookings)}</strong>
                                <small>{formatNumber(summary.totalPassengers)} passengers</small>
                            </article>
                            <article className="ad-stat-card" data-tone="green">
                                <div className="ad-stat-icon">
                                    <FontAwesomeIcon icon={faTicket} style={{ fontSize: 21 }} />
                                </div>
                                <span>Revenue</span>
                                <strong>{formatCurrency(summary.totalRevenue)}</strong>
                                <small>{formatNumber(summary.completed)} completed</small>
                            </article>
                            <article className="ad-stat-card" data-tone="amber">
                                <div className="ad-stat-icon">
                                    <FontAwesomeIcon icon={faTicket} style={{ fontSize: 21 }} />
                                </div>
                                <span>Pending</span>
                                <strong>{formatNumber(summary.pending)}</strong>
                                <small>Awaiting completion</small>
                            </article>
                            <article className="ad-stat-card" data-tone="violet">
                                <div className="ad-stat-icon">
                                    <FontAwesomeIcon icon={faTicket} style={{ fontSize: 21 }} />
                                </div>
                                <span>Cancelled</span>
                                <strong>{formatNumber(summary.cancelled)}</strong>
                                <small>{formatNumber(summary.refunded)} refunded</small>
                            </article>
                        </section>
                    )}

                    <section className="abk-filters">
                        <div className="abk-filters__row">
                            <label className="ad-search abk-search">
                                <FontAwesomeIcon icon={faMagnifyingGlass} style={{ fontSize: 18 }} />
                                <input
                                    type="search"
                                    placeholder="Search PNR, token, train, station, email or mobile"
                                    value={searchInput}
                                    onChange={(event) => setSearchInput(event.target.value)}
                                />
                            </label>

                            <button
                                type="button"
                                className="abk-btn abk-btn--primary abk-export-btn"
                                onClick={handleExport}
                                disabled={exporting}
                            >
                                <FontAwesomeIcon icon={faDownload} style={{ fontSize: 14 }} />
                                {exporting ? "Exporting…" : "Export CSV"}
                            </button>
                        </div>

                        <div className="abk-filters__row abk-filters__row--wrap">
                            <span className="abk-filters__label">
                                <FontAwesomeIcon icon={faFilter} style={{ fontSize: 12 }} /> Filters
                            </span>

                            <select
                                value={filters.bookingStatus}
                                onChange={(event) =>
                                    setFilters((prev) => ({ ...prev, bookingStatus: event.target.value }))
                                }
                            >
                                <option value="">Booking status</option>
                                {BOOKING_STATUS_OPTIONS.map((status) => (
                                    <option key={status} value={status}>
                                        {status.replaceAll("_", " ")}
                                    </option>
                                ))}
                            </select>

                            <select
                                value={filters.paymentStatus}
                                onChange={(event) =>
                                    setFilters((prev) => ({ ...prev, paymentStatus: event.target.value }))
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
                                value={filters.cancellationStatus}
                                onChange={(event) =>
                                    setFilters((prev) => ({ ...prev, cancellationStatus: event.target.value }))
                                }
                            >
                                <option value="">Cancellation status</option>
                                {CANCELLATION_STATUS_OPTIONS.map((status) => (
                                    <option key={status} value={status}>
                                        {status.replaceAll("_", " ")}
                                    </option>
                                ))}
                            </select>

                            <select
                                value={filters.classCode}
                                onChange={(event) =>
                                    setFilters((prev) => ({ ...prev, classCode: event.target.value }))
                                }
                            >
                                <option value="">Class</option>
                                {CLASS_OPTIONS.map((code) => (
                                    <option key={code} value={code}>
                                        {code}
                                    </option>
                                ))}
                            </select>

                            <label className="abk-date-field">
                                <span>Journey from</span>
                                <input
                                    type="date"
                                    value={filters.journeyDateFrom}
                                    onChange={(event) =>
                                        setFilters((prev) => ({ ...prev, journeyDateFrom: event.target.value }))
                                    }
                                />
                            </label>

                            <label className="abk-date-field">
                                <span>Journey to</span>
                                <input
                                    type="date"
                                    value={filters.journeyDateTo}
                                    onChange={(event) =>
                                        setFilters((prev) => ({ ...prev, journeyDateTo: event.target.value }))
                                    }
                                />
                            </label>

                            <button type="button" className="abk-btn abk-reset-btn" onClick={resetFilters}>
                                <FontAwesomeIcon icon={faRotateLeft} style={{ fontSize: 13 }} />
                                Reset
                            </button>
                        </div>
                    </section>

                    <section className="ad-panel ad-table-panel">
                        <div className="ad-panel-head">
                            <div>
                                <span className="ad-kicker">Report</span>
                                <h3>All Bookings</h3>
                            </div>
                            <FontAwesomeIcon icon={faCalendarDays} style={{ fontSize: 20 }} />
                        </div>

                        {loading ? (
                            <div className="ad-loading" aria-live="polite" style={{ padding: "60px 0" }}>
                                <FontAwesomeIcon icon={faArrowsRotate} className="ad-spin" style={{ fontSize: 26 }} />
                                <span>Loading bookings</span>
                            </div>
                        ) : (
                            <>
                                <div className="ad-table-wrap">
                                    <table className="ad-table">
                                        <thead>
                                            <tr>
                                                <th>PNR / Token</th>
                                                <th>Customer</th>
                                                <th>Train</th>
                                                <th>Route</th>
                                                <th>Journey</th>
                                                <th>Class</th>
                                                <th>Pax</th>
                                                <th>Fare</th>
                                                <th>Booking</th>
                                                <th>Payment</th>
                                                <th>Cancellation</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bookings.length ? (
                                                bookings.map((booking) => (
                                                    <tr key={booking.id}>
                                                        <td>
                                                            <strong>{booking.pnrNumber || "—"}</strong>
                                                            <span className="abk-token">{booking.bookingToken}</span>
                                                        </td>
                                                        <td>
                                                            <strong>{booking.user?.name || "—"}</strong>
                                                            <span>{booking.user?.email || "—"}</span>
                                                        </td>
                                                        <td>
                                                            <strong>{booking.train?.trainNo}</strong>
                                                            <span>{booking.train?.trainName}</span>
                                                        </td>
                                                        <td>
                                                            {booking.fromStation} → {booking.toStation}
                                                        </td>
                                                        <td>{formatJourneyDate(booking.journeyDate)}</td>
                                                        <td>{booking.classCode}</td>
                                                        <td>{formatNumber(booking.passengerCount)}</td>
                                                        <td>{formatCurrency(booking.totalFare)}</td>
                                                        <td>
                                                            <span className={statusClass(booking.bookingStatus)}>
                                                                {String(booking.bookingStatus).replaceAll("_", " ")}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className={statusClass(booking.paymentStatus)}>
                                                                {booking.paymentStatus}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className={statusClass(booking.cancellationStatus)}>
                                                                {String(booking.cancellationStatus).replaceAll("_", " ")}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <button
                                                                type="button"
                                                                className="ad-icon-btn"
                                                                title="View full details"
                                                                aria-label="View full booking details"
                                                                onClick={() => openBookingDetail(booking)}
                                                            >
                                                                <FontAwesomeIcon icon={faEye} style={{ fontSize: 16 }} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="12">
                                                        <div className="ad-empty">No bookings match these filters</div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="abk-pagination">
                                    <div className="abk-pagination__size">
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

                                    <div className="abk-pagination__controls">
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

            {selectedBooking && (
                <div className="abk-drawer-overlay" role="presentation" onClick={closeDetail}>
                    <aside
                        className="abk-drawer"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Booking details"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="abk-drawer__head">
                            <h2>Booking details</h2>
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
                                <span>Loading booking</span>
                            </div>
                        ) : detailError ? (
                            <div className="ad-alert" role="alert">
                                <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 18 }} />
                                <span>{detailError}</span>
                            </div>
                        ) : (
                            <div className="abk-drawer__body">
                                <div className="abk-drawer__summary">
                                    <div>
                                        <span className="abk-drawer__label">PNR</span>
                                        <strong>{selectedBooking.pnrNumber || "—"}</strong>
                                    </div>
                                    <div>
                                        <span className="abk-drawer__label">Booking token</span>
                                        <strong className="abk-token">{selectedBooking.bookingToken}</strong>
                                    </div>
                                    <div>
                                        <span className="abk-drawer__label">Created</span>
                                        <strong>{formatDateTime(selectedBooking.createdAt)}</strong>
                                    </div>
                                </div>

                                <div className="abk-drawer__statuses">
                                    <span className={statusClass(selectedBooking.bookingStatus)}>
                                        {String(selectedBooking.bookingStatus).replaceAll("_", " ")}
                                    </span>
                                    <span className={statusClass(selectedBooking.paymentStatus)}>
                                        {selectedBooking.paymentStatus}
                                    </span>
                                    <span className={statusClass(selectedBooking.reservationStatus)}>
                                        {selectedBooking.reservationStatus}
                                    </span>
                                    <span className={statusClass(selectedBooking.cancellationStatus)}>
                                        {String(selectedBooking.cancellationStatus).replaceAll("_", " ")}
                                    </span>
                                </div>

                                <section className="abk-drawer__section">
                                    <h3>Journey</h3>
                                    <div className="abk-kv-grid">
                                        <div>
                                            <span>Route</span>
                                            <strong>
                                                {selectedBooking.fromStation} → {selectedBooking.toStation}
                                            </strong>
                                        </div>
                                        <div>
                                            <span>Train</span>
                                            <strong>
                                                {selectedBooking.train?.trainNo} · {selectedBooking.train?.trainName}
                                            </strong>
                                        </div>
                                        <div>
                                            <span>Journey date</span>
                                            <strong>{formatJourneyDate(selectedBooking.journeyDate)}</strong>
                                        </div>
                                        <div>
                                            <span>Class</span>
                                            <strong>{selectedBooking.classCode}</strong>
                                        </div>
                                        <div>
                                            <span>Fare per passenger</span>
                                            <strong>{formatCurrency(selectedBooking.farePerPassenger)}</strong>
                                        </div>
                                        <div>
                                            <span>Total fare</span>
                                            <strong>{formatCurrency(selectedBooking.totalFare)}</strong>
                                        </div>
                                    </div>
                                </section>

                                <section className="abk-drawer__section">
                                    <h3>Customer</h3>
                                    <div className="abk-kv-grid">
                                        <div>
                                            <span>Name</span>
                                            <strong>{selectedBooking.user?.name || "—"}</strong>
                                        </div>
                                        <div>
                                            <span><FontAwesomeIcon icon={faEnvelope} style={{ fontSize: 11, marginRight: 4 }} />Email</span>
                                            <strong>{selectedBooking.contact?.email || selectedBooking.user?.email || "—"}</strong>
                                        </div>
                                        <div>
                                            <span><FontAwesomeIcon icon={faPhone} style={{ fontSize: 11, marginRight: 4 }} />Mobile</span>
                                            <strong>{selectedBooking.contact?.mobile || "—"}</strong>
                                        </div>
                                    </div>
                                </section>

                                <section className="abk-drawer__section">
                                    <h3>Passengers ({selectedBooking.passengers?.length || 0})</h3>
                                    <div className="ad-table-wrap">
                                        <table className="ad-table abk-passenger-table">
                                            <thead>
                                                <tr>
                                                    <th>Name</th>
                                                    <th>Age</th>
                                                    <th>Gender</th>
                                                    <th>Seat</th>
                                                    <th>Reservation</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(selectedBooking.passengers || []).map((passenger) => (
                                                    <tr key={passenger.id}>
                                                        <td>{passenger.name}</td>
                                                        <td>{passenger.age}</td>
                                                        <td>{passenger.gender}</td>
                                                        <td>{passenger.seatNumber || passenger.cancelledSeatNumber || "—"}</td>
                                                        <td>{passenger.reservationStatus}</td>
                                                        <td>
                                                            <span
                                                                className={statusClass(
                                                                    passenger.status === "CANCELLED" ? "cancelled" : "confirmed"
                                                                )}
                                                            >
                                                                {passenger.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>

                                {selectedBooking.cancellationHistory?.length > 0 && (
                                    <section className="abk-drawer__section">
                                        <h3>Cancellation history</h3>
                                        <div className="ad-timeline">
                                            {selectedBooking.cancellationHistory.map((event, index) => (
                                                <div className="ad-timeline-row" key={`${event.passengerName}-${index}`}>
                                                    <span className="ad-timeline-dot" />
                                                    <div>
                                                        <strong>{event.passengerName || "Passenger"}</strong>
                                                        <small>
                                                            {event.seatNumber ? `Seat ${event.seatNumber} · ` : ""}
                                                            {event.reason || "No reason given"}
                                                        </small>
                                                    </div>
                                                    <time>{formatDateTime(event.cancelledAt)}</time>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                <section className="abk-drawer__section">
                                    <h3>Payment & lifecycle</h3>
                                    <div className="abk-kv-grid">
                                        <div>
                                            <span>Payment reference</span>
                                            <strong>{selectedBooking.paymentId?._id || selectedBooking.paymentId || "—"}</strong>
                                        </div>
                                        <div>
                                            <span>Paid at</span>
                                            <strong>{formatDateTime(selectedBooking.paidAt)}</strong>
                                        </div>
                                        <div>
                                            <span>Ticket generated</span>
                                            <strong>{formatDateTime(selectedBooking.ticketGeneratedAt)}</strong>
                                        </div>
                                        <div>
                                            <span>Cancelled at</span>
                                            <strong>{formatDateTime(selectedBooking.cancelledAt)}</strong>
                                        </div>
                                        <div>
                                            <span>Cancellation reason</span>
                                            <strong>{selectedBooking.cancellationReason || "—"}</strong>
                                        </div>
                                        <div>
                                            <span>Last updated</span>
                                            <strong>{formatDateTime(selectedBooking.updatedAt)}</strong>
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

export default AdminBookings;