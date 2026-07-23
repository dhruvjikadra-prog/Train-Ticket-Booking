import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { Link, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowsRotate,
    faBars,
    faChevronLeft,
    faChevronRight,
    faClipboardList,
    faCreditCard,
    faFilter,
    faLocationDot,
    faLock,
    faMagnifyingGlass,
    faMoon,
    faPenToSquare,
    faPlus,
    faPowerOff,
    faRightFromBracket,
    faRotateLeft,
    faSun,
    faTrain,
    faTrashCan,
    faTriangleExclamation,
    faUser,
    faUserShield,
    faXmark
} from "@fortawesome/free-solid-svg-icons";
import "../Styles/AdminDashboard.css";
import "../Styles/AdminStations.css";
import RailGo from "../Assets/logo.png";

const AUTH_API_BASE = `${API_BASE_URL}/admin/auth`;
const STATIONS_API_BASE = `${API_BASE_URL}/admin/stations`;

const authApi = axios.create({ baseURL: AUTH_API_BASE, withCredentials: true });
const stationsApi = axios.create({ baseURL: STATIONS_API_BASE, withCredentials: true });

const formatDateTime = (value) => {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(value));
};

const statusClass = (status) =>
    `ad-status ad-status-${String(status || "unknown").toLowerCase()}`;

const DEFAULT_FILTERS = { search: "", status: "" };

const STATUS_OPTIONS = ["ACTIVE", "INACTIVE"];

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const EMPTY_FORM = { name: "", code: "", city: "", state: "", desc: "", status: "ACTIVE" };

const CODE_PATTERN = /^[A-Z]{2,10}$/;
const PLACE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z\s.'-]*$/;

// Mirrors the backend's validateStationPayload — gives instant feedback
// instead of waiting on a round trip, but the server re-checks everything
// (including code uniqueness) regardless of what this returns.
const validateForm = (values) => {
    const errors = {};

    const name = values.name.trim();
    if (!name) {
        errors.name = "Station name is required.";
    } else if (name.length < 2 || name.length > 100 || !PLACE_NAME_PATTERN.test(name)) {
        errors.name = "Enter a valid station name (letters only).";
    }

    const code = values.code.trim().toUpperCase();
    if (!code) {
        errors.code = "Station code is required.";
    } else if (!CODE_PATTERN.test(code)) {
        errors.code = "2-10 uppercase letters (e.g. NDLS).";
    }

    const city = values.city.trim();
    if (!city) {
        errors.city = "City is required.";
    } else if (city.length < 2 || city.length > 100 || !PLACE_NAME_PATTERN.test(city)) {
        errors.city = "Enter a valid city name.";
    }

    const state = values.state.trim();
    if (!state) {
        errors.state = "State is required.";
    } else if (state.length < 2 || state.length > 100 || !PLACE_NAME_PATTERN.test(state)) {
        errors.state = "Enter a valid state name.";
    }

    if (values.desc && values.desc.trim().length > 500) {
        errors.desc = "Description must be under 500 characters.";
    }

    return errors;
};

