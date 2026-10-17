import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Client-side navigation is silent to screen readers. After each route
 * change this announces the new page title and moves focus to the main
 * landmark, so keyboard and assistive-technology users start at the content.
 */
export function RouteAnnouncer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [message, setMessage] = useState("");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // The head manager updates the title asynchronously: wait until it changes
    // (or one second passes) so the announcement names the new page.
    const previous = document.title;
    const started = Date.now();
    const id = window.setInterval(() => {
      if (document.title === previous && Date.now() - started < 1000) return;
      window.clearInterval(id);
      const title = document.title.split(/\s[—|-]\s/)[0]?.trim() || "New page";
      setMessage(`Navigated to ${title}`);
      const main = document.getElementById("main-content");
      if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
    }, 50);
    return () => window.clearInterval(id);
  }, [pathname]);

  return (
    <div aria-live="polite" aria-atomic="true" role="status" className="sr-only">
      {message}
    </div>
  );
}
