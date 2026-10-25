"use strict";

(() => {
  const menuButton = document.querySelector(".menu-toggle");
  const mobileMenu = document.querySelector("#mobile-menu");

  if (menuButton && mobileMenu) {
    function setMenu(open, restoreFocus = false) {
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
      mobileMenu.hidden = !open;
      if (restoreFocus) menuButton.focus({ preventScroll: true });
    }

    menuButton.addEventListener("click", () => {
      setMenu(menuButton.getAttribute("aria-expanded") !== "true");
    });
    mobileMenu.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => setMenu(false));
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !mobileMenu.hidden) {
        setMenu(false, true);
      }
    });
  }

  const progress = document.querySelector(".reading-progress");
  if (progress) {
    let scheduled = false;
    const updateProgress = () => {
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      const fraction = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0;
      progress.style.width = `${fraction * 100}%`;
      scheduled = false;
    };
    const scheduleProgress = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(updateProgress);
    };
    window.addEventListener("scroll", scheduleProgress, { passive: true });
    window.addEventListener("resize", scheduleProgress);
    window.addEventListener("load", scheduleProgress, { once: true });
    scheduleProgress();
  }

  const journey = document.querySelector("#journey");
  if (!journey) return;

  const audienceTabs = [...journey.querySelectorAll(".audience-tab[data-audience]")];
  const audiences = new Map();
  for (const tab of audienceTabs) {
    const name = tab.dataset.audience;
    const panel = document.getElementById(tab.getAttribute("aria-controls"));
    if (!panel || panel.dataset.audiencePanel !== name) return;
    const steps = [...panel.querySelectorAll(".journey-steps [data-step]")];
    const details = steps.map(step => document.getElementById(step.getAttribute("aria-controls")));
    if (!steps.length || details.some(detail => !detail || !panel.contains(detail))) return;
    audiences.set(name, { tab, panel, steps, details, step: 0 });
  }
  if (audiences.size !== 2 || !audiences.has("store") || !audiences.has("shopper")) return;

  let activeAudience = audiences.has(journey.dataset.audience) ? journey.dataset.audience : "store";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function updateUrl() {
    const step = audiences.get(activeAudience).step + 1;
    const hash = `#${activeAudience}-${step}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(window.history.state, "", hash);
    }
  }

  function render() {
    journey.dataset.audience = activeAudience;
    for (const [name, audience] of audiences) {
      const selected = name === activeAudience;
      audience.tab.setAttribute("aria-selected", String(selected));
      audience.tab.tabIndex = selected ? 0 : -1;
      audience.panel.hidden = !selected;
      audience.steps.forEach((step, index) => {
        const current = index === audience.step;
        step.setAttribute("aria-selected", String(current));
        step.tabIndex = current ? 0 : -1;
        audience.details[index].hidden = !current;
      });
    }
  }

  function selectAudience(name, { focus = false, syncUrl = true } = {}) {
    if (!audiences.has(name)) return;
    activeAudience = name;
    render();
    if (syncUrl) updateUrl();
    if (focus) audiences.get(name).tab.focus({ preventScroll: true });
    window.dispatchEvent(new Event("resize"));
  }

  function selectStep(name, index, { focus = false, syncUrl = true } = {}) {
    const audience = audiences.get(name);
    if (!audience || index < 0 || index >= audience.steps.length) return;
    audience.step = index;
    activeAudience = name;
    render();
    if (syncUrl) updateUrl();
    if (focus) audience.steps[index].focus({ preventScroll: true });
    window.dispatchEvent(new Event("resize"));
  }

  function keyboardIndex(event, tabs, current) {
    switch (event.key) {
      case "ArrowRight": return (current + 1) % tabs.length;
      case "ArrowLeft": return (current + tabs.length - 1) % tabs.length;
      case "Home": return 0;
      case "End": return tabs.length - 1;
      default: return null;
    }
  }

  audienceTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectAudience(tab.dataset.audience));
    tab.addEventListener("keydown", event => {
      const next = keyboardIndex(event, audienceTabs, index);
      if (next === null) return;
      event.preventDefault();
      selectAudience(audienceTabs[next].dataset.audience, { focus: true });
    });
  });

  for (const [name, audience] of audiences) {
    audience.steps.forEach((tab, index) => {
      tab.addEventListener("click", () => selectStep(name, index));
      tab.addEventListener("keydown", event => {
        const next = keyboardIndex(event, audience.steps, index);
        if (next === null) return;
        event.preventDefault();
        selectStep(name, next, { focus: true });
      });
    });
    audience.details.forEach((detail, index) => {
      detail.querySelectorAll(".stage-next").forEach(button => {
        button.addEventListener("click", () => {
          selectStep(name, (index + 1) % audience.steps.length, { focus: true });
        });
      });
    });
  }

  document.querySelectorAll("[data-journey-link]").forEach(link => {
    link.addEventListener("click", event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const name = link.dataset.journeyLink;
      if (!audiences.has(name)) return;
      event.preventDefault();
      selectAudience(name, { focus: true });
      journey.scrollIntoView({ behavior: reducedMotion.matches ? "instant" : "smooth", block: "start" });
    });
  });

  function readHash({ focus = false, scroll = false } = {}) {
    const match = window.location.hash.match(/^#(store|shopper)(?:-([1-4]))?$/);
    if (!match) return;
    const [, name, step] = match;
    if (step) {
      selectStep(name, Number(step) - 1, { focus, syncUrl: false });
    } else {
      selectAudience(name, { focus, syncUrl: false });
    }
    if (scroll) {
      window.requestAnimationFrame(() => {
        journey.scrollIntoView({ behavior: "instant", block: "start" });
      });
    }
  }

  render();
  journey.classList.add("is-enhanced");
  document.documentElement.classList.add("js");
  readHash({ scroll: true });
  window.addEventListener("hashchange", () => readHash({ focus: true, scroll: true }));
})();
