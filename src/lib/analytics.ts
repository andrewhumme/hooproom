declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

const measurementId = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY;

let initialized = false;

export function initGA() {
  if (typeof window === "undefined") return;
  if (initialized) return;
  if (!measurementId) {
    console.warn("Google Analytics measurement ID is not configured");
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });

  initialized = true;
}

export function trackPageView(path: string) {
  if (typeof window === "undefined" || !initialized || !measurementId) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
    send_to: measurementId,
  });
}
