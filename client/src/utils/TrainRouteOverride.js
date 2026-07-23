/*
 * ----------------------------------------------------------------------
 * Per-train route overrides (optional, rarely needed)
 * ----------------------------------------------------------------------
 * The map's route line is generated automatically from shared corridor
 * data in `railCorridors.js`, keyed by station-code pairs — that covers
 * every train by default with zero extra work.
 *
 * This file exists only as an escape hatch for the rare train that
 * genuinely diverges from the standard corridor between two of its stops
 * (e.g. a diversion, a different physical line between the same two
 * named junctions, etc).
 *
 * To override a specific train, add an entry keyed by its train number
 * (as a string) mapping to the FULL ordered list of {lat, lng} points
 * for the entire route line (not just the differing portion):
 *
 *   const trainRouteOverrides = {
 *     "12951": [
 *       { lat: 18.9697, lng: 72.8194 },
 *       { lat: 19.2290, lng: 72.8570 },
 *       // ...every point along this train's specific path
 *     ]
 *   };
 *
 * Leave empty to rely entirely on the generic corridor-based generation.
 * ----------------------------------------------------------------------
 */

const trainRouteOverrides = {
    "12933": [
        // Mumbai Central (MMCT)
        { lat: 18.9697, lng: 72.8194 },

        // Borivali (BVI)
        { lat: 19.2290, lng: 72.8570 },

        // Virar
        { lat: 19.4300, lng: 72.8177 },

        // Vapi (VAPI)
        { lat: 20.3710, lng: 72.9040 },

        // Valsad (BL)
        { lat: 20.6028, lng: 72.9291 },

        // Surat (ST)
        { lat: 21.1702, lng: 72.8311 },

        // Bharuch Junction (BH)
        { lat: 21.7051, lng: 72.9959 },

        // Vadodara Junction (BRC)
        { lat: 22.3072, lng: 73.1812 },

        // Anand Junction (ANND)
        { lat: 22.5645, lng: 72.9289 },

        // Nadiad Junction (ND)
        { lat: 22.6939, lng: 72.8619 },

        // Ahmedabad Junction (ADI)
        { lat: 23.0225, lng: 72.5714 }
    ],

    "12951": [
        // Mumbai Central (MMCT)
        { lat: 18.9697, lng: 72.8194 },

        // Borivali (BVI)
        { lat: 19.2290, lng: 72.8570 },

        // Virar
        { lat: 19.4300, lng: 72.8177 },

        // Vapi (VAPI)
        { lat: 20.3710, lng: 72.9040 },

        // Valsad (BL)
        { lat: 20.6028, lng: 72.9291 },

        // Navsari 
        { lat: 20.9467, lng: 72.9520 },

        // Udhna
        { lat: 21.1731, lng: 72.8501 },

        // Surat (ST)
        { lat: 21.2051, lng: 72.8408 },

        // Vadodara Junction (BRC)
        { lat: 22.3072, lng: 73.1812 },

        // Ratlam Junction (RTM)
        { lat: 23.3303, lng: 75.0367 },

        // Kota Junction (KOTA)
        { lat: 25.2138, lng: 75.8648 },

        // Sawai Madhopur Junction (SWM)
        { lat: 26.0173, lng: 76.3520 },

        // Mathura Junction (MTJ)
        { lat: 27.4924, lng: 77.6737 },

        // Hazrat Nizamuddin (NZM)
        { lat: 28.5883, lng: 77.2548 },

        // New Delhi (NDLS)
        { lat: 28.6433, lng: 77.2197 }
    ]
};



export default trainRouteOverrides;