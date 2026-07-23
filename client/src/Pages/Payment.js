import React, {
    useEffect,
    useMemo,
    useState
} from "react";
import { SiPaytm } from "react-icons/si";
import axios from "axios";
import { API_BASE_URL } from "../config/api";

import {
    useNavigate,
    useSearchParams
} from "react-router-dom";

import Navbar from "../Components/Navbar";
import Footer from "../Components/Footer";

import "../Styles/Payment.css";

import useDocumentTitle from "../hooks/useDocumentTitle";


const CLASS_NAMES = {
    SL: "Sleeper",
    "3A": "AC 3 Tier",
    "2A": "AC 2 Tier",
    "1A": "First AC",
    CC: "Chair Car",
    EC: "Executive Chair Car"
};

const STEPS = [
    { label: "Search", icon: "fa-magnifying-glass" },
    { label: "Passenger", icon: "fa-user" },
    { label: "Seats", icon: "fa-couch" },
    { label: "Review", icon: "fa-eye" },
    { label: "Payment", icon: "fa-credit-card" }
];

const PAYMENT_METHODS = [
    { id: "UPI", label: "UPI", icon: "fa-solid fa-mobile-screen-button" },
    { id: "CARD", label: "Card", icon: "fa-solid fa-credit-card" },
    { id: "NETBANKING", label: "Net Banking", icon: "fa-solid fa-building-columns" },
    { id: "WALLET", label: "Wallet", icon: "fa-solid fa-wallet" }
];

const POPULAR_BANKS = [
    { code: "SBI", name: "State Bank of India" },
    { code: "HDFC", name: "HDFC Bank" },
    { code: "ICICI", name: "ICICI Bank" },
    { code: "AXIS", name: "Axis Bank" },
    { code: "KOTAK", name: "Kotak Mahindra" },
    { code: "PNB", name: "Punjab National Bank" }
];

const OTHER_BANKS = [
    "Bank of Baroda",
    "Canara Bank",
    "Union Bank of India",
    "IDFC FIRST Bank",
    "Yes Bank",
    "IndusInd Bank"
];

const WALLETS = [
    { id: "PAYTM", name: "Paytm" },
    { id: "PHONEPE", name: "PhonePe" },
    { id: "AMAZONPAY", name: "Amazon Pay" },
    { id: "MOBIKWIK", name: "Mobikwik" }
];

const UPI_SUFFIXES = ["@ybl", "@paytm", "@okhdfcbank", "@okicici", "@axl"];

