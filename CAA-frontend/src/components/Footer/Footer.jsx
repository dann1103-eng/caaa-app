import "./Footer.css";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__container">

        <div className="footer__logo">
          <span className="footer__logo-icon">✈</span>
          CAAA
        </div>

        <div className="footer__links">
          <Link to="/proyeccion" className="footer__link">Programación</Link>
        </div>

        <p className="footer__copy">
          © {new Date().getFullYear()} Centro de Adiestramiento Aéreo Académico
        </p>

      </div>
    </footer>
  );
}