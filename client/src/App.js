import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./Pages/Login";
import Signup from "./Pages/Signup";
import Home from "./Pages/Home";
import TrainResults from "./Pages/TrainResults";
import PassengerDetails from "./Pages/PassengerDetails";
import SeatSelection from "./Pages/Seat-Selection";
import Review from "./Pages/Review";
import Payment from "./Pages/Payment";
import BookingSuccess from "./Pages/BookingSuccess";
import MyBookings from "./Pages/MyBookings";
import Profile from "./Pages/Profile";
import PNRStatus from "./Pages/PNRStatus";
import TrainSchedule from "./Pages/TrainSchedule";
import AdminLogin from "./Pages/AdminLogin";
import AdminDashboard from "./Pages/AdminDashboard";
import AdminAddTrain from "./Pages/AdminAddTrain";
import AdminReleaseSeats from "./Pages/AdminReleaseSeats";
import AdminBookings from "./Pages/AdminBookings";
import AdminPayments from "./Pages/AdminPayments";
import AdminTrains from "./Pages/AdminTrains";
import AdminStations from "./Pages/AdminStations";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/trains" element={<TrainResults />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/passenger-details" element={<PassengerDetails />} />
        <Route path="/seat-selection" element={<SeatSelection />} />
        <Route path="/review" element={<Review />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/booking-success" element={<BookingSuccess />} />
        <Route path="/my-bookings" element={<MyBookings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/pnr-status" element={<PNRStatus />} />
        <Route path="/train-schedule" element={<TrainSchedule />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/trains/add" element={<AdminAddTrain />} />
        <Route path="/admin/release-seats" element={<AdminReleaseSeats />} />
        <Route path="/admin/bookings" element={<AdminBookings />} />
        <Route path="/admin/payments" element={<AdminPayments />} />
        <Route path="/admin/trains" element={<AdminTrains />} />
        <Route path="/admin/stations" element={<AdminStations />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
