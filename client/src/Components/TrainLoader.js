import React from "react";
import '../Styles/TrainLoader.css';

export default function TrainLoader() {
    return (
        <div className="train-loader">

            {/* Clouds */}
            <div className="train-cloud train-cloud1"></div>
            <div className="train-cloud train-cloud2"></div>
            <div className="train-cloud train-cloud3"></div>
            <div className="train-cloud train-cloud-rl train-cloud4"></div>
            <div className="train-cloud train-cloud-rl train-cloud5"></div>

            {/* Train — proper side-profile, built entirely from CSS shapes, no icon font/emoji, no track */}
            <div className="train-wrapper">
                <span className="train-smoke train-smoke1"></span>
                <span className="train-smoke train-smoke2"></span>
                <span className="train-smoke train-smoke3"></span>
                <span className="train-speed-lines"></span>

                <div className="train-craft">
                    <div className="train-tail"></div>

                    <div className="train-body">
                        <span className="train-window-band"></span>
                        <span className="train-stripe"></span>
                    </div>

                    <div className="train-nose">
                        <span className="train-windshield"></span>
                        <span className="train-headlight"></span>
                    </div>

                    <span className="train-skirt"></span>
                    <span className="train-wheel train-wheel1"></span>
                    <span className="train-wheel train-wheel2"></span>
                    <span className="train-wheel train-wheel3"></span>

                    <span className="train-pantograph"></span>
                </div>
            </div>

        </div>
    );
}