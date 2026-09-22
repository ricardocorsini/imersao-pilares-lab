import { useEffect, useState } from "react";
import { ChevronDown, LayoutGrid } from "lucide-react";
import courseLogo from "./assets/logo-pilares-python.png";
import { visualizationModules } from "./visualizations/registry";

function App() {
  const [selectedId, setSelectedId] = useState(() => {
    const hash = typeof window === "undefined" ? "" : window.location.hash.slice(1);
    return (
      visualizationModules.find((module) => module.id === hash)?.id ??
      visualizationModules[0].id
    );
  });

  useEffect(() => {
    const syncSelection = () => {
      const id = window.location.hash.slice(1);
      setSelectedId(
        visualizationModules.find((module) => module.id === id)?.id ??
          visualizationModules[0].id,
      );
    };
    window.addEventListener("hashchange", syncSelection);
    return () => window.removeEventListener("hashchange", syncSelection);
  }, []);

  const selectedModule =
    visualizationModules.find((module) => module.id === selectedId) ??
    visualizationModules[0];
  const { id, number, chapter, title, model, Component } = selectedModule;

  const selectModule = (nextId: string) => {
    setSelectedId(nextId);
    window.location.hash = nextId;
  };

  return (
    <div className="app-shell">
      <header className="site-header">
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
        </div>
      </header>

      <main id="top">
        <article className="visual-module" id={id} key={id}>
          <header className="module-header">
            <div className="module-number" aria-label={`Visual ${number}`}>
              {number}
            </div>
            <div>
              <span className="module-chapter">{chapter}</span>
              <h1>{title}</h1>
            </div>
            <span className="module-model">{model}</span>
          </header>
          <Component />
        </article>
      </main>

      <footer className="site-footer">
        <span>Pilares em Python</span>
        <span>Flexocompressão oblíqua</span>
      </footer>
    </div>
  );
}

export default App;