function AdminStations() {
    const navigate = useNavigate();

    const [admin, setAdmin] = useState(null);
    const [authChecked, setAuthChecked] = useState(false);
    const [accessDenied, setAccessDenied] = useState("");

    const [stations, setStations] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");

    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [searchInput, setSearchInput] = useState("");

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [theme, setTheme] = useState(() => localStorage.getItem("admin-dashboard-theme") || "light");

    // Add/Edit form modal
    const [formOpen, setFormOpen] = useState(false);
    const [formMode, setFormMode] = useState("create"); // "create" | "edit"
    const [formValues, setFormValues] = useState(EMPTY_FORM);
    const [formTouched, setFormTouched] = useState({});
    const [formSubmitting, setFormSubmitting] = useState(false);
    const [formServerError, setFormServerError] = useState("");
    const [editingId, setEditingId] = useState(null);

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    // Per-row status toggle in flight
    const [togglingId, setTogglingId] = useState(null);

    useEffect(() => {
        const favicon = document.querySelector("link[rel='icon']");

        if (favicon) {
            favicon.href = "/logo.png";
            favicon.type = "image/png";
        }

        document.title = "Train Booking - Admin Stations";

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

    // Lock background scroll while a modal/drawer is open.
    useEffect(() => {
        if (!formOpen && !deleteTarget) return undefined;
        const { style } = document.body;
        const previousOverflow = style.overflow;
        style.overflow = "hidden";
        return () => {
            style.overflow = previousOverflow;
        };
    }, [formOpen, deleteTarget]);

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

    const loadStations = useCallback(
        async ({ page = 1, limit = pagination.limit, quiet = false } = {}) => {
            if (quiet) setRefreshing(true);
            else setLoading(true);
            setError("");

            try {
                const response = await stationsApi.get("/", { params: buildParams(page, limit) });
                setStations(response.data.stations || []);
                setPagination(
                    response.data.pagination || { page, limit, total: 0, totalPages: 1 }
                );
            } catch (requestError) {
                if (requestError.response?.status === 401) {
                    try {
                        await authApi.post("/refresh");
                        const retry = await stationsApi.get("/", { params: buildParams(page, limit) });
                        setStations(retry.data.stations || []);
                        setPagination(retry.data.pagination || { page, limit, total: 0, totalPages: 1 });
                    } catch {
                        navigate("/admin-login", { replace: true });
                        return;
                    }
                } else if (requestError.response?.status === 403) {
                    setAccessDenied(
                        requestError.response?.data?.message ||
                        "Your admin role doesn't include access to station management."
                    );
                } else {
                    setError(
                        requestError.response?.data?.message ||
                        "Unable to load stations right now."
                    );
                }
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [buildParams, navigate, pagination.limit]
    );

    // Verify the admin session up front, same pattern as the rest of the
    // admin app, before ever requesting station data.
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
        loadStations({ page: 1, limit: pagination.limit });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authChecked, filters]);

    const resetFilters = () => {
        setSearchInput("");
        setFilters(DEFAULT_FILTERS);
    };

    const goToPage = (page) => {
        if (page < 1 || page > pagination.totalPages || page === pagination.page) return;
        loadStations({ page, limit: pagination.limit });
    };

    const changePageSize = (limit) => {
        loadStations({ page: 1, limit });
    };

    const handleLogout = async () => {
        try {
            const csrfRes = await authApi.get("/csrf-token");
            await authApi.post("/logout", {}, { headers: { "X-CSRF-Token": csrfRes.data.csrfToken } });
        } finally {
            navigate("/admin-login", { replace: true });
        }
    };

    // ── Add / Edit form ──────────────────────────────────────────────

    const openCreateForm = () => {
        setFormMode("create");
        setEditingId(null);
        setFormValues(EMPTY_FORM);
        setFormTouched({});
        setFormServerError("");
        setFormOpen(true);
    };

    const openEditForm = (station) => {
        setFormMode("edit");
        setEditingId(station.id);
        setFormValues({
            name: station.name || "",
            code: station.code || "",
            city: station.city || "",
            state: station.state || "",
            desc: station.desc || "",
            status: station.status || "ACTIVE"
        });
        setFormTouched({});
        setFormServerError("");
        setFormOpen(true);
    };

    const closeForm = () => {
        if (formSubmitting) return;
        setFormOpen(false);
    };

    const formErrors = validateForm(formValues);
    const formValid = Object.keys(formErrors).length === 0;

    const markFormTouched = (field) => setFormTouched((prev) => ({ ...prev, [field]: true }));

    const submitForm = async (event) => {
        event.preventDefault();

        setFormTouched({ name: true, code: true, city: true, state: true, desc: true });
        setFormServerError("");

        if (!formValid) return;

        setFormSubmitting(true);

        const payload = {
            name: formValues.name.trim(),
            code: formValues.code.trim().toUpperCase(),
            city: formValues.city.trim(),
            state: formValues.state.trim(),
            desc: formValues.desc.trim(),
            status: formValues.status
        };

        try {
            if (formMode === "create") {
                await stationsApi.post("/", payload);
            } else {
                await stationsApi.put(`/${editingId}`, payload);
            }

            setFormOpen(false);
            loadStations({ page: pagination.page, quiet: true });
        } catch (requestError) {
            if (requestError.response?.status === 401) {
                navigate("/admin-login", { replace: true });
                return;
            }

            const serverErrors = requestError.response?.data?.errors;
            if (serverErrors) {
                // Surface field-specific server errors (e.g. duplicate code
                // caught by a race with another admin) the same way as the
                // client-side ones.
                setFormServerError(
                    requestError.response?.data?.message || "Please fix the highlighted fields."
                );
            } else {
                setFormServerError(
                    requestError.response?.data?.message ||
                    `Unable to ${formMode === "create" ? "create" : "update"} this station right now.`
                );
            }
        } finally {
            setFormSubmitting(false);
        }
    };

    // ── Status toggle ────────────────────────────────────────────────

    const toggleStatus = async (station) => {
        setTogglingId(station.id);
        const nextStatus = station.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

        try {
            await stationsApi.patch(`/${station.id}/status`, { status: nextStatus });
            loadStations({ page: pagination.page, quiet: true });
        } catch (requestError) {
            if (requestError.response?.status === 401) {
                navigate("/admin-login", { replace: true });
                return;
            }
            setError(
                requestError.response?.data?.message || "Unable to update this station's status."
            );
        } finally {
            setTogglingId(null);
        }
    };

    // ── Delete ───────────────────────────────────────────────────────

    const openDeleteConfirm = (station) => {
        setDeleteTarget(station);
        setDeleteError("");
    };

    const closeDeleteConfirm = () => {
        if (deleting) return;
        setDeleteTarget(null);
        setDeleteError("");
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError("");

        try {
            await stationsApi.delete(`/${deleteTarget.id}`);
            setDeleteTarget(null);

            const isLastRowOnPage = stations.length === 1 && pagination.page > 1;
            loadStations({ page: isLastRowOnPage ? pagination.page - 1 : pagination.page, quiet: true });
        } catch (requestError) {
            if (requestError.response?.status === 401) {
                navigate("/admin-login", { replace: true });
                return;
            }
            setDeleteError(
                requestError.response?.data?.message || "Unable to delete this station right now."
            );
        } finally {
            setDeleting(false);
        }
    };

    const navItems = [
        { label: "Dashboard", href: "/admin/dashboard", icon: faTrain, type: "route" },
        { label: "Stations", href: "/admin/stations", icon: faLocationDot, type: "route", active: true }
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
                <section className="ads-denied">
                    <FontAwesomeIcon icon={faLock} style={{ fontSize: 30 }} />
                    <h2>Access denied</h2>
                    <p>{accessDenied}</p>
                    <Link to="/admin/dashboard" className="ads-btn ads-btn--primary">
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
                            <h1>Stations</h1>
                        </div>
                    </div>

                    <div className="ad-top-actions">
                        <button
                            className="ad-icon-btn"
                            type="button"
                            title="Refresh"
                            aria-label="Refresh stations"
                            onClick={() => loadStations({ page: pagination.page, quiet: true })}
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

                    <section className="ads-filters">
                        <div className="ads-filters__row">
                            <label className="ad-search ads-search">
                                <FontAwesomeIcon icon={faMagnifyingGlass} style={{ fontSize: 18 }} />
                                <input
                                    type="search"
                                    placeholder="Search by name, code, city or state"
                                    value={searchInput}
                                    onChange={(event) => setSearchInput(event.target.value)}
                                />
                            </label>

                            <button
                                type="button"
                                className="ads-btn ads-btn--primary ads-add-btn"
                                onClick={openCreateForm}
                            >
                                <FontAwesomeIcon icon={faPlus} style={{ fontSize: 14 }} />
                                Add Station
                            </button>
                        </div>

                        <div className="ads-filters__row ads-filters__row--wrap">
                            <span className="ads-filters__label">
                                <FontAwesomeIcon icon={faFilter} style={{ fontSize: 12 }} /> Filters
                            </span>

                            <select
                                value={filters.status}
                                onChange={(event) =>
                                    setFilters((prev) => ({ ...prev, status: event.target.value }))
                                }
                            >
                                <option value="">Status</option>
                                {STATUS_OPTIONS.map((status) => (
                                    <option key={status} value={status}>
                                        {status}
                                    </option>
                                ))}
                            </select>

                            <button type="button" className="ads-btn ads-reset-btn" onClick={resetFilters}>
                                <FontAwesomeIcon icon={faRotateLeft} style={{ fontSize: 13 }} />
                                Reset
                            </button>
                        </div>
                    </section>

                    <section className="ad-panel ad-table-panel">
                        <div className="ad-panel-head">
                            <div>
                                <span className="ad-kicker">Master List</span>
                                <h3>All Stations</h3>
                            </div>
                            <FontAwesomeIcon icon={faLocationDot} style={{ fontSize: 20 }} />
                        </div>

                        {loading ? (
                            <div className="ad-loading" aria-live="polite" style={{ padding: "60px 0" }}>
                                <FontAwesomeIcon icon={faArrowsRotate} className="ad-spin" style={{ fontSize: 26 }} />
                                <span>Loading stations</span>
                            </div>
                        ) : (
                            <>
                                <div className="ad-table-wrap">
                                    <table className="ad-table">
                                        <thead>
                                            <tr>
                                                <th>Code</th>
                                                <th>Name</th>
                                                <th>City</th>
                                                <th>State</th>
                                                <th>Status</th>
                                                <th>Updated</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stations.length ? (
                                                stations.map((station) => (
                                                    <tr key={station.id}>
                                                        <td>
                                                            <strong className="ads-code-chip">{station.code}</strong>
                                                        </td>
                                                        <td>
                                                            <strong>{station.name}</strong>
                                                            {station.desc && (
                                                                <span className="ads-desc">{station.desc}</span>
                                                            )}
                                                        </td>
                                                        <td>{station.city}</td>
                                                        <td>{station.state}</td>
                                                        <td>
                                                            <span className={statusClass(station.status)}>
                                                                {station.status}
                                                            </span>
                                                        </td>
                                                        <td>{formatDateTime(station.updatedAt)}</td>
                                                        <td>
                                                            <div className="ads-row-actions">
                                                                <button
                                                                    type="button"
                                                                    className="ad-icon-btn"
                                                                    title={
                                                                        station.status === "ACTIVE"
                                                                            ? "Mark inactive"
                                                                            : "Mark active"
                                                                    }
                                                                    aria-label={`Toggle status for ${station.name}`}
                                                                    disabled={togglingId === station.id}
                                                                    onClick={() => toggleStatus(station)}
                                                                >
                                                                    <FontAwesomeIcon
                                                                        icon={faPowerOff}
                                                                        style={{ fontSize: 15 }}
                                                                        className={togglingId === station.id ? "ad-spin" : ""}
                                                                    />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="ad-icon-btn"
                                                                    title="Edit station"
                                                                    aria-label={`Edit ${station.name}`}
                                                                    onClick={() => openEditForm(station)}
                                                                >
                                                                    <FontAwesomeIcon icon={faPenToSquare} style={{ fontSize: 15 }} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="ad-icon-btn ads-danger-icon"
                                                                    title="Delete station"
                                                                    aria-label={`Delete ${station.name}`}
                                                                    onClick={() => openDeleteConfirm(station)}
                                                                >
                                                                    <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 15 }} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="7">
                                                        <div className="ad-empty">No stations match these filters</div>
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="ads-pagination">
                                    <div className="ads-pagination__size">
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

                                    <div className="ads-pagination__controls">
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
                                            {pagination.total} total
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

            {formOpen && (
                <div className="ads-modal-overlay" role="presentation" onClick={closeForm}>
                    <div
                        className="ads-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label={formMode === "create" ? "Add station" : "Edit station"}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="ads-modal__head">
                            <h2>{formMode === "create" ? "Add Station" : "Edit Station"}</h2>
                            <button
                                type="button"
                                className="ad-icon-btn"
                                aria-label="Close form"
                                onClick={closeForm}
                                disabled={formSubmitting}
                            >
                                <FontAwesomeIcon icon={faXmark} style={{ fontSize: 18 }} />
                            </button>
                        </div>

                        <form onSubmit={submitForm} noValidate>
                            <fieldset className="ads-fieldset" disabled={formSubmitting}>
                                {formServerError && (
                                    <div className="ad-alert" role="alert">
                                        <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 16 }} />
                                        <span>{formServerError}</span>
                                    </div>
                                )}

                                <div className="ads-form-grid">
                                    <div className="ads-form-group">
                                        <label>Station Name</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Surat"
                                            value={formValues.name}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, name: event.target.value }))
                                            }
                                            onBlur={() => markFormTouched("name")}
                                            className={formTouched.name && formErrors.name ? "ads-input-error" : ""}
                                        />
                                        {formTouched.name && formErrors.name && (
                                            <span className="ads-field-error">{formErrors.name}</span>
                                        )}
                                    </div>

                                    <div className="ads-form-group">
                                        <label>Station Code</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. ST"
                                            maxLength={10}
                                            value={formValues.code}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({
                                                    ...prev,
                                                    code: event.target.value.toUpperCase().replace(/[^A-Z]/g, "")
                                                }))
                                            }
                                            onBlur={() => markFormTouched("code")}
                                            className={formTouched.code && formErrors.code ? "ads-input-error" : ""}
                                        />
                                        {formTouched.code && formErrors.code && (
                                            <span className="ads-field-error">{formErrors.code}</span>
                                        )}
                                    </div>

                                    <div className="ads-form-group">
                                        <label>City</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Surat"
                                            value={formValues.city}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, city: event.target.value }))
                                            }
                                            onBlur={() => markFormTouched("city")}
                                            className={formTouched.city && formErrors.city ? "ads-input-error" : ""}
                                        />
                                        {formTouched.city && formErrors.city && (
                                            <span className="ads-field-error">{formErrors.city}</span>
                                        )}
                                    </div>

                                    <div className="ads-form-group">
                                        <label>State</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Gujarat"
                                            value={formValues.state}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, state: event.target.value }))
                                            }
                                            onBlur={() => markFormTouched("state")}
                                            className={formTouched.state && formErrors.state ? "ads-input-error" : ""}
                                        />
                                        {formTouched.state && formErrors.state && (
                                            <span className="ads-field-error">{formErrors.state}</span>
                                        )}
                                    </div>

                                    <div className="ads-form-group ads-form-group--full">
                                        <label>Description (optional)</label>
                                        <textarea
                                            rows={3}
                                            maxLength={500}
                                            placeholder="Any notes about this station"
                                            value={formValues.desc}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, desc: event.target.value }))
                                            }
                                            onBlur={() => markFormTouched("desc")}
                                            className={formTouched.desc && formErrors.desc ? "ads-input-error" : ""}
                                        />
                                        {formTouched.desc && formErrors.desc && (
                                            <span className="ads-field-error">{formErrors.desc}</span>
                                        )}
                                    </div>

                                    <div className="ads-form-group">
                                        <label>Status</label>
                                        <select
                                            value={formValues.status}
                                            onChange={(event) =>
                                                setFormValues((prev) => ({ ...prev, status: event.target.value }))
                                            }
                                        >
                                            {STATUS_OPTIONS.map((status) => (
                                                <option key={status} value={status}>
                                                    {status}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="ads-modal__actions">
                                    <button type="button" className="ads-btn" onClick={closeForm}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="ads-btn ads-btn--primary">
                                        {formSubmitting
                                            ? "Saving…"
                                            : formMode === "create"
                                                ? "Add Station"
                                                : "Save Changes"}
                                    </button>
                                </div>
                            </fieldset>
                        </form>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div className="ads-modal-overlay" role="presentation" onClick={closeDeleteConfirm}>
                    <div
                        className="ads-modal ads-modal--sm"
                        role="alertdialog"
                        aria-modal="true"
                        aria-label="Confirm delete"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="ads-modal__head">
                            <h2>Delete Station</h2>
                            <button
                                type="button"
                                className="ad-icon-btn"
                                aria-label="Close"
                                onClick={closeDeleteConfirm}
                                disabled={deleting}
                            >
                                <FontAwesomeIcon icon={faXmark} style={{ fontSize: 18 }} />
                            </button>
                        </div>

                        <div className="ads-confirm-body">
                            <div className="ads-confirm-icon">
                                <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 26 }} />
                            </div>
                            <p>
                                Delete <strong>{deleteTarget.name} ({deleteTarget.code})</strong>? This
                                can't be undone.
                            </p>

                            {deleteError && (
                                <div className="ad-alert" role="alert">
                                    <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 16 }} />
                                    <span>{deleteError}</span>
                                </div>
                            )}
                        </div>

                        <div className="ads-modal__actions">
                            <button
                                type="button"
                                className="ads-btn"
                                onClick={closeDeleteConfirm}
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="ads-btn ads-btn--danger"
                                onClick={confirmDelete}
                                disabled={deleting}
                            >
                                {deleting ? "Deleting…" : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminStations;