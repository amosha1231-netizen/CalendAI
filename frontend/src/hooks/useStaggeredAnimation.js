/**
 * useStaggeredAnimation — Custom hook for staggered entrance animations
 * Provides delay values for list items to create smooth sequential entrance effects.
 */
import { useMemo } from 'react';

/**
 * @param {number} itemCount - Number of items in the list
 * @param {number} baseDelay - Starting delay in seconds (default 0.05)
 * @param {number} staggerInterval - Interval between each item in seconds (default 0.08)
 * @returns {Array<{delay: number, initial: object, animate: object}>} Animation configs per item
 */
export function useStaggeredAnimation(itemCount, baseDelay = 0.05, staggerInterval = 0.08) {
  return useMemo(() => {
    return Array.from({ length: itemCount }, (_, i) => ({
      delay: baseDelay + i * staggerInterval,
      initial: { opacity: 0, y: 20, scale: 0.95 },
      animate: { opacity: 1, y: 0, scale: 1 },
    }));
  }, [itemCount, baseDelay, staggerInterval]);
}

/**
 * Variants object for use with Framer Motion's `variants` prop.
 * Parent container uses `staggerChildren` to orchestrate children.
 */
export const staggerContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.05,
    },
  },
};

export const staggerItemVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 120,
      damping: 14,
      mass: 0.8,
    },
  },
};

/**
 * Scale-fade variants for modal/overlay entrance
 */
export const modalOverlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalContentVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25,
      mass: 0.9,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.92,
    y: 20,
    transition: { duration: 0.15 },
  },
};

export default useStaggeredAnimation;