import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { API_BASE_URL } from "../config/api";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../Components/Navbar";
import Footer from "../Components/Footer";
import "../Styles/BookingSuccess.css";


const CLASS_NAMES = {
    SL: "Sleeper",
    "3A": "AC 3 Tier",
    "2A": "AC 2 Tier",
    "1A": "First AC",
    CC: "AC Chair Car",
    EC: "Executive Chair Car"
};

const STATUS_META = {
    CONFIRMED: { label: "Confirmed", tone: "ok" },
    COMPLETED: { label: "Confirmed", tone: "ok" },
    PAYMENT_SUCCESS: { label: "Payment Successful", tone: "ok" },
    REVIEW_COMPLETED: { label: "Review Completed", tone: "low" },
    SEAT_SELECTED: { label: "Seats Selected", tone: "low" },
    PENDING: { label: "Pending", tone: "low" },
    EXPIRED: { label: "Expired", tone: "none" },
    RAC: { label: "RAC", tone: "low" },
    WAITLIST: { label: "Waitlisted", tone: "low" },
    WL: { label: "Waitlisted", tone: "low" },
    PARTIAL_CANCELLED: { label: "Partially Cancelled", tone: "low" },
    CANCELLED: { label: "Cancelled", tone: "none" }
};

const getStatusMeta = (status) =>
    STATUS_META[status?.toUpperCase?.()] || { label: status || "Pending", tone: "low" };

const formatDate = (value) => {
    if (!value) return "—";
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
};

