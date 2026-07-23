import React from "react";
import { useNavigate } from "react-router-dom";
import "../Styles/PopularDestinations.css";
import { FaArrowRight, FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { IoTimeOutline } from "react-icons/io5";
import { HiOutlineLocationMarker } from "react-icons/hi";
import MumbaiImage from "../Assets/Mumbai.png";
import AhmedabadImage from "../Assets/Ahmedabad.png";
import VaransiImage from "../Assets/Varansi.jpg";

const destinations = [
    {
        from: "ST",
        fromName: "Surat",
        to: "MMCT",
        city: "Mumbai",
        station: "Mumbai Central (MMCT)",
        price: "₹650",
        duration: "2h 15m",
        trainName: "Vande Bharat Express",
        description:
            "Experience India's fastest semi-high-speed train, with premium seating, onboard catering and panoramic windows.",
        image: MumbaiImage,
    },
    {
        from: "MMCT",
        fromName: "Mumbai",
        to: "ADI",
        city: "Ahmedabad",
        station: "Ahmedabad Junction (ADI)",
        price: "₹480",
        duration: "6h 30m",
        trainName: "Gujarat Superfast",
        description:
            "A dependable superfast link connecting Gujarat's commercial hub with Mumbai's bustling business district.",
        image: AhmedabadImage,
    },
    {
        from: "CNB",
        fromName: "Kanpur",
        to: "NDLS",
        city: "Delhi",
        station: "New Delhi (NDLS)",
        price: "₹850",
        duration: "4h 45m",
        trainName: "Rajdhani Express",
        description:
            "Cruise through the Gangetic plains aboard one of India's most punctual long-distance express services.",
        image: "https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=800&q=80",
    },
    {
        from: "NDLS",
        fromName: "Delhi",
        to: "JP",
        city: "Jaipur",
        station: "Jaipur Junction (JP)",
        price: "₹350",
        duration: "5h 10m",
        trainName: "Pink City Intercity",
        description:
            "Hop between the capital and the Pink City on this fast, frequent intercity service with comfy chair-car seating.",
        image: "https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=800&q=80",
    },
    {
        from: "CSMT",
        fromName: "Mumbai",
        to: "MAO",
        city: "Goa",
        station: "Madgaon (MAO)",
        price: "₹920",
        duration: "8h 15m",
        trainName: "Tejas Express",
        description:
            "Hug the dramatic Konkan coastline on this scenic, luxury-class journey down to Goa's golden beaches.",
        image: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80",
    },
    {
        from: "NDLS",
        fromName: "Delhi",
        to: "UDZ",
        city: "Udaipur",
        station: "Udaipur City (UDZ)",
        price: "₹540",
        duration: "7h 25m",
        trainName: "Mewar Express",
        description:
            "Roll through the Aravalli hills en route to the City of Lakes, with comfortable AC chair-car seating.",
        image: "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=800&q=80",
    },
    {
        from: "SBC",
        fromName: "Bengaluru",
        to: "MYS",
        city: "Mysuru",
        station: "Mysuru Junction (MYS)",
        price: "₹190",
        duration: "2h 40m",
        trainName: "Chamundi Express",
        description:
            "Enjoy a quick and comfortable ride to the royal city of Mysuru with frequent daily departures.",
        image: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=800&q=80",
    },
    {
        from: "NDLS",
        fromName: "Delhi",
        to: "SML",
        city: "Shimla",
        station: "Shimla (SML)",
        price: "₹520",
        duration: "7h 30m",
        trainName: "Kalka Shimla Express",
        description:
            "Escape to the Queen of Hills with a scenic journey through pine forests, mountain tunnels, and breathtaking Himalayan landscapes.",
        image: "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=800&q=80",
    },
    {
        from: "KOAA",
        fromName: "Kolkata",
        to: "NJP",
        city: "Darjeeling",
        station: "New Jalpaiguri (NJP)",
        price: "₹680",
        duration: "10h 45m",
        trainName: "Darjeeling Mail",
        description:
            "Travel towards the famous tea gardens and Himalayan views aboard one of India's most iconic hill routes.",
        image: "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=800&q=80",
    },
    {
        from: "GNC",
        fromName: "Gandhinagar",
        to: "VRL",
        city: "Gir National Park",
        station: "Veraval (VRL)",
        price: "₹380",
        duration: "8h 00m",
        trainName: "Somnath Express",
        description:
            "Journey to the only home of the majestic Asiatic Lion and experience the rich wildlife of Gujarat.",
        image: "https://images.unsplash.com/photo-1546182990-dffeafbe841d?auto=format&fit=crop&w=800&q=80",
    },
    {
        from: "NDLS",
        fromName: "Delhi",
        to: "BSB",
        city: "Varanasi",
        station: "Varanasi Junction (BSB)",
        price: "₹720",
        duration: "8h 00m",
        trainName: "Vande Bharat Express",
        description:
            "Visit one of the world's oldest living cities, witness the mesmerizing Ganga Aarti, and explore the sacred ghats.",
        image: VaransiImage,
    },
    {
        from: "NDLS",
        fromName: "Delhi",
        to: "HW",
        city: "Haridwar",
        station: "Haridwar Junction (HW)",
        price: "₹310",
        duration: "4h 45m",
        trainName: "Jan Shatabdi Express",
        description:
            "Experience the spiritual charm of Har Ki Pauri, evening Ganga Aarti, and the gateway to the Himalayas.",
        image: "https://images.unsplash.com/photo-1583417319070-4a69db38a482?auto=format&fit=crop&w=800&q=80",
    },
];

function PopularDestinations() {

    const navigate = useNavigate();
    // Event Handler: Triggers when user selects/books a route
    const handleRouteSelect = (route) => {
        const today = new Date().toISOString().split("T")[0];

        navigate(
            `/trains?from=${route.from}&to=${route.to}&date=${today}&class=All+Class`
        );
    };

    const handleCardKeyDown = (e, route) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRouteSelect(route);
        }
    };

    const chunkDestinations = (arr, chunkSize) => {
        const chunks = [];
        for (let i = 0; i < arr.length; i += chunkSize) {
            chunks.push(arr.slice(i, i + chunkSize));
        }
        return chunks;
    };

    const destinationSlides = chunkDestinations(destinations, 3);

    return (
        <section className="pd-popular-section py-5">
            <div className="container">

                <div className="pd-glass-wrapper">

                    {/* Header Block */}
                    <div className="row pd-section-heading align-items-end mb-5">
                        <div className="col-lg-8">
                            <div className="d-flex align-items-center gap-2 mb-2">
                                <span className="pd-badge text-uppercase fw-bold">
                                    Explore India By Rail
                                </span>
                                <div className="pd-pulse-dot"></div>
                            </div>

                            <h2 className="fw-bold display-5 mb-3">
                                Popular Train Routes
                            </h2>

                            <p className="text-muted fs-5 mb-0">
                                Discover India's most popular railway destinations with
                                affordable fares, comfortable journeys, and instant online booking.
                            </p>
                        </div>

                        <div className="col-lg-4 text-lg-end mt-4 mt-lg-0 d-none d-md-block">
                            <button
                                className="btn pd-ctrl-btn me-2"
                                type="button"
                                data-bs-target="#pdDynamicCarousel"
                                data-bs-slide="prev"
                                aria-label="Previous routes"
                            >
                                <FaChevronLeft />
                            </button>

                            <button
                                className="btn pd-ctrl-btn"
                                type="button"
                                data-bs-target="#pdDynamicCarousel"
                                data-bs-slide="next"
                                aria-label="Next routes"
                            >
                                <FaChevronRight />
                            </button>
                        </div>
                    </div>

                    {/* Carousel */}
                    <div
                        id="pdDynamicCarousel"
                        className="carousel slide"
                        data-bs-ride="carousel"
                        data-bs-interval="6000"
                    >
                        <div className="carousel-inner">

                            {destinationSlides.map((slideItems, slideIndex) => (
                                <div
                                    className={`carousel-item ${slideIndex === 0 ? "active" : ""}`}
                                    key={slideIndex}
                                >
                                    <div className="row g-4">

                                        {slideItems.map((item, index) => (
                                            <div className="col-lg-4 col-md-6" key={index}>
                                                <div
                                                    className="pd-route-card"
                                                    onClick={() => handleRouteSelect(item)}
                                                    onKeyDown={(e) => handleCardKeyDown(e, item)}
                                                    role="button"
                                                    tabIndex="0"
                                                >
                                                    <div className="pd-route-image-wrap">
                                                        <img
                                                            src={item.image}
                                                            alt={`${item.trainName} train`}
                                                            className="pd-route-image"
                                                            loading="lazy"
                                                        />
                                                        <span className="pd-price-chip">
                                                            {item.price}
                                                        </span>
                                                    </div>

                                                    <div className="pd-route-body">
                                                        <p className="pd-route-location">
                                                            <HiOutlineLocationMarker aria-hidden="true" />
                                                            {item.fromName} to {item.city}
                                                        </p>

                                                        <h3 className="pd-route-title">
                                                            {item.trainName}
                                                        </h3>

                                                        <p className="pd-route-desc">
                                                            {item.description}
                                                        </p>

                                                        <div className="pd-route-divider"></div>

                                                        <div className="pd-route-footer">
                                                            <span className="pd-route-duration">
                                                                <IoTimeOutline aria-hidden="true" />
                                                                {item.duration}
                                                            </span>

                                                            <button
                                                                type="button"
                                                                className="pd-book-btn"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleRouteSelect(item);
                                                                }}
                                                            >
                                                                Book Now
                                                                <FaArrowRight className="pd-book-btn-icon" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                    </div>
                                </div>
                            ))}

                        </div>

                        {/* Slide Indicators */}
                        <div className="carousel-indicators pd-carousel-indicators position-relative mt-4">
                            {destinationSlides.map((_, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    data-bs-target="#pdDynamicCarousel"
                                    data-bs-slide-to={index}
                                    className={index === 0 ? "active" : ""}
                                    aria-label={`Slide ${index + 1}`}
                                ></button>
                            ))}
                        </div>
                    </div>

                </div>

            </div>
        </section>
    );
}

export default PopularDestinations;