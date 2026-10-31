/* ===================== FORGE ENGINE · core =====================
   Runs inside an AudioWorkletGlobalScope (or a Node harness / main-thread fallback).
   Rules for the audio thread: no arrays or objects made per block in render paths (what V8 still allocates there is short-lived
   number boxes: measured 11.6 MB per second of audio, trance at 48 kHz — young-generation garbage), every hot object gets its full
   shape at construction (shape()), all timing is sample-accurate from a musical clock. */
'use strict';
const TAU = 6.283185307179586, LN2 = 0.6931471805599453, ECO = { level: 0, exact: false, exactN: 0 }; // ECO.level: the engine's degradation step under CPU starvation (see Engine.setEco) · ECO.exact: no idle shortcuts (the stems export: every pass must keep the same state history)
const clamp = (x, a, b) => (x > a ? (x < b ? x : b) : a); // NaN-safe (v9.2): a NaN lands on the lower bound instead of travelling on (one NaN fader silenced the whole set for good)
const lerp = (a, b, t) => a + (b - a) * t;
const dbToGain = (d) => Math.pow(10, d / 20);
const gainToDb = (g) => 20 * Math.log10(Math.max(1e-9, g));
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const expCoef = (sec, sr) => (sec <= 0 ? 0 : Math.exp(-1 / (sec * sr))); // one-pole time constant
function shape(o) { for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === 'number' || v === null || v === undefined || typeof v === 'boolean' || typeof v === 'string') { o[k] = 0.5; o[k] = v; } } return o; }
// deterministic PRNG (mulberry32) — every musical decision derives from seeds, so a track can be re-rendered exactly
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
function wpick(r, items, weights) { let t = 0; for (const w of weights) t += w; let x = r() * t; for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return items[i]; } return items[items.length - 1]; }
// fast sine table (wraps any phase)
const SN = 4096, SNM = SN - 1, SIN = new Float32Array(SN + 1);
for (let i = 0; i <= SN; i++) SIN[i] = Math.sin(TAU * i / SN);
function sin1(ph) { const x = ph * SN, t = Math.floor(x), f = x - t, i = t & SNM; return SIN[i] + (SIN[i + 1] - SIN[i]) * f; } // ph in cycles
function tanh(x) { if (x > 4) return 1; if (x < -4) return -1; const x2 = x * x; return x * (27 + x2) / (27 + 9 * x2); }
// noise: xorshift, white in [-1,1)
let NZ = 0x12345678 | 0;
function noiseSeed(v) { NZ = (v | 0) || 0x12345678; } // tools: reproducible noise for A/B renders
function noise() { NZ ^= NZ << 13; NZ ^= NZ >> 17; NZ ^= NZ << 5; return (NZ | 0) / 2147483648; }
