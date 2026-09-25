/** 贴底跟随:用户在底部附近时,内容增长自动滚到底;上滑后停止跟随。 */

import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD_PX = 96;

export function useStickToBottom(deps: readonly unknown[]): {
  ref: (el: HTMLDivElement | null) => void;
  atBottom: boolean;
  scrollToBottom: () => void;
} {
  const elRef = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const onScroll = useCallback(() => {
    const el = elRef.current;
    if (el === null) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD_PX;
    stick.current = near;
    setAtBottom(near);
  }, []);

  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      elRef.current?.removeEventListener("scroll", onScroll);
      elRef.current = el;
      el?.addEventListener("scroll", onScroll, { passive: true });
    },
    [onScroll],
  );

  const scrollToBottom = useCallback(() => {
    const el = elRef.current;
    if (el === null) return;
    stick.current = true;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = elRef.current;
    if (el !== null && stick.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, atBottom, scrollToBottom };
}
