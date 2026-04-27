import type { Variants } from "framer-motion";

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 30 },
  },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 400, damping: 30 },
  },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.1 } },
};

export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06 } },
};

export const slideRight: Variants = {
  initial: { opacity: 0, x: -16 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 300, damping: 28 },
  },
  exit: { opacity: 0, x: 16, transition: { duration: 0.15 } },
};

export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 12 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 380, damping: 32 },
  },
  exit: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.12 } },
};

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 280, damping: 28, mass: 0.8 },
  },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
};
