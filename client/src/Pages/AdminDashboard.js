import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { href, Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowsRotate,
    faBars,
    faBell,
    faCalendarDays,
    faChartLine,
    faCircleCheck,
    faClock,
    faCreditCard,
    faDatabase,
    faGear,
    faHouse,
    faLocationDot,
    faMagnifyingGlass,
    faMoon,
    faPlus,
    faRightFromBracket,
    faSackDollar,
    faShieldHalved,
    faSun,
    faTicket,
    faTrain,
    faTriangleExclamation,
    faUser,
    faXmark
} from "@fortawesome/free-solid-svg-icons";
import "../Styles/AdminDashboard.css";
import RailGo from "../Assets/logo.png";
import { icon } from "@fortawesome/fontawesome-svg-core";

const AUTH_API_BASE = `${API_BASE_URL}/admin/auth`;
const DASHBOARD_API_BASE = `${API_BASE_URL}/admin/dashboard`;

const authApi = axios.create({ baseURL: AUTH_API_BASE, withCredentials: true });
const dashboardApi = axios.create({ baseURL: DASHBOARD_API_BASE, withCredentials: true });

const currencyFormat = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
});

const numberFormat = new Intl.NumberFormat("en-IN");

function formatCurrency(value) {
    return currencyFormat.format(Number(value || 0));
}

function formatNumber(value) {
    return numberFormat.format(Number(value || 0));
}

function formatDateTime(value) {
    if (!value) return "Not recorded";

    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(value));
}

function formatDay(value) {
    return new Intl.DateTimeFormat("en-IN", {
        weekday: "short"
    }).format(new Date(`${value}T00:00:00`));
}

function cleanAction(action) {
    return String(action || "Activity").replaceAll("_", " ").toLowerCase();
}

function statusClass(status) {
    return `ad-status ad-status-${String(status || "unknown").replaceAll("_", "-").toLowerCase()}`;
}

