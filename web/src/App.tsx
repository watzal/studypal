import { useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import { Library } from "./components/Library";
import { Reader } from "./components/Reader";

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

/** Two screens, hash-routed: #/ is the library, #/book/<id>/<page> the reader. */
export default function App() {
  const hash = useHash();
  const m = hash.match(/^#\/book\/([0-9a-f]{64})(?:\/(\d+))?/);
  return (
    <MotionConfig reducedMotion="user">
      {m ? <Reader key={m[1]} bookId={m[1]} requestedPage={Number(m[2] || 1)} /> : <Library />}
    </MotionConfig>
  );
}