function BookingSuccess() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");
    const autoPrint = searchParams.get("autoPrint") === "1";
    const autoDownload = searchParams.get("autoDownload") === "1";

    const [ticket, setTicket] = useState(null);
    const [error, setError] = useState("");
    const [downloading, setDownloading] = useState(false);

    const ticketRef = useRef(null);
    const autoActionRan = useRef(false);

    useEffect(() => {
        const loadTicket = async () => {
            if (!token) {
                setError("Booking token is missing.");
                return;
            }

            try {
                const response = await axios.get(
                    `${API_BASE_URL}/tickets/${token}`
                );
                setTicket(response.data.eTicket);
            } catch (requestError) {
                setError(
                    requestError.response?.data?.message ||
                    "Unable to load your e-ticket."
                );
            }
        };

        loadTicket();
    }, [token]);

    const statusMeta = useMemo(
        () => getStatusMeta(ticket?.bookingStatus),
        [ticket]
    );

    const printTicket = () => window.print();

    const downloadTicket = async () => {
        if (!ticketRef.current || downloading) return;

        setDownloading(true);

        try {
            // const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
            //     import("html2canvas"),
            //     import("jspdf")
            // ]);

            const canvas = await html2canvas(ticketRef.current, {
                scale: 3,
                useCORS: true,
                backgroundColor: "#ffffff",
                scrollX: 0,
                scrollY: -window.scrollY
            });

            const imgData = canvas.toDataURL("image/png");

            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4"
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;
            }

            pdf.save(`RailGo_Ticket_${ticket.pnrNumber}.pdf`);
        } catch (err) {
            console.error(err);
            alert("Unable to download PDF.");
        }

        setDownloading(false);
    };

    useEffect(() => {
        if (!ticket || autoActionRan.current) return;
        autoActionRan.current = true;

        if (autoPrint) printTicket();
        if (autoDownload) downloadTicket();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticket]);

    return (
        <>
            <Navbar />
            <main className="ticket-page">
                {!ticket && !error && (
                    <div className="ticket-state">
                        <i className="fa-solid fa-circle-notch fa-spin"></i>
                        <h2>Generating your e-ticket…</h2>
                        <p>Hold tight while we put together your reservation slip.</p>
                    </div>
                )}

                {error && (
                    <div className="ticket-state ticket-state--error">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                        <h2>E-ticket unavailable</h2>
                        <p>{error}</p>
                        <button type="button" onClick={() => navigate("/")}>
                            Return Home
                        </button>
                    </div>
                )}

                {ticket && (
                    <>
                        <div className="e-ticket-toolbar">
                            <button
                                type="button"
                                className="e-ticket-toolbar__back"
                                onClick={() => navigate("/my-bookings")}
                            >
                                <i className="fa-solid fa-arrow-left"></i>
                                My bookings
                            </button>

                            <div className="e-ticket-toolbar__actions">
                                <button type="button" onClick={printTicket}>
                                    <i className="fa-solid fa-print"></i>
                                    Print
                                </button>
                                <button
                                    type="button"
                                    className="primary"
                                    onClick={downloadTicket}
                                    disabled={downloading}
                                >
                                    <i
                                        className={`fa-solid ${downloading
                                            ? "fa-circle-notch fa-spin"
                                            : "fa-download"
                                            }`}
                                    ></i>
                                    {downloading ? "Preparing…" : "Download PDF"}
                                </button>
                            </div>
                        </div>

                        <section className="e-ticket" ref={ticketRef}>
                            <header className="e-ticket__header">
                                <div>
                                    <span
                                        className={`e-ticket__status e-ticket__status--${statusMeta.tone}`}
                                    >
                                        <i className="fa-solid fa-circle-check"></i>
                                        {statusMeta.label}
                                    </span>
                                    <span className="e-ticket__eyebrow">
                                        Booking confirmed
                                    </span>
                                    <h1>Electronic Reservation Slip</h1>
                                </div>
                                <div className="e-ticket__pnr">
                                    <small>PNR</small>
                                    <strong>{ticket.pnrNumber}</strong>
                                </div>
                            </header>

                            <div className="e-ticket__route">
                                <div className="e-ticket__station">
                                    <small>FROM</small>
                                    <strong>{ticket.journey.fromStation}</strong>
                                    {ticket.journey.departureTime && (
                                        <span>{ticket.journey.departureTime}</span>
                                    )}
                                </div>
                                <div className="e-ticket__track" aria-hidden="true">
                                    <i className="fa-solid fa-train"></i>
                                </div>
                                <div className="e-ticket__station e-ticket__station--end">
                                    <small>TO</small>
                                    <strong>{ticket.journey.toStation}</strong>
                                    {ticket.journey.arrivalTime && (
                                        <span>{ticket.journey.arrivalTime}</span>
                                    )}
                                </div>
                            </div>

                            <div className="e-ticket__perforation" aria-hidden="true"></div>

                            <div className="e-ticket__meta">
                                <div>
                                    <small>Train</small>
                                    <strong>
                                        {ticket.train.number}
                                        {ticket.train.name ? ` · ${ticket.train.name}` : ""}
                                    </strong>
                                </div>
                                <div>
                                    <small>Journey date</small>
                                    <strong>{formatDate(ticket.journey.journeyDate)}</strong>
                                </div>
                                <div>
                                    <small>Class</small>
                                    <strong>
                                        {CLASS_NAMES[ticket.journey.classCode] ||
                                            ticket.journey.classCode}
                                    </strong>
                                </div>
                                <div>
                                    <small>Quota</small>
                                    <strong>{ticket.journey.quota || "General"}</strong>
                                </div>
                            </div>

                            <div className="e-ticket__passengers">
                                <div className="e-ticket__passengers-head">
                                    <h2>Passenger manifest</h2>
                                    <span>{ticket.passengers.length} travelling</span>
                                </div>

                                <div className="e-ticket__table">
                                    <div className="e-ticket__row e-ticket__row--head">
                                        <span></span>
                                        <span>Name</span>
                                        <span>Age / Gender</span>
                                        <span>Seat</span>
                                    </div>
                                    {ticket.passengers.map((passenger, index) => (
                                        <div
                                            className="e-ticket__row"
                                            key={`${passenger.name}-${index}`}
                                        >
                                            <span className="e-ticket__index">
                                                {index + 1}
                                            </span>
                                            <span className="e-ticket__name">
                                                {passenger.name}
                                            </span>
                                            <span className="e-ticket__age">
                                                {passenger.age} yrs · {passenger.gender}
                                            </span>
                                            <span className="e-ticket__seat">
                                                {passenger.seatNumber || (
                                                    <span
                                                        className={`e-ticket__seat-pending e-ticket__seat-pending--${passenger.reservationStatus === "RAC" ? "rac" : "wl"
                                                            }`}
                                                    >
                                                        {passenger.reservationStatus === "RAC" ? "RAC" : "WL"}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="e-ticket__perforation" aria-hidden="true"></div>

                            <footer className="e-ticket__footer">
                                <div className="e-ticket__footer-info">
                                    <div>
                                        <small>Transaction ID</small>
                                        <strong>{ticket.payment.transactionId}</strong>
                                    </div>
                                    <div>
                                        <small>Amount paid</small>
                                        <strong>
                                            ₹{ticket.fare.amount} {ticket.fare.currency}
                                        </strong>
                                    </div>
                                </div>
                                <div className="e-ticket__barcode" aria-hidden="true">
                                    <div className="e-ticket__barcode-bars"></div>
                                    <small>{ticket.pnrNumber}</small>
                                </div>
                            </footer>

                            <p className="e-ticket__disclaimer">
                                This is an electronic reservation slip. Carry a valid
                                photo ID matching the passenger details while travelling.
                            </p>
                        </section>
                    </>
                )}

                <a
                    href="/"
                    className="btn btn-primary btn-home"
                    style={{
                        marginTop: "2rem",
                        "textDecoration": "none",
                        "color": "white",
                        "padding": "0.75rem 1.5rem",
                        "borderRadius": "0.5rem",
                        "fontSize": "1rem",
                        "fontWeight": "bold",
                        "background": "linear-gradient(90deg, #0d6efd, #38a3ff) !important",
                        "border": "none",
                        "cursor": "pointer",
                        "display": "block",
                        "textAlign": "center",
                        "width": "fit-content",
                        "marginLeft": "auto",
                        "marginRight": "auto",
                        "boxShadow": "0 14px 16px rgba(0, 0, 0, 0.15)",
                    }}
                >
                    <i className="fa-solid fa-house me-2"></i>
                    Go To Home
                </a>

            </main>
            <Footer />
        </>
    );
}

export default BookingSuccess;