function AdminDashboard() {
    const navigate = useNavigate();

    const [admin, setAdmin] = useState(null);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [theme, setTheme] = useState(() => localStorage.getItem("admin-dashboard-theme") || "light");

    useEffect(() => {
        const favicon = document.querySelector("link[rel='icon']");

        if (favicon) {
            favicon.href = "/logo.png";
            favicon.type = "image/png";
        }

        document.title = "Train Booking - Admin Dashboard";

        return () => {
            favicon.href = "/logo.png";
            favicon.type = "image/png";
            document.title = "Train Booking";
        };
    }, []);

    const fetchDashboard = useCallback(async () => {
        const [meRes, overviewRes] = await Promise.all([
            authApi.get("/me"),
            dashboardApi.get("/overview")
        ]);

        setAdmin(meRes.data.admin || overviewRes.data.admin);
        setOverview(overviewRes.data);
    }, []);

    const loadDashboard = useCallback(async ({ quiet = false } = {}) => {
        if (quiet) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        setError("");

        try {
            await fetchDashboard();
        } catch (err) {
            if (err.response?.status === 401) {
                try {
                    await authApi.post("/refresh");
                    await fetchDashboard();
                } catch {
                    navigate("/admin-login", { replace: true });
                }
            } else {
                setError(err.response?.data?.message || "Dashboard data is not available right now.");
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [fetchDashboard, navigate]);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    useEffect(() => {
        localStorage.setItem("admin-dashboard-theme", theme);
    }, [theme]);

    const stats = overview?.stats || {};
    const trend = overview?.bookingTrend || [];
    const maxTrendCount = Math.max(1, ...trend.map((item) => item.count || 0));
    const statusBreakdown = overview?.statusBreakdown || {};
    const statusTotal = Object.values(statusBreakdown).reduce((sum, count) => sum + count, 0) || 1;

    const filteredBookings = useMemo(() => {
        const term = search.trim().toLowerCase();
        const bookings = overview?.recentBookings || [];

        if (!term) return bookings;

        return bookings.filter((booking) => {
            const haystack = [
                booking.pnrNumber,
                booking.trainNo,
                booking.trainName,
                booking.fromStation,
                booking.toStation,
                booking.classCode,
                booking.status,
                booking.paymentStatus
            ]
                .join(" ")
                .toLowerCase();

            return haystack.includes(term);
        });
    }, [overview, search]);

    const navItems = [
        { label: "Overview", href: "#overview", icon: faHouse, type: "hash", active: true },
        { label: "Trains", href: "/admin/trains", icon: faTrain, type: "route" },
        { label: "Add Journey + Seats", href: "/admin/release-seats", icon: faCalendarDays, type: "route" },
        { label: "Stations", href: "/admin/stations", icon: faLocationDot, type: "route"},
        { label: "Bookings", href: "/admin/bookings", icon: faTicket, type: "hash" },
        { label: "Payments", href: "/admin/payments", icon: faCreditCard, type: "route" },
        { label: "Security", href: "#security", icon: faShieldHalved, type: "hash" }
    ];

    const summaryCards = [
        {
            label: "Total Bookings",
            value: formatNumber(stats.totalBookings),
            meta: `${formatNumber(stats.todayBookings)} today`,
            icon: faTicket,
            tone: "cyan"
        },
        {
            label: "Revenue",
            value: formatCurrency(stats.totalRevenue),
            meta: `${formatCurrency(stats.todayRevenue)} today`,
            icon: faSackDollar,
            tone: "green"
        },
        {
            label: "Active Trains",
            value: formatNumber(stats.activeTrains),
            meta: `${formatNumber(stats.inactiveTrains)} inactive`,
            icon: faTrain,
            tone: "violet"
        },
        {
            label: "Stations",
            value: formatNumber(stats.stationCount),
            meta: `${formatNumber(stats.totalSeats)} tracked seats`,
            icon: faLocationDot,
            tone: "amber"
        }
    ];

    const statusRows = [
        { label: "Confirmed", key: "confirmed", value: statusBreakdown.confirmed || 0 },
        { label: "Pending", key: "pending", value: statusBreakdown.pending || 0 },
        { label: "Seats Selected", key: "seats_selected", value: statusBreakdown.seats_selected || 0 },
        { label: "Processing", key: "payment_processing", value: statusBreakdown.payment_processing || 0 },
        { label: "Cancelled", key: "cancelled", value: statusBreakdown.cancelled || 0 }
    ];

    const handleLogout = async () => {
        try {
            const csrfRes = await authApi.get("/csrf-token");
            await authApi.post(
                "/logout",
                {},
                { headers: { "X-CSRF-Token": csrfRes.data.csrfToken } }
            );
        } finally {
            navigate("/admin-login", { replace: true });
        }
    };

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
                    <img src={RailGo} alt="" style={{ height: '30px', width: '30px', borderRadius: '25px' }} />
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
                    {navItems.map((item) => {
                        if (item.type === "route") {
                            return (
                                <Link
                                    key={item.label}
                                    to={item.href}
                                    className={item.active ? "is-active" : ""}
                                    onClick={() => setSidebarOpen(false)}
                                >
                                    <FontAwesomeIcon icon={item.icon} style={{ fontSize: 18 }} />
                                    <span>{item.label}</span>
                                </Link>
                            );
                        }

                        return (
                            <a
                                key={item.label}
                                href={item.href}
                                className={item.active ? "is-active" : ""}
                                onClick={() => setSidebarOpen(false)}
                            >
                                <FontAwesomeIcon icon={item.icon} style={{ fontSize: 18 }} />
                                <span>{item.label}</span>
                            </a>
                        );
                    })}
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
                            <span className="ad-kicker">Secure Admin</span>
                            <h1>Dashboard</h1>
                        </div>
                    </div>

                    <div className="ad-top-actions">
                        <label className="ad-search">
                            <FontAwesomeIcon icon={faMagnifyingGlass} style={{ fontSize: 18 }} />
                            <input
                                type="search"
                                placeholder="Search bookings"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                            />
                        </label>

                        <button className="ad-icon-btn" type="button" title="Notifications" aria-label="Notifications">
                            <FontAwesomeIcon icon={faBell} style={{ fontSize: 19 }} />
                        </button>
                        <button
                            className="ad-icon-btn"
                            type="button"
                            title="Refresh"
                            aria-label="Refresh dashboard"
                            onClick={() => loadDashboard({ quiet: true })}
                            disabled={refreshing}
                        >
                            <FontAwesomeIcon icon={faArrowsRotate} style={{ fontSize: 19 }} className={refreshing ? "ad-spin" : ""} />
                        </button>
                        <button
                            className="ad-icon-btn"
                            type="button"
                            title="Theme"
                            aria-label="Toggle theme"
                            onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
                        >
                            {theme === "dark" ? <FontAwesomeIcon icon={faSun} style={{ fontSize: 19 }} /> : <FontAwesomeIcon icon={faMoon} style={{ fontSize: 19 }} />}
                        </button>
                        <button className="ad-logout" type="button" onClick={handleLogout}>
                            <FontAwesomeIcon icon={faRightFromBracket} style={{ fontSize: 18 }} />
                            <span>Sign out</span>
                        </button>
                    </div>
                </header>

                {loading ? (
                    <section className="ad-loading" aria-live="polite">
                        <FontAwesomeIcon icon={faArrowsRotate} className="ad-spin" style={{ fontSize: 30 }} />
                        <span>Loading dashboard</span>
                    </section>
                ) : (
                    <div className="ad-content">
                        {error && (
                            <div className="ad-alert" role="alert">
                                <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 18 }} />
                                <span>{error}</span>
                            </div>
                        )}

                        <section className="ad-hero" id="overview">
                            <div>
                                <span className="ad-kicker">Today</span>
                                <h2>Operations Snapshot</h2>
                            </div>
                            <div className="ad-hero-meta">
                                <FontAwesomeIcon icon={faClock} style={{ fontSize: 18 }} />
                                <span>Last login {formatDateTime(admin?.lastLoginAt || overview?.admin?.lastLoginAt)}</span>
                            </div>
                        </section>

                        <section className="ad-stats-grid" aria-label="Admin metrics">
                            {summaryCards.map((card) => {
                                const Icon = card.icon;
                                return (
                                    <article className="ad-stat-card" data-tone={card.tone} key={card.label}>
                                        <div className="ad-stat-icon">
                                            <FontAwesomeIcon icon={card.icon} style={{ fontSize: 21 }} />
                                        </div>
                                        <span>{card.label}</span>
                                        <strong>{card.value}</strong>
                                        <small>{card.meta}</small>
                                    </article>
                                );
                            })}
                        </section>

                        <section className="ad-grid ad-grid-main">
                            <article className="ad-panel" id="bookings">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">7 Day Trend</span>
                                        <h3>Booking Volume</h3>
                                    </div>
                                    <FontAwesomeIcon icon={faChartLine} style={{ fontSize: 20 }} />
                                </div>

                                <div className="ad-chart">
                                    {trend.map((item) => (
                                        <div className="ad-chart-day" key={item.date}>
                                            <div className="ad-chart-track">
                                                <span
                                                    style={{
                                                        height: `${Math.max(8, (item.count / maxTrendCount) * 100)}%`
                                                    }}
                                                />
                                            </div>
                                            <strong>{formatNumber(item.count)}</strong>
                                            <small>{formatDay(item.date)}</small>
                                        </div>
                                    ))}
                                </div>
                            </article>

                            <article className="ad-panel">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Lifecycle</span>
                                        <h3>Booking Status</h3>
                                    </div>
                                    <FontAwesomeIcon icon={faCircleCheck} style={{ fontSize: 20 }} />
                                </div>

                                <div className="ad-progress-list">
                                    {statusRows.map((row) => (
                                        <div className="ad-progress-row" key={row.key}>
                                            <div>
                                                <span>{row.label}</span>
                                                <strong>{formatNumber(row.value)}</strong>
                                            </div>
                                            <div className="ad-progress-track">
                                                <span style={{ width: `${Math.round((row.value / statusTotal) * 100)}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </article>
                        </section>

                        <section className="ad-grid ad-grid-secondary">
                            <article className="ad-panel" id="payments">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Collection</span>
                                        <h3>Payment Mix</h3>
                                    </div>
                                    <FontAwesomeIcon icon={faCreditCard} style={{ fontSize: 20 }} />
                                </div>

                                <div className="ad-list">
                                    {(overview?.paymentMethods || []).length ? (
                                        overview.paymentMethods.map((method) => (
                                            <div className="ad-list-row" key={method.method}>
                                                <span>{method.method}</span>
                                                <strong>{formatCurrency(method.revenue)}</strong>
                                                <small>{formatNumber(method.count)} payments</small>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="ad-empty">No successful payments yet</div>
                                    )}
                                </div>
                            </article>

                            <article className="ad-panel" id="trains">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Demand</span>
                                        <h3>Top Trains</h3>
                                    </div>
                                    <Link className="ad-panel-action" to="/admin/trains/add" aria-label="Add train">
                                        <FontAwesomeIcon icon={faPlus} style={{ fontSize: 18 }} />
                                    </Link>
                                </div>

                                <div className="ad-list">
                                    {(overview?.topTrains || []).length ? (
                                        overview.topTrains.map((train) => (
                                            <div className="ad-list-row" key={train.trainNo}>
                                                <span>{train.trainNo}</span>
                                                <strong>{formatNumber(train.bookings)} bookings</strong>
                                                <small>{formatCurrency(train.revenue)}</small>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="ad-empty">No bookings to rank yet</div>
                                    )}
                                </div>
                            </article>

                            <article className="ad-panel">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Inventory</span>
                                        <h3>Seat Health</h3>
                                    </div>
                                    <FontAwesomeIcon icon={faDatabase} style={{ fontSize: 20 }} />
                                </div>

                                <div className="ad-seat-grid">
                                    <div>
                                        <span>Available</span>
                                        <strong>{formatNumber(stats.availableSeats)}</strong>
                                    </div>
                                    <div>
                                        <span>Booked</span>
                                        <strong>{formatNumber(stats.bookedSeats)}</strong>
                                    </div>
                                    <div>
                                        <span>Held</span>
                                        <strong>{formatNumber(stats.heldSeats)}</strong>
                                    </div>
                                    <div>
                                        <span>Blocked</span>
                                        <strong>{formatNumber(stats.blockedSeats)}</strong>
                                    </div>
                                </div>
                            </article>
                        </section>

                        <section className="ad-grid ad-grid-bottom">
                            <article className="ad-panel ad-table-panel">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Latest</span>
                                        <h3>Recent Bookings</h3>
                                    </div>
                                    <FontAwesomeIcon icon={faCalendarDays} style={{ fontSize: 20 }} />
                                </div>

                                <div className="ad-table-wrap">
                                    <table className="ad-table">
                                        <thead>
                                            <tr>
                                                <th>PNR</th>
                                                <th>Train</th>
                                                <th>Route</th>
                                                <th>Passengers</th>
                                                <th>Fare</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredBookings.length ? (
                                                filteredBookings.map((booking) => (
                                                    <tr key={booking.id}>
                                                        <td>{booking.pnrNumber}</td>
                                                        <td>
                                                            <strong>{booking.trainNo}</strong>
                                                            <span>{booking.trainName}</span>
                                                        </td>
                                                        <td>{booking.fromStation} to {booking.toStation}</td>
                                                        <td>{formatNumber(booking.passengerCount)}</td>
                                                        <td>{formatCurrency(booking.totalFare)}</td>
                                                        <td>
                                                            <span className={statusClass(booking.status)}>
                                                                {String(booking.status).replaceAll("_", " ")}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="6">
                                                        <div className="ad-empty">No bookings match this search</div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </article>

                            <article className="ad-panel" id="security">
                                <div className="ad-panel-head">
                                    <div>
                                        <span className="ad-kicker">Audit</span>
                                        <h3>Security Events</h3>
                                    </div>
                                    <FontAwesomeIcon icon={faGear} style={{ fontSize: 20 }} />
                                </div>

                                <div className="ad-timeline">
                                    {(overview?.recentAuditLogs || []).length ? (
                                        overview.recentAuditLogs.map((event) => (
                                            <div className="ad-timeline-row" key={event.id}>
                                                <span className="ad-timeline-dot" />
                                                <div>
                                                    <strong>{cleanAction(event.action)}</strong>
                                                    <small>{event.reason || event.emailAttempted || "Admin activity"}</small>
                                                </div>
                                                <time>{formatDateTime(event.createdAt)}</time>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="ad-empty">No audit events yet</div>
                                    )}
                                </div>
                            </article>
                        </section>
                    </div>
                )}
            </main>
        </div>
    );
}

export default AdminDashboard;