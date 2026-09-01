import "./Footer.css";
import { Link } from "react-router-dom";
import { MARCA, IMG } from "../../marca";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__container">

        <div className="footer__logo">
          <img src={IMG.isoNavy} alt={MARCA.nombre} className="footer__logo-img" />
          {MARCA.nombre}
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