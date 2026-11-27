/* Smooth scrolling for the whole page, with Lenis: the page eases towards
   where the wheel or trackpad sends it instead of jumping there. It runs
   on GSAP's clock and tells ScrollTrigger each time it moves, so
   scroll-driven animations (the "Why we're here" section) stay in step.
   In-page links (#work, #talk and so on) glide too.

   Left off for anyone who has asked for reduced motion, and on touch
   screens, where the device's own scrolling feels better. */
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/* A phone's address bar sliding in and out changes the window's height;
   don't recalculate every scroll animation when it does, or the page
   stutters and nudges while scrolling. */
ScrollTrigger.config({ ignoreMobileResize: true });

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = window.matchMedia('(pointer: coarse)').matches;

if (!reduce && !touch) {
  const lenis = new Lenis({
    /* How quickly the page catches up: lower is smoother and slower. */
    lerp: 0.09,
    wheelMultiplier: 1,
    anchors: true,
  });

  lenis.on('scroll', ScrollTrigger.update);
  /* Shared, so sections that snap the scroll can move it through Lenis. */
  (window as unknown as { lenis?: Lenis }).lenis = lenis;
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}
