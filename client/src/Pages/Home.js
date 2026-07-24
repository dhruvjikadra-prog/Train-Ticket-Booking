import React from 'react'
import Navbar from '../Components/Navbar';
import Hero from '../Components/Hero';
import PopularRoutes from '../Components/Popular';
import Features from '../Components/Features';
import Footer from '../Components/Footer';
import useDocumentTitle from '../hooks/useDocumentTitle';
import PopularDestinations from '../Components/PopularDestinations';
// import TrainLoader from '../Components/TrainLoader';

export default function Home() {

  useDocumentTitle('RailGo - Home');

  // const [loading, setLoading] = useState(true);

  // useEffect(() => {
  //   const timer = setTimeout(() => {
  //     setLoading(false);
  //   }, 7500);
  //   return () => clearTimeout(timer);
  // }, []);

  // if (loading) {
  //   return <TrainLoader />
  // }
  
  return (
    <>
        <Navbar />
        <Hero />
        <PopularRoutes />
        <PopularDestinations />
        <Features />
        <Footer />
    </>
  )
}