function luhnCheck(num) {

    let sum = 0;
    let shouldDouble = false;

    for (let i = num.length - 1; i >= 0; i--) {

        let digit = parseInt(num.charAt(i), 10);

        if (shouldDouble) {

            digit *= 2;

            if (digit > 9) digit -= 9;
        }

        sum += digit;
        shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
}

function getCardBrand(digits) {

    if (/^4/.test(digits)) return { name: "Visa", icon: "fa-brands fa-cc-visa" };
    if (/^(5[1-5]|2[2-7])/.test(digits)) return { name: "Mastercard", icon: "fa-brands fa-cc-mastercard" };
    if (/^3[47]/.test(digits)) return { name: "American Express", icon: "fa-brands fa-cc-amex" };
    if (/^(60|65|81|82|508)/.test(digits)) return { name: "RuPay", icon: "fa-solid fa-credit-card" };

    return null;
}

function getUpiBrand(upiId) {

    const handle = upiId.split("@")[1]?.toLowerCase();

    if (!handle) return null;

    if (/^(okgoogle|gpay|googlepay)$/.test(handle)) {
        return {
            name: "Google Pay",
            icon: "fa-brands fa-google-pay"
        };
    }

    if (/^(amazonpay|apay|amazon)$/.test(handle)) {
        return {
            name: "Amazon Pay",
            icon: "fa-brands fa-amazon-pay"
        };
    }

    if (/^(applepay|apple)$/.test(handle)) {
        return {
            name: "Apple Pay",
            icon: "fa-brands fa-apple-pay"
        };
    }

    if (/^(paytm|ptyes|ptaxis)$/.test(handle)) {
        return {
            name: "Paytm",
            icon: SiPaytm
        };
    }

    return null;
}

function formatCardNumber(value) {

    const digits = value.replace(/\D/g, "").slice(0, 19);

    return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(value) {

    const digits = value.replace(/\D/g, "").slice(0, 4);

    if (digits.length <= 2) return digits;

    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function validateUpi(value) {

    return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(value.trim());
}

function Payment() {

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const token = searchParams.get("token");

    const [booking, setBooking] = useState(null);
    const [loading, setLoading] = useState(true);

    const [paymentMethod, setPaymentMethod] = useState("UPI");
    const [timeLeft, setTimeLeft] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);

    // UPI
    const [upiId, setUpiId] = useState("");

    // Card
    const [cardNumber, setCardNumber] = useState("");
    const [cardExpiry, setCardExpiry] = useState("");
    const [cardCvv, setCardCvv] = useState("");
    const [cardName, setCardName] = useState("");
    const [saveCard, setSaveCard] = useState(false);

    // Net Banking
    const [selectedBank, setSelectedBank] = useState("");
    const [accountNumber, setAccountNumber] = useState("");
    const [accountHolder, setAccountHolder] = useState("");
    const [ifscCode, setIfscCode] = useState("");

    // Wallet
    const [selectedWallet, setSelectedWallet] = useState("");
    const [walletMobile, setWalletMobile] = useState("");

    const [agreeTerms, setAgreeTerms] = useState(false);
    const [touched, setTouched] = useState({});

    useDocumentTitle("RailGo - Payment");

    useEffect(() => {

        const loadBooking = async () => {

            try {

                const response =
                    await axios.get(
                        `${API_BASE_URL}/bookings/${token}`
                    );

                setBooking(
                    response.data.booking
                );

                if (response.data.booking?.contact?.mobile) {

                    setWalletMobile(
                        response.data.booking.contact.mobile.slice(-10)
                    );
                }

            } catch (error) {

                console.log(error);

            } finally {

                setLoading(false);
            }
        };

        loadBooking();

    }, [token]);

    useEffect(() => {

        if (!booking?.expiresAt) return;

        const interval = setInterval(() => {

            const remaining =
                new Date(
                    booking.expiresAt
                ) - new Date();

            if (remaining <= 0) {

                setTimeLeft("Expired");

                clearInterval(interval);

                return;
            }

            const minutes =
                Math.floor(
                    remaining / 60000
                );

            const seconds =
                Math.floor(
                    (remaining % 60000) /
                    1000
                );

            setTimeLeft(
                `${minutes}:${seconds
                    .toString()
                    .padStart(2, "0")}`
            );

        }, 1000);

        return () =>
            clearInterval(interval);

    }, [booking]);

    const cardDigits = cardNumber.replace(/\s/g, "");
    const cardBrand = cardDigits.length >= 4 ? getCardBrand(cardDigits) : null;

    const cardErrors = useMemo(() => {

        const errors = {};

        if (!cardDigits) {

            errors.cardNumber = "Card number is required";

        } else if (cardDigits.length < 13 || cardDigits.length > 19) {

            errors.cardNumber = "Enter a valid card number";

        } else if (!luhnCheck(cardDigits)) {

            errors.cardNumber = "Card number looks invalid";
        }

        if (!cardExpiry) {

            errors.cardExpiry = "Expiry is required";

        } else {

            const match = cardExpiry.match(/^(\d{2})\/(\d{2})$/);

            if (!match) {

                errors.cardExpiry = "Use MM/YY format";

            } else {

                const month = parseInt(match[1], 10);
                const year = 2000 + parseInt(match[2], 10);

                if (month < 1 || month > 12) {

                    errors.cardExpiry = "Enter a valid month";

                } else {

                    const expiryDate = new Date(year, month, 0, 23, 59, 59);

                    if (expiryDate < new Date()) {

                        errors.cardExpiry = "This card has expired";
                    }
                }
            }
        }

        const requiredCvvLength = cardBrand?.name === "American Express" ? 4 : 3;

        if (!cardCvv) {

            errors.cardCvv = "CVV is required";

        } else if (cardCvv.length !== requiredCvvLength) {

            errors.cardCvv = `Enter ${requiredCvvLength}-digit CVV`;
        }

        if (!cardName.trim()) {

            errors.cardName = "Name on card is required";

        } else if (
            cardName.trim().length < 3 ||
            !/^[a-zA-Z][a-zA-Z\s.'-]*$/.test(cardName.trim())
        ) {

            errors.cardName = "Enter the full name as printed";
        }

        return errors;

    }, [cardDigits, cardExpiry, cardCvv, cardName, cardBrand]);

    const upiValid = validateUpi(upiId);
    const upiBrand = upiId ? getUpiBrand(upiId) : null;
    const bankErrors = useMemo(() => {

        const errors = {};

        if (!selectedBank) {
            errors.bank = "Please select your bank";
        }

        if (!accountNumber) {
            errors.accountNumber = "Account number is required";
        } else if (!/^\d{9,18}$/.test(accountNumber)) {
            errors.accountNumber = "Enter a valid account number";
        }

        if (!accountHolder.trim()) {
            errors.accountHolder = "Account holder name is required";
        } else if (
            accountHolder.trim().length < 3 ||
            !/^[a-zA-Z][a-zA-Z\s.'-]*$/.test(accountHolder.trim())
        ) {
            errors.accountHolder = "Enter a valid account holder name";
        }

        if (!ifscCode) {
            errors.ifscCode = "IFSC code is required";
        } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.toUpperCase())) {
            errors.ifscCode = "Enter a valid IFSC code";
        }

        return errors;

    }, [selectedBank, accountNumber, accountHolder, ifscCode]);

    const bankValid = Object.keys(bankErrors).length === 0;
    const walletMobileValid = /^[6-9]\d{9}$/.test(walletMobile);
    const walletValid = Boolean(selectedWallet) && walletMobileValid;
    const cardValid = Object.keys(cardErrors).length === 0;

    const methodValid =
        paymentMethod === "UPI" ? upiValid :
            paymentMethod === "CARD" ? cardValid :
                paymentMethod === "NETBANKING" ? bankValid :
                    paymentMethod === "WALLET" ? walletValid : false;

    const handleUpiSuffix = (suffix) => {

        const base = upiId.split("@")[0];

        setUpiId(`${base}${suffix}`);
    };

    const markTouched = (field) => {

        setTouched((prev) => ({ ...prev, [field]: true }));
    };

    const buildPaymentDetails = () => {

        if (paymentMethod === "UPI") return { upiId };

        if (paymentMethod === "CARD") {

            return {
                brand: cardBrand?.name || "Card",
                last4: cardDigits.slice(-4),
                nameOnCard: cardName,
                saveCard
            };
        }

        if (paymentMethod === "NETBANKING") {

            return {
                bankName: selectedBank,
                accountNumber,
                accountHolder,
                ifscCode
            };
        }

        if (paymentMethod === "WALLET") {

            return { wallet: selectedWallet, mobile: walletMobile };
        }

        return {};
    };

    const handlePayment = async () => {

        setTouched({
            upi: true,
            cardNumber: true,
            cardExpiry: true,
            cardCvv: true,
            cardName: true,
            bank: true,
            accountNumber: true,
            accountHolder: true,
            ifscCode: true,
            wallet: true,
            walletMobile: true
        });

        if (!agreeTerms) {

            setStatusMessage({
                type: "error",
                text: "Please accept the Terms & Conditions and Refund Policy to continue."
            });

            return;
        }

        if (!methodValid) {

            setStatusMessage({
                type: "error",
                text: "Please fix the highlighted fields before proceeding."
            });

            return;
        }

        setStatusMessage(null);
        setSubmitting(true);

        try {

            await axios.post(
                `${API_BASE_URL}/payments/create`,
                {
                    bookingToken: booking.bookingToken,
                    amount: booking.totalFare,
                    paymentMethod,
                    paymentDetails: buildPaymentDetails()
                }
            );

            setStatusMessage({
                type: "success",
                text: "Payment successful! Redirecting to your ticket..."
            });

            setTimeout(() => {

                navigate(
                    `/booking-success?token=${token}`
                );

            }, 1200);

        } catch (error) {

            setStatusMessage({
                type: "error",
                text:
                    error.response?.data
                        ?.message ||
                    "Payment failed. Please try again."
            });

            setSubmitting(false);
        }
    };

    if (loading) {

        return (
            <>
                <Navbar />
                <div className="payment-loading">
                    <i className="fa-solid fa-circle-notch fa-spin me-2"></i>
                    Loading...
                </div>
                <Footer />
            </>
        );
    }

    if (!booking) {

        return (
            <>
                <Navbar />
                <div className="payment-loading">
                    <i className="fa-solid fa-triangle-exclamation me-2"></i>
                    Booking Not Found
                </div>
                <Footer />
            </>
        );
    }

    const convenienceFee = Math.round((booking.totalFare || 0) * 0.02);
    const gst = Math.round(convenienceFee * 0.18);
    const baseFare = (booking.totalFare || 0) - convenienceFee - gst;

    const requiredCvvLength = cardBrand?.name === "American Express" ? 4 : 3;

    return (
        <>
            <Navbar />

            <main className="payment-page">

                <div className="container">

                    {/* HEADER */}

                    <div className="payment-header">

                        <h2>
                            Complete Your Payment
                        </h2>

                        <p>
                            Choose a payment method to confirm your booking
                        </p>

                    </div>

                    {/* STEPPER */}

                    <div className="booking-stepper">

                        {STEPS.map((step, index) => {

                            const status =
                                index < 4
                                    ? "completed"
                                    : index === 4
                                        ? "active"
                                        : "";

                            return (
                                <div
                                    key={step.label}
                                    className={`step ${status}`}
                                >
                                    <i className={`fa-solid ${step.icon}`}></i>
                                    <span>{step.label}</span>
                                </div>
                            );
                        })}

                    </div>

                    {statusMessage && (

                        <div className={`status-banner ${statusMessage.type}`}>

                            <i
                                className={`fa-solid ${statusMessage.type === "success"
                                    ? "fa-circle-check"
                                    : "fa-circle-exclamation"
                                    } me-2`}
                            ></i>

                            {statusMessage.text}

                        </div>
                    )}

                    <div className="row g-4">

                        {/* LEFT */}

                        <div className="col-lg-8">

                            {/* ORDER SUMMARY */}

                            <div className="payment-card order-summary">

                                <div className="order-summary-top">

                                    <h4>
                                        <i className="fa-solid fa-train me-2"></i>
                                        {booking.fromStation}
                                        <i className="fa-solid fa-arrow-right-long mx-2 order-arrow"></i>
                                        {booking.toStation}
                                    </h4>

                                    <button
                                        type="button"
                                        className="edit-link"
                                        onClick={() => navigate(-1)}
                                    >
                                        <i className="fa-solid fa-pen me-1"></i>
                                        Edit
                                    </button>

                                </div>

                                <div className="order-summary-meta">

                                    <span>
                                        <i className="fa-solid fa-hashtag me-2"></i>
                                        Train {booking.trainNo}
                                    </span>

                                    <span>
                                        <i className="fa-solid fa-calendar-days me-2"></i>
                                        {booking.journeyDate}
                                    </span>

                                    <span>
                                        <i className="fa-solid fa-chair me-2"></i>
                                        {CLASS_NAMES[booking.classCode] || booking.classCode}
                                    </span>

                                    <span>
                                        <i className="fa-solid fa-user-group me-2"></i>
                                        {booking.passengers.length} Passenger(s)
                                    </span>

                                </div>

                            </div>

                            {/* PAYMENT METHOD TABS */}

                            <div className="payment-card">

                                <h4>
                                    <i className="fa-solid fa-credit-card me-2"></i>
                                    Select Payment Method
                                </h4>

                                <div className="method-tabs">

                                    {PAYMENT_METHODS.map((method) => (

                                        <button
                                            type="button"
                                            key={method.id}
                                            className={`method-tab ${paymentMethod === method.id ? "active" : ""
                                                }`}
                                            onClick={() => setPaymentMethod(method.id)}
                                        >
                                            <i className={method.icon}></i>
                                            <span>{method.label}</span>
                                        </button>
                                    ))}

                                </div>

                                {/* UPI FORM */}

                                {paymentMethod === "UPI" && (

                                    <div className="method-form">

                                        <div className="form-group">

                                            <label>UPI ID</label>

                                            <div
                                                className={`input-with-icon ${touched.upi && !upiValid ? "error" : ""
                                                    }`}
                                            >

                                                <i className="fa-solid fa-at"></i>

                                                <input
                                                    type="text"
                                                    placeholder="yourname@bank"
                                                    value={upiId}
                                                    onChange={(e) => setUpiId(e.target.value)}
                                                    onBlur={() => markTouched("upi")}
                                                />

                                                {upiBrand && (
                                                    typeof upiBrand.icon === "string" ? (
                                                        <i className={`${upiBrand.icon} brand-icon`}></i>
                                                    ) : (
                                                        <upiBrand.icon className="brand-icon" />
                                                    )
                                                )}

                                            </div>

                                            {touched.upi && !upiValid && (

                                                <span className="field-error">
                                                    <i className="fa-solid fa-circle-exclamation me-1"></i>
                                                    Enter a valid UPI ID, e.g. name@bank
                                                </span>
                                            )}

                                            <div className="chip-row">

                                                {UPI_SUFFIXES.map((suffix) => (

                                                    <button
                                                        type="button"
                                                        key={suffix}
                                                        className="chip"
                                                        onClick={() => handleUpiSuffix(suffix)}
                                                    >
                                                        {suffix}
                                                    </button>
                                                ))}

                                            </div>

                                        </div>

                                        <div className="method-hint">
                                            <i className="fa-solid fa-circle-info me-2"></i>
                                            You will receive a payment request on your UPI app to approve.
                                        </div>

                                    </div>
                                )}

                                {/* CARD FORM */}

                                {paymentMethod === "CARD" && (

                                    <div className="method-form">

                                        <div className="form-grid">

                                            <div className="form-group full">

                                                <label>Card Number</label>

                                                <div
                                                    className={`input-with-icon ${touched.cardNumber && cardErrors.cardNumber
                                                        ? "error"
                                                        : ""
                                                        }`}
                                                >

                                                    <i className="fa-solid fa-credit-card"></i>

                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        placeholder="1234 5678 9012 3456"
                                                        value={cardNumber}
                                                        onChange={(e) =>
                                                            setCardNumber(formatCardNumber(e.target.value))
                                                        }
                                                        onBlur={() => markTouched("cardNumber")}
                                                        maxLength={23}
                                                    />

                                                    {cardBrand && (

                                                        <i className={`${cardBrand.icon} brand-icon`}></i>
                                                    )}

                                                </div>

                                                {touched.cardNumber && cardErrors.cardNumber && (

                                                    <span className="field-error">
                                                        <i className="fa-solid fa-circle-exclamation me-1"></i>
                                                        {cardErrors.cardNumber}
                                                    </span>
                                                )}

                                            </div>

                                            <div className="form-group">

                                                <label>Expiry (MM/YY)</label>

                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    className={`plain-input ${touched.cardExpiry && cardErrors.cardExpiry
                                                        ? "error"
                                                        : ""
                                                        }`}
                                                    placeholder="MM/YY"
                                                    value={cardExpiry}
                                                    onChange={(e) =>
                                                        setCardExpiry(formatExpiry(e.target.value))
                                                    }
                                                    onBlur={() => markTouched("cardExpiry")}
                                                    maxLength={5}
                                                />

                                                {touched.cardExpiry && cardErrors.cardExpiry && (

                                                    <span className="field-error">
                                                        <i className="fa-solid fa-circle-exclamation me-1"></i>
                                                        {cardErrors.cardExpiry}
                                                    </span>
                                                )}

                                            </div>

                                            <div className="form-group">

                                                <label>CVV</label>

                                                <input
                                                    type="password"
                                                    inputMode="numeric"
                                                    className={`plain-input ${touched.cardCvv && cardErrors.cardCvv
                                                        ? "error"
                                                        : ""
                                                        }`}
                                                    placeholder={"•".repeat(requiredCvvLength)}
                                                    value={cardCvv}
                                                    onChange={(e) =>
                                                        setCardCvv(
                                                            e.target.value
                                                                .replace(/\D/g, "")
                                                                .slice(0, 4)
                                                        )
                                                    }
                                                    onBlur={() => markTouched("cardCvv")}
                                                    maxLength={4}
                                                />

                                                {touched.cardCvv && cardErrors.cardCvv && (

                                                    <span className="field-error">
                                                        <i className="fa-solid fa-circle-exclamation me-1"></i>
                                                        {cardErrors.cardCvv}
                                                    </span>
                                                )}

                                            </div>

                                            <div className="form-group full">

                                                <label>Name on Card</label>

                                                <input
                                                    type="text"
                                                    className={`plain-input ${touched.cardName && cardErrors.cardName
                                                        ? "error"
                                                        : ""
                                                        }`}
                                                    placeholder="As printed on the card"
                                                    value={cardName}
                                                    onChange={(e) => setCardName(e.target.value)}
                                                    onBlur={() => markTouched("cardName")}
                                                />

                                                {touched.cardName && cardErrors.cardName && (

                                                    <span className="field-error">
                                                        <i className="fa-solid fa-circle-exclamation me-1"></i>
                                                        {cardErrors.cardName}
                                                    </span>
                                                )}

                                            </div>

                                        </div>

                                        <label className="checkbox-row">

                                            <input
                                                type="checkbox"
                                                checked={saveCard}
                                                onChange={(e) => setSaveCard(e.target.checked)}
                                            />

                                            Save this card securely for faster checkout next time

                                        </label>

                                    </div>
                                )}

                                {/* NET BANKING FORM */}

                                {paymentMethod === "NETBANKING" && (

                                    <div className="method-form">

                                        <div className="form-grid">

                                            {/* Bank Name */}

                                            <div className="form-group full">

                                                <label>Bank Name</label>

                                                <select
                                                    className={`plain-input ${touched.bank && bankErrors.bank ? "error" : ""}`}
                                                    value={selectedBank}
                                                    onChange={(e) => setSelectedBank(e.target.value)}
                                                    onBlur={() => markTouched("bank")}
                                                >

                                                    <option value="">Select Your Bank</option>

                                                    {[...POPULAR_BANKS.map(bank => bank.name), ...OTHER_BANKS].map((bank) => (

                                                        <option
                                                            key={bank}
                                                            value={bank}
                                                        >
                                                            {bank}
                                                        </option>

                                                    ))}

                                                </select>

                                                {touched.bank && bankErrors.bank && (
                                                    <span className="field-error">
                                                        <i className="fa-solid fa-circle-exclamation me-1"></i>
                                                        {bankErrors.bank}
                                                    </span>
                                                )}

                                            </div>

                                            {/* Account Number */}

                                            <div className="form-group">

                                                <label>Account Number</label>

                                                <input
                                                    type="text"
                                                    placeholder="Enter Account Number"
                                                    className={`plain-input ${touched.accountNumber && bankErrors.accountNumber ? "error" : ""}`}
                                                    value={accountNumber}
                                                    onChange={(e) =>
                                                        setAccountNumber(
                                                            e.target.value.replace(/\D/g, "").slice(0, 18)
                                                        )
                                                    }
                                                    onBlur={() => markTouched("accountNumber")}
                                                />

                                                {touched.accountNumber && bankErrors.accountNumber && (
                                                    <span className="field-error">
                                                        <i className="fa-solid fa-circle-exclamation me-1"></i>
                                                        {bankErrors.accountNumber}
                                                    </span>
                                                )}

                                            </div>

                                            {/* IFSC Code */}

                                            <div className="form-group">

                                                <label>IFSC Code</label>

                                                <input
                                                    type="text"
                                                    placeholder="Enter IFSC Code"
                                                    className={`plain-input ${touched.ifscCode && bankErrors.ifscCode ? "error" : ""}`}
                                                    value={ifscCode}
                                                    onChange={(e) =>
                                                        setIfscCode(
                                                            e.target.value
                                                                .toUpperCase()
                                                                .replace(/[^A-Z0-9]/g, "")
                                                                .slice(0, 11)
                                                        )
                                                    }
                                                    onBlur={() => markTouched("ifscCode")}
                                                />

                                                {touched.ifscCode && bankErrors.ifscCode && (
                                                    <span className="field-error">
                                                        <i className="fa-solid fa-circle-exclamation me-1"></i>
                                                        {bankErrors.ifscCode}
                                                    </span>
                                                )}

                                            </div>

                                            {/* Account Holder */}

                                            <div className="form-group full">

                                                <label>Account Holder Name</label>

                                                <input
                                                    type="text"
                                                    placeholder="Enter Account Holder Name"
                                                    className={`plain-input ${touched.accountHolder && bankErrors.accountHolder ? "error" : ""}`}
                                                    value={accountHolder}
                                                    onChange={(e) => setAccountHolder(e.target.value)}
                                                    onBlur={() => markTouched("accountHolder")}
                                                />

                                                {touched.accountHolder && bankErrors.accountHolder && (
                                                    <span className="field-error">
                                                        <i className="fa-solid fa-circle-exclamation me-1"></i>
                                                        {bankErrors.accountHolder}
                                                    </span>
                                                )}

                                            </div>

                                        </div>

                                        <div className="method-hint">
                                            <i className="fa-solid fa-lock me-2"></i>
                                            Your banking information is encrypted. After clicking <strong>Pay Now</strong>, you'll be redirected to your bank's secure Net Banking portal to authenticate the payment.
                                        </div>

                                    </div>

                                )}

                                {/* WALLET FORM */}

                                {paymentMethod === "WALLET" && (

                                    <div className="method-form">

                                        <label className="sub-label">Choose a Wallet</label>

                                        <div className="wallet-grid">

                                            {WALLETS.map((wallet) => (

                                                <button
                                                    type="button"
                                                    key={wallet.id}
                                                    className={`wallet-tile ${selectedWallet === wallet.id ? "active" : ""
                                                        }`}
                                                    onClick={() => setSelectedWallet(wallet.id)}
                                                >
                                                    <i className="fa-solid fa-wallet"></i>
                                                    <span>{wallet.name}</span>
                                                </button>
                                            ))}

                                        </div>

                                        {touched.wallet && !selectedWallet && (

                                            <span className="field-error">
                                                <i className="fa-solid fa-circle-exclamation me-1"></i>
                                                Please choose a wallet
                                            </span>
                                        )}

                                        <div className="form-group mt-3">

                                            <label>Registered Mobile Number</label>

                                            <div
                                                className={`input-with-icon ${touched.walletMobile && !walletMobileValid
                                                    ? "error"
                                                    : ""
                                                    }`}
                                            >

                                                <i className="fa-solid fa-phone"></i>

                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    placeholder="10-digit mobile number"
                                                    value={walletMobile}
                                                    onChange={(e) =>
                                                        setWalletMobile(
                                                            e.target.value
                                                                .replace(/\D/g, "")
                                                                .slice(0, 10)
                                                        )
                                                    }
                                                    onBlur={() => markTouched("walletMobile")}
                                                />

                                            </div>

                                            {touched.walletMobile && !walletMobileValid && (

                                                <span className="field-error">
                                                    <i className="fa-solid fa-circle-exclamation me-1"></i>
                                                    Enter a valid 10-digit mobile number
                                                </span>
                                            )}

                                        </div>

                                    </div>
                                )}

                                <label className="checkbox-row terms-row">

                                    <input
                                        type="checkbox"
                                        checked={agreeTerms}
                                        onChange={(e) => setAgreeTerms(e.target.checked)}
                                    />

                                    I agree to the Terms &amp; Conditions and Refund Policy

                                </label>

                            </div>

                        </div>

                        {/* RIGHT */}

                        <div className="col-lg-4">

                            <div className="payment-sidebar">

                                <div className="timer-box">

                                    <i className="fa-solid fa-clock me-2"></i>

                                    {timeLeft || "--:--"}

                                    <small>Time left to complete payment</small>

                                </div>

                                <div className="fare-card">

                                    <h4>
                                        <i className="fa-solid fa-receipt me-2"></i>
                                        Fare Summary
                                    </h4>

                                    <div className="fare-row">

                                        <span>
                                            Base Fare × {booking.passengers.length}
                                        </span>

                                        <span>
                                            ₹{baseFare}
                                        </span>

                                    </div>

                                    <div className="fare-row">

                                        <span>
                                            Convenience Fee
                                        </span>

                                        <span>
                                            ₹{convenienceFee}
                                        </span>

                                    </div>

                                    <div className="fare-row">

                                        <span>
                                            GST (18%)
                                        </span>

                                        <span>
                                            ₹{gst}
                                        </span>

                                    </div>

                                    <hr />

                                    <div className="fare-total">

                                        <span>
                                            Total
                                        </span>

                                        <span>
                                            ₹{booking.totalFare}
                                        </span>

                                    </div>

                                    <button
                                        className="pay-btn"
                                        onClick={handlePayment}
                                        disabled={submitting}
                                    >

                                        {submitting ? (

                                            <>
                                                <i className="fa-solid fa-circle-notch fa-spin me-2"></i>
                                                Processing...
                                            </>

                                        ) : (

                                            <>
                                                <i className="fa-solid fa-lock me-2"></i>
                                                Pay ₹{booking.totalFare}
                                            </>
                                        )}

                                    </button>

                                </div>

                                <div className="security-box">

                                    <h6>
                                        <i className="fa-solid fa-shield-halved me-2"></i>
                                        100% Secure Payment
                                    </h6>

                                    <p>
                                        Your payment information is encrypted and never stored on our servers.
                                    </p>

                                </div>

                                <div className="support-note">

                                    <i className="fa-solid fa-headset me-2"></i>
                                    Need help? Contact support at <strong>1800-123-4567</strong>

                                </div>

                            </div>

                        </div>

                    </div>

                </div>

            </main>

            <Footer />
        </>
    );
}

export default Payment;