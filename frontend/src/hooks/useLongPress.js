import { useRef, useCallback } from 'react';

/**
 * Long press (touch or mouse) without breaking a normal tap.
 * Returns handlers to spread on an element, plus `wasLongPress()` so the
 * element's onClick can ignore the click that ends a long press.
 * Moving the finger (scrolling) cancels it.
 */
export default function useLongPress(onLongPress, { delay = 500, moveTolerance = 10 } = {}) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const onPointerDown = useCallback((e, ...args) => {
    fired.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    clear();
    timer.current = setTimeout(() => {
      fired.current = true;
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15);
      } catch (err) {}
      onLongPress && onLongPress(...args);
    }, delay);
  }, [onLongPress, delay, clear]);

  const onPointerMove = useCallback((e) => {
    if (!start.current || !timer.current) return;
    if (Math.abs(e.clientX - start.current.x) > moveTolerance || Math.abs(e.clientY - start.current.y) > moveTolerance) clear();
  }, [moveTolerance, clear]);

  const wasLongPress = useCallback(() => {
    const was = fired.current;
    fired.current = false;
    return was;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e) => { e.preventDefault(); }
    },
    wasLongPress
  };
}
