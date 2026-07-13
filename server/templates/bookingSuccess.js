module.exports = ({
    passengerName,
    trainName,
    trainNumber,
    pnr,
    from,
    to,
    journeyDate,
    seatNo
}) => `

<!DOCTYPE html>

<html>
    <head>
        <meta charset="UTF-8">
    </head>

    <body style="
        margin:0;
        padding:0;
        background:#f4f6f9;
        font-family:Arial, Helvetica, sans-serif;
    ">

    <div style="
        max-width:700px;
        margin:30px auto;
        background:#ffffff;
        border-radius:12px;
        overflow:hidden;
        box-shadow:0 4px 15px rgba(0,0,0,.1);
    ">


       <div style="
            background:#0d6efd;
            color:#ffffff;
            padding:25px;
            text-align:center;
        ">
            <h1 style="
                margin:0;
                font-size:28px;
                font-weight:700;
            ">
                🚆 Train Ticket Confirmed
            </h1>

            <p style="
                margin-top:10px;
                margin-bottom:0;
                opacity:0.95;
            ">
                Thank you for booking with Train Ticket Booking
            </p>
        </div>

        <div style="padding:30px;">

            <h2 style="
                color:#198754;
                margin-top:0;
            ">
                Booking Successful 🎉
            </h2>

            <p>
                Hello <strong>${passengerName}</strong>,
            </p>

            <p>
                Your train ticket has been successfully booked.
            </p>

            <div style="
    background:linear-gradient(135deg,#0d6efd,#4f8cff);
    color:white;
    border-radius:10px;
    padding:20px;
    margin:25px 0;
    text-align:center;
">
    <div style="
        font-size:13px;
        opacity:.9;
        letter-spacing:1px;
    ">
        PNR NUMBER
    </div>

    <div style="
        font-size:30px;
        font-weight:700;
        margin-top:8px;
    ">
        ${pnr}
    </div>
</div>

            <table style="
    width:100%;
    border-collapse:collapse;
    background:#fafafa;
    border-radius:10px;
    overflow:hidden;
">

<tr>
    <td style="padding:14px;font-weight:bold;">
        Train
    </td>

    <td style="padding:14px;">
        ${trainName} (${trainNumber})
    </td>
</tr>

<tr style="background:#fff;">
    <td style="padding:14px;font-weight:bold;">
        Route
    </td>

    <td style="padding:14px;">
        ${from} → ${to}
    </td>
</tr>

<tr>
    <td style="padding:14px;font-weight:bold;">
        Journey Date
    </td>

    <td style="padding:14px;">
        ${journeyDate}
    </td>
</tr>

<tr style="background:#fff;">
    <td style="padding:14px;font-weight:bold;">
        Seat
    </td>

    <td style="padding:14px;">
        ${seatNo}
    </td>
</tr>

</table>

        <div style="
            margin-top:25px;
            padding:15px;
            background:#fff3cd;
            border-radius:8px;
        ">
            <strong>Important:</strong>
            Please carry a valid government ID proof
            during your journey.
        </div>

    </div>

    <div style="
        background:#212529;
        color:#ffffff;
        text-align:center;
        padding:20px;
        font-size:13px;
    ">
        © 2026 Train Ticket Booking

        <br><br>

        Safe Journey 🚆
    </div>

    </div>

</body >
</html >
    `;
