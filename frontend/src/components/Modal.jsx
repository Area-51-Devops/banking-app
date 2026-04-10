import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function Modal({ isOpen, onClose, title, children }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const modalContent = (
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="modal-content glass-card">
        <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">×</button>
        {title && <h3 style={{ marginTop: 0, marginBottom: "20px" }}>{title}</h3>}
        {children}
      </div>
    </div>
  );

  // Render to body. If document.getElementById("modal-root") existed, we'd use that. 
  // Document.body is fine for this lightweight single-page scope.
  return createPortal(modalContent, document.body);
}
