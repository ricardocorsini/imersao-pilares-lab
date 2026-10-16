import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, ExternalLink, GraduationCap, LayoutGrid, Maximize2, MessageCircle, X } from "lucide-react";
import courseLogo from "./assets/logo-pilares-python.png";
import companyLogo from "./assets/logo-corsini-engenharia.png";
import { visualizationModules } from "./visualizations/registry";
import { LectureMode } from "./components/LectureMode";

const COURSE_URL = "http://pilarespython.com/";
const WHATSAPP_URL = "https://wa.me/5598991489994";
const PROMO_DISMISSED_KEY = "pilares-python-course-promo-dismissed-v1";

function App() {
  const shell = useRef<HTMLDivElement>(null);
  const lectureButton = useRef<HTMLButtonElement>(null);
  const previousScroll = useRef(0);
  const lectureActive = useRef(false);
  const [lecture, setLecture] = useState(false);
  const exitLecture = useCallback(() => {
    if (!lectureActive.current) return;
    lectureActive.current = false;
    setLecture(false);
    if (document.fullscreenElement === shell.current) void document.exitFullscreen().catch(() => {});
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: previousScroll.current, behavior: "instant" });
      lectureButton.current?.focus({ preventScroll: true });
    });
  }, []);
  const enterLecture = () => {
    lectureActive.current = true;
    previousScroll.current = window.scrollY;
    setLecture(true);
    if (!document.fullscreenElement && shell.current?.requestFullscreen) {
      // The same immersive layout also works where the native API is unavailable or denied.
      void shell.current.requestFullscreen().catch(() => {});
    }
  };
  useEffect(() => {
    const syncFullscreen = () => { if (!document.fullscreenElement) exitLecture(); };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, [exitLecture]);
  const [showPromo, setShowPromo] = useState(() => {
    try { return window.sessionStorage.getItem(PROMO_DISMISSED_KEY) !== "true"; }
    catch { return true; }
  });
  const [selectedId, setSelectedId] = useState(() => {
    const hash = typeof window === "undefined" ? "" : window.location.hash.slice(1);
    return (
      visualizationModules.find((module) => module.id === hash)?.id ??
      visualizationModules[0].id
    );
  });

  useEffect(() => {
    const syncSelection = () => {
      exitLecture();
      const id = window.location.hash.slice(1);
      setSelectedId(
        visualizationModules.find((module) => module.id === id)?.id ??
          visualizationModules[0].id,
      );
    };
    window.addEventListener("hashchange", syncSelection);
    return () => window.removeEventListener("hashchange", syncSelection);
  }, [exitLecture]);

  const selectedModule =
    visualizationModules.find((module) => module.id === selectedId) ??
    visualizationModules[0];
  const { id, number, chapter, title, model, Component } = selectedModule;

  const selectModule = (nextId: string) => {
    setSelectedId(nextId);
    window.location.hash = nextId;
  };

  const dismissPromo = () => {
    setShowPromo(false);
    try { window.sessionStorage.setItem(PROMO_DISMISSED_KEY, "true"); }
    catch { /* A apresentação continua fechada mesmo sem armazenamento. */ }
  };

  const restorePromo = () => {
    setShowPromo(true);
    try { window.sessionStorage.removeItem(PROMO_DISMISSED_KEY); }
    catch { /* A apresentação pode ser reaberta sem armazenamento. */ }
    window.requestAnimationFrame(() => {
      document.getElementById("course-promo")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "start",
      });
    });
  };

  return (
    <div className="app-shell" ref={shell}>
      <header className="site-header" inert={lecture}>
        <div className="header-inner">
          <a
            className="brand"
            href={`#${visualizationModules[0].id}`}
            aria-label="Pilares em Python — início"
          >
            <span className="brand-mark" aria-hidden="true">
              <img src={courseLogo} alt="" />
            </span>
            <span className="brand-copy">
              <span className="brand-eyebrow">Pilares em Python</span>
              <span className="brand-title">Laboratório visual</span>
            </span>
          </a>
          <div className="header-context">
            <span className="header-rule" aria-hidden="true" />
            <span>Flexocompressão oblíqua</span>
          </div>
          <nav className="graph-menu" aria-label="Seleção de gráficos">
            <label htmlFor="graph-select">
              <LayoutGrid size={16} aria-hidden="true" />
              Gráficos
            </label>
            <div className="graph-menu-field">
              <select
                id="graph-select"
                aria-label="Escolher gráfico"
                value={id}
                onChange={(event) => selectModule(event.target.value)}
              >
                {visualizationModules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.number} · {module.menuLabel}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </div>
          </nav>
          <a className="header-course-link" href={COURSE_URL} target="_blank" rel="noopener noreferrer"
            aria-label="Conhecer o curso Pilares em Python (abre em nova aba)">
            <span className="header-course-label">Site do curso</span>
            <span className="header-course-short-label">Curso</span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </header>

      <main id="top">
        {showPromo && <aside className="course-promo" id="course-promo" aria-labelledby="course-promo-title" inert={lecture}>
          <div className="course-promo-copy">
            <span className="course-promo-eyebrow"><GraduationCap size={16} aria-hidden="true" />Imersão Pilares em Python</span>
            <h2 id="course-promo-title">Implemente o cálculo que fica escondido dentro do software.</h2>
            <p className="course-promo-subtitle">Flexocompressão Oblíqua e Diagramas de Interação</p>
            <p className="course-promo-description">Estude a formulação no seu ritmo e transforme cada etapa em código nos laboratórios ao vivo. Do modelo da NBR 6118 às curvas e à superfície de interação N–Mx–My.</p>
          </div>
          <div className="course-promo-action">
            <a href={COURSE_URL} target="_blank" rel="noopener noreferrer">
              Conhecer a imersão<ArrowUpRight size={18} aria-hidden="true" />
            </a>
            <span>Com Ricardo Corsini</span>
          </div>
          <button type="button" className="course-promo-close" onClick={dismissPromo} aria-label="Fechar apresentação do curso">
            <X size={18} aria-hidden="true" />
          </button>
        </aside>}
        <article className="visual-module" id={id} key={id}>
          <header className="module-header" inert={lecture}>
            <div className="module-number" aria-label={`Visual ${number}`}>
              {number}
            </div>
            <div>
              <span className="module-chapter">{chapter}</span>
              <h1>{title}</h1>
            </div>
            <div className="module-actions"><span className="module-model">{model}</span>
              <button type="button" className="lecture-enter" ref={lectureButton} onClick={enterLecture}><Maximize2 size={16} aria-hidden="true" />Modo aula</button>
            </div>
          </header>
          <LectureMode active={lecture} moduleId={id} title={title} onExit={exitLecture}><Component /></LectureMode>
        </article>
      </main>

      <footer className="site-footer" aria-label="Autoria, curso e contato" inert={lecture}>
        <div className="footer-inner">
          <div className="footer-content">
            <div className="footer-company">
              <span className="footer-company-logo">
                <img src={companyLogo} alt="Corsini Engenharia" width={1920} height={1080} loading="lazy" />
              </span>
              <p className="footer-company-caption">Desenvolvido por <strong>Corsini Engenharia</strong></p>
              <p className="footer-author">Autoria: <strong>Ricardo Corsini</strong></p>
            </div>
            <div className="footer-course">
              <h2>Pilares em Python</h2>
              <p>Da formulação ao código.<br />Flexocompressão oblíqua e diagramas de interação.</p>
              <a className="footer-course-link" href={COURSE_URL} target="_blank" rel="noopener noreferrer">
                Conheça o curso<ExternalLink size={14} aria-hidden="true" />
              </a>
              {!showPromo && <button type="button" className="footer-promo-restore" onClick={restorePromo}>Reabrir apresentação do curso</button>}
            </div>
            <div className="footer-contact">
              <h2>Fale com Ricardo Corsini</h2>
              <p>Dúvidas sobre o curso ou o laboratório?</p>
              <a className="footer-whatsapp" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
                aria-label="Falar com Ricardo Corsini pelo WhatsApp, (98) 99148-9994 (abre em nova aba)">
                <MessageCircle size={19} aria-hidden="true" />Falar no WhatsApp<ArrowUpRight size={16} aria-hidden="true" />
              </a>
              <span className="footer-phone">(98) 99148-9994</span>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2026 Corsini Engenharia. Todos os direitos reservados.</p>
            <span>Laboratório visual · Pilares em Python</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
