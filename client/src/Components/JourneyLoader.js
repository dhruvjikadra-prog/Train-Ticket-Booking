import "../Styles/JourneyLoader.css";

function JourneyLoader({
    title = "Preparing your journey",
    subtitle = "Please wait while RailBook gets everything on track.",
    mode = "page"
}) {
    return (
        <div
            className={`journey-loader journey-loader--${mode}`}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div className="journey-loader__card">
                <div className="journey-loader__scene" aria-hidden="true">
                    <span className="journey-loader__sun"></span>
                    <span className="journey-loader__cloud cloud-one"></span>
                    <span className="journey-loader__cloud cloud-two"></span>

                    <div className="journey-loader__train">
                        <span className="journey-loader__engine">
                            <i className="fa-solid fa-train"></i>
                        </span>
                        <span className="journey-loader__coach">
                            <i></i><i></i><i></i>
                        </span>
                        <span className="journey-loader__coach coach-two">
                            <i></i><i></i><i></i>
                        </span>
                    </div>

                    <span className="journey-loader__track"></span>
                    <span className="journey-loader__signal">
                        <i></i>
                    </span>
                </div>

                <div className="journey-loader__copy">
                    <span className="journey-loader__eyebrow">
                        RailBook Express
                    </span>
                    <h2>{title}</h2>
                    <p>{subtitle}</p>
                    <div className="journey-loader__progress">
                        <span></span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default JourneyLoader;
