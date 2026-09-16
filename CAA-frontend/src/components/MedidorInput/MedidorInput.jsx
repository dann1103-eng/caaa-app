import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { digitosDesdeValor, partesMedidor, valorDesdeDigitos } from "../../utils/medidor";
import "./MedidorInput.css";

// Campo para copiar una lectura de instrumento (tacómetro / Hobbs). Los dígitos
// entran POR LA DERECHA, como el monto de una transferencia: el punto queda
// clavado desde el primer golpe y el molde que falta se ve en gris, así que el
// instructor sabe de un vistazo que le faltan los decimales. Antes se llenaba de
// izquierda a derecha y había que acordarse del cero inicial (084725), y quien
// se lo olvidaba anotaba un número diez veces mayor.
export default function MedidorInput({
  value = "",
  onChange,
  formato,
  disabled = false,
  className = "",
  ...rest
}) {
  const total = formato.enteros + formato.decimales;
  const inputRef = useRef(null);

  // Lo que el instructor lleva TECLEADO. No se puede deducir del valor a secas:
  // "0000.08" y "08" son el mismo número pero distinta cantidad de dígitos
  // escritos, y de eso depende cuánto molde queda gris.
  const [digitos, setDigitos] = useState(() => digitosDesdeValor(value, formato) ?? "");
  // Una lectura guardada que no cabe en el molde (más decimales de los que tiene
  // el instrumento) se muestra tal cual, en texto libre: la máscara no redondea
  // por su cuenta un número que ya está guardado. Al vaciarlo, retoma el molde.
  const [libre, setLibre] = useState(() => value !== "" && digitosDesdeValor(value, formato) === null);

  // Distingue un cambio que viene de afuera (cargar un borrador) del eco de
  // nuestro propio onChange, que ya dejó `digitos` al día.
  const ultimoEmitido = useRef(value);

  useEffect(() => {
    if (value === ultimoEmitido.current) return;
    ultimoEmitido.current = value;
    const d = digitosDesdeValor(value, formato);
    setDigitos(d ?? "");
    setLibre(value !== "" && d === null);
  }, [value, formato.enteros, formato.decimales]); // eslint-disable-line react-hooks/exhaustive-deps

  function emitir(nuevo) {
    ultimoEmitido.current = nuevo;
    onChange?.(nuevo);
  }

  const { molde, escrito } = partesMedidor(digitos, formato);
  // Con el campo vacío el input se deja en blanco para que se vea el molde gris
  // entero; con algo tecleado, input y fantasma muestran la MISMA cadena (el
  // texto del input va transparente) y por eso quedan alineados al pixel.
  const mostrado = libre ? value : valorDesdeDigitos(digitos, formato);

  // El cursor vive siempre al final: es lo que deja interpretar cada cambio como
  // "entró un dígito" o "se borró el último" sin adivinar dónde tocó el usuario.
  function alFinal() {
    if (libre) return;
    const el = inputRef.current;
    if (!el) return;
    const n = el.value.length;
    if (el.selectionStart !== n || el.selectionEnd !== n) el.setSelectionRange(n, n);
  }

  useLayoutEffect(() => {
    if (libre) return;
    const el = inputRef.current;
    if (el && document.activeElement === el) el.setSelectionRange(el.value.length, el.value.length);
  });

  function alEscribir(e) {
    const nuevo = e.target.value;

    if (libre) {
      if (nuevo === "") {
        setLibre(false);
        setDigitos("");
        emitir("");
        return;
      }
      if (!/^\d*\.?\d*$/.test(nuevo)) return;
      emitir(nuevo);
      return;
    }

    const previo = mostrado;
    let d;
    if (nuevo.length === previo.length + 1 && nuevo.startsWith(previo)) {
      // Se agregó un carácter al final (el cursor siempre está ahí).
      const ch = nuevo[nuevo.length - 1];
      if (ch < "0" || ch > "9") return; // un punto tecleado a mano no hace nada: ya está puesto
      if (digitos.length >= total) return; // molde lleno: la tecla de más NO entra ni descarta el primer dígito
      d = digitos + ch;
    } else if (nuevo.length === previo.length - 1 && previo.startsWith(nuevo)) {
      d = digitos.slice(0, -1); // borrar corre el número a la derecha
    } else {
      // Pegar, o escribir con todo seleccionado: se rearma con los dígitos que
      // llegaron, quedándose con los últimos que entren en el molde — que es la
      // misma dirección en la que se teclea, y queda a la vista antes de firmar.
      d = nuevo.replace(/\D/g, "").slice(-total);
    }
    setDigitos(d);
    emitir(valorDesdeDigitos(d, formato));
  }

  return (
    <div className={`mdi ${disabled ? "mdi--off" : ""}`}>
      {!libre && (
        <div className="mdi-ghost" aria-hidden="true">
          <span className="mdi-ghost-molde">{molde}</span>
          <span className="mdi-ghost-escrito">{escrito}</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode={libre ? "decimal" : "numeric"}
        className={`mdi-input ${libre ? "" : "mdi-input--enmascarado"} ${className}`}
        value={mostrado}
        onChange={alEscribir}
        onFocus={alFinal}
        onClick={alFinal}
        onKeyUp={alFinal}
        onSelect={alFinal}
        disabled={disabled}
        autoComplete="off"
        {...rest}
      />
    </div>
  );
}
