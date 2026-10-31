/* FORGE synth voice — the inner loop of Synth.voice() (src/engine/03_synth.js) in C, compiled to WebAssembly.
   WHY: in JavaScript this loop produced ~20–50 MB of garbage per second of audio (doubles boxed at call boundaries V8 did not
   inline — and whether it inlines changed from run to run), all of it on the audio thread. Here nothing is ever allocated.
   EXACTNESS: every expression is the JavaScript one, in the same order, in double precision; float tables are read as
   float and widened (as a Float32Array read is); wasm32 has no fused multiply-add, so nothing is contracted; exp / pow / tan /
   cos are JavaScript's own Math functions (imported). The output is meant to be bit-identical: tools/wasm_test.cjs checks it.
   STATE: the JavaScript Voice is copied in (V, PH, PA, PD, KS) before a block and back after it — the trigger logic, voice
   stealing and hand-over stay in JavaScript. */
typedef int int32_t; typedef unsigned int uint32_t;
__attribute__((import_module("env"), import_name("exp"))) double js_exp(double);
__attribute__((import_module("env"), import_name("pow"))) double js_pow(double, double);
__attribute__((import_module("env"), import_name("tan"))) double js_tan(double);
__attribute__((import_module("env"), import_name("cos"))) double js_cos(double);
#define EXPORT(n) __attribute__((export_name(n)))
#define PI 3.141592653589793
#define TAU 6.283185307179586
#define SN 4096
#define SNM 4095
#define WT_N 2048
#define WT_F 8
#define WT_L 8
#define KSN 2400
/* ---- shared memory (JavaScript writes and reads these through typed-array views) ---- */
enum { G_SR, G_BPM, G_BEAT, G_ECO, G_NZ, G_COUNT = 8 };
enum { P_aDec, P_fDec, P_fAtk, P_glide, P_mLfoS, P_lfoRate, P_aSus, P_fSus, P_pEnv, P_lfoAmp, P_gain, P_tone, P_uni, P_detune, P_spread, P_pDec,
  P_lfoDepth, P_mLfo, P_keytrack, P_cut, P_envAmt, P_mCut, P_l2Sync, P_l2Rate, P_l2Pitch, P_pos, P_posEnv, P_posLfo, P_mPos, P_table, P_res, P_mRes,
  P_ftype, P_drive, P_vow, P_vowLfo, P_sub, P_wave, P_pw, P_voices, P_ratio, P_index, P_bright, P_lfoSync, P_lfoShape, P_width, P_fold, P_noiseAmt, P_subPost, P_COUNT };
enum { V_m, V_atk, V_rel, V_ls, V_ft, V_vel, V_gl, V_gr, V_env, V_stage, V_fenv, V_fstage, V_f, V_lfo, V_t, V_len, V_relFast, V_fadeIn, V_ag, V_wait,
  V_note, V_bright, V_acc, V_cut, V_mph, V_mph2, V_e1, V_e2, V_e3, V_d1, V_d2, V_d3, V_kw, V_kl, V_kz, V_apx, V_apy, V_vg, V_on,
  V_LAD = 40, V_S1 = 48, V_S2 = 58, V_S3 = 68, V_S4 = 78, V_COUNT = 88 };
enum { LD_S1, LD_S2, LD_S3, LD_S4, LD_G4, LD_g, LD_k, LD_drive };      /* Ladder fields (G4 = the JS field G) */
enum { SV_ic1, SV_ic2, SV_g, SV_k, SV_a1, SV_a2, SV_a3, SV_lp, SV_bp, SV_hp };  /* Svf fields */
enum { C_SAW = 0, C_ORGR = 7, C_ORGD = 16, C_PIANO = 25, C_UOFF = 33, C_UPAN = 82, C_VOW = 131, C_COUNT = 146 };
static double G[G_COUNT], P[P_COUNT], V[V_COUNT], PH[9], PA[8], PD[8], C[C_COUNT];
static float SINT[SN + 1], KS[KSN], OL[128], OR_[128];
static float WT[8][WT_L][WT_F * WT_N]; /* the wavetables, copied in once per table */
EXPORT("g") double *eg(void) { return G; } EXPORT("p") double *ep(void) { return P; } EXPORT("v") double *ev(void) { return V; }
EXPORT("ph") double *eph(void) { return PH; } EXPORT("pa") double *epa(void) { return PA; } EXPORT("pd") double *epd(void) { return PD; }
EXPORT("c") double *ec(void) { return C; } EXPORT("sin") float *esin(void) { return SINT; } EXPORT("ks") float *eks(void) { return KS; }
EXPORT("ol") float *eol(void) { return OL; } EXPORT("or") float *eor(void) { return OR_; } EXPORT("wt") float *ewt(int t, int k) { return WT[t][k]; }
EXPORT("counts") int ecounts(int k) { return k == 0 ? G_COUNT : k == 1 ? P_COUNT : k == 2 ? V_COUNT : C_COUNT; }

static int32_t NZ;
static inline double noise(void) { NZ ^= (int32_t)((uint32_t)NZ << 13); NZ ^= NZ >> 17; NZ ^= (int32_t)((uint32_t)NZ << 5); return (double)NZ / 2147483648.0; }
static inline double clampd(double x, double a, double b) { return x < a ? a : x > b ? b : x; }
static inline double mind(double a, double b) { return a < b ? a : b; } /* Math.min / Math.max on non-NaN values */
static inline double maxd(double a, double b) { return a > b ? a : b; }
static inline double floord(double x) { return __builtin_floor(x); }
static inline double mod1(double x) { return x - __builtin_trunc(x); } /* JS x % 1 (exact for every finite x) */
static inline double sin1(double ph) { const double x = ph * SN, t = floord(x), f = x - t; const int i = (int)(long long)t & SNM; return (double)SINT[i] + ((double)SINT[i + 1] - (double)SINT[i]) * f; }
static inline double tanh_(double x) { if (x > 4) return 1; if (x < -4) return -1; const double x2 = x * x; return x * (27 + x2) / (27 + 9 * x2); }
static inline double blep(double t, double dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
static inline void svf_set(double *s, double fc, double q, double sr) { fc = clampd(fc, 10, sr * 0.49); const double g = js_tan(PI * fc / sr); s[SV_g] = g; s[SV_k] = 1 / maxd(0.05, q); s[SV_a1] = 1 / (1 + g * (g + s[SV_k])); s[SV_a2] = g * s[SV_a1]; s[SV_a3] = g * s[SV_a2]; }
static inline void svf_run(double *s, double x) { const double v3 = x - s[SV_ic2], v1 = s[SV_a1] * s[SV_ic1] + s[SV_a2] * v3, v2 = s[SV_ic2] + s[SV_a2] * s[SV_ic1] + s[SV_a3] * v3;
  s[SV_ic1] = 2 * v1 - s[SV_ic1]; s[SV_ic2] = 2 * v2 - s[SV_ic2]; s[SV_lp] = v2; s[SV_bp] = v1; s[SV_hp] = x - s[SV_k] * v1 - v2; }
static inline void lad_set(double *l, double fc, double res, double sr) { fc = clampd(fc, 15, sr * 0.45); const double g = js_tan(PI * fc / sr); l[LD_g] = g / (1 + g); l[LD_G4] = l[LD_g] * l[LD_g] * l[LD_g] * l[LD_g]; l[LD_k] = clampd(res, 0, 1) * 3.9; }
static inline double lad_run(double *l, double x) { const double g = l[LD_g];
  const double s = l[LD_S1] * g * g * g + l[LD_S2] * g * g + l[LD_S3] * g + l[LD_S4]; const double S = s * (1 - g);
  double u = (x * l[LD_drive] - l[LD_k] * (l[LD_G4] * x * l[LD_drive] + S) / (1 + l[LD_k] * l[LD_G4])); u = tanh_(u);
  double v = (u - l[LD_S1]) * g; const double y1 = v + l[LD_S1]; l[LD_S1] = y1 + v;
  v = (y1 - l[LD_S2]) * g; const double y2 = v + l[LD_S2]; l[LD_S2] = y2 + v;
  v = (y2 - l[LD_S3]) * g; const double y3 = v + l[LD_S3]; l[LD_S3] = y3 + v;
  v = (y3 - l[LD_S4]) * g; const double y4 = v + l[LD_S4]; l[LD_S4] = y4 + v;
  return y4 * (1 + l[LD_k] * 0.25); }
static inline int wtLevel(double f, double sr) { const double allowed = 0.45 * sr / maxd(1, f); int k = 0; while (k < WT_L - 1 && (double)((WT_N / 2) >> k) > allowed) k++; return k; }
static const double WT_VOW_[5][3] = { { 800, 1150, 2900 }, { 400, 1600, 2700 }, { 300, 2200, 3000 }, { 450, 800, 2830 }, { 325, 700, 2530 } };
static const unsigned char TONE_M[32] = { 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0 };

EXPORT("voice") void voice(int n) {
  double *v = V, *lad = V + V_LAD, *s1 = V + V_S1, *s2 = V + V_S2, *s3 = V + V_S3, *s4 = V + V_S4; float *L = OL, *R = OR_;
  NZ = (int32_t)G[G_NZ];
  const double sr = G[G_SR], inv = 1 / sr, bpm = G[G_BPM], beat = G[G_BEAT]; const int m = (int)v[V_m];
  const double aA = 1 - js_exp(-1 / (maxd(0.0005, v[V_atk]) * sr)), aD = js_exp(-1 / (maxd(0.005, P[P_aDec]) * sr)), aRn = js_exp(-1 / (maxd(0.005, v[V_rel]) * sr)), aRf = js_exp(-1 / (0.004 * sr));
  const double fD = js_exp(-1 / (maxd(0.005, P[P_fDec]) * sr)), fA = 1 - js_exp(-1 / (maxd(0.0005, P[P_fAtk]) * sr)), gl = P[P_glide] > 0 ? 1 - js_exp(-1 / (P[P_glide] * sr)) : 1;
  const double lsync = P[P_mLfoS] > 0 ? P[P_mLfoS] : v[V_ls], lfoInc = lsync != 0 ? (bpm / 60) / lsync / sr : P[P_lfoRate] / sr;
  const double sus = P[P_aSus], fSus = P[P_fSus], pEnv = P[P_pEnv], lfoAmp = P[P_lfoAmp], ft = v[V_ft], outG = v[V_vel] * P[P_gain], gL = v[V_gl], gR = v[V_gr];
  double env = v[V_env], stage = v[V_stage], fenv = v[V_fenv], fstage = v[V_fstage], f = v[V_f], lfo = v[V_lfo], tt = v[V_t], len = v[V_len], relFast = v[V_relFast], fadeIn = v[V_fadeIn], ag = v[V_ag]; int alive = 1;
  int i = 0, wTt = 0, wTk = 0; double wA = 0, wB = 0, wFr = 0, wPm = 1, wCombD = 100, wCombG = 0;
  const int toneOn = TONE_M[m & 31] == 1 && P[P_tone] < 0.999;
  int U = 1; if (m == 24) { double u = clampd((double)(int)P[P_uni], 1, G[G_ECO] >= 2 ? 2 : 7); U = (int)u; }
  const int ssThin = G[G_ECO] >= 2 ? 1 : 0; /* eco 2: a supersaw plays its centre and two outer saws (level-matched), not seven */
  const double *uOff = C + C_UOFF + (U - 1) * 7, *uPan = C + C_UPAN + (U - 1) * 7, uDet = P[P_detune] * 0.03, uG = 1 / __builtin_sqrt((double)U), uW = P[P_spread] * clampd((v[V_note] - 47) / 13, 0, 1);
  while (i < n) {
    if (v[V_wait] > 0) { const double w = mind(v[V_wait], (double)(n - i)); v[V_wait] -= w; len -= w; i += (int)w; if (i >= n) break; }
    const int end = (int)mind((double)n, (double)(i + (fstage == 0 || tt < 256 ? 4 : 16)));
    double pe = 1, dpe = 0; if (pEnv != 0) { pe = js_pow(2, pEnv * js_exp(-(tt * inv) / P[P_pDec]) / 12); dpe = (js_pow(2, pEnv * js_exp(-((tt + end - i) * inv) / P[P_pDec]) / 12) - pe) / (end - i); }
    const double lfd = P[P_lfoDepth] + P[P_mLfo], lph = P[P_mLfoS] > 0 ? mod1((beat + i * bpm / 60 / sr) / P[P_mLfoS]) : lfo;
    const double kt = js_pow(f / 261.6, P[P_keytrack]), lf = lfd != 0 ? (m == 5 ? 0.5 - 0.5 * js_cos(TAU * lph) : sin1(lph)) * lfd : 0;
    double cut = P[P_cut] * v[V_bright] * kt * js_pow(2, (P[P_envAmt] * (1 + v[V_acc] * 0.6)) * fenv + (m == 5 ? lf * 5 - 1 : lf * 2) + P[P_mCut]);
    cut = clampd(cut, 20, sr * 0.45); v[V_cut] = cut;
    if (m == 24) {
      double l2 = 0; if (P[P_l2Sync] > 0) l2 = sin1(mod1((beat + i * bpm / 60 / sr) / P[P_l2Sync])); else if (P[P_l2Rate] > 0) l2 = sin1(mod1(tt * inv * P[P_l2Rate]));
      wPm = P[P_l2Pitch] != 0 ? js_pow(2, P[P_l2Pitch] * l2 / 1200) : 1;
      const double pos = clampd(P[P_pos] + P[P_posEnv] * fenv + P[P_posLfo] * l2 + P[P_mPos], 0, 1) * (WT_F - 1), fi = mind(WT_F - 2, floord(pos));
      wTt = (int)P[P_table]; if (wTt < 0 || wTt >= 8) wTt = 0; wTk = wtLevel(f * pe * wPm * (1 + 0.03 * P[P_detune]), sr); wA = fi * WT_N; wB = wA + WT_N; wFr = pos - fi;
      const double q = P[P_res] + P[P_mRes], ft2 = P[P_ftype];
      if (ft2 == 0) { lad_set(lad, cut, mind(0.97, q + v[V_acc] * 0.08), sr); lad[LD_drive] = P[P_drive]; }
      else if (ft2 == 3) { const double x = clampd(P[P_vow] + P[P_vowLfo] * l2, 0, 4), vi = mind(3, floord(x)), vf = x - vi; const double *A0 = WT_VOW_[(int)vi], *A1 = WT_VOW_[(int)vi + 1]; const double sh = js_pow(2, P[P_mCut] * 0.5);
        svf_set(s1, (A0[0] + (A1[0] - A0[0]) * vf) * sh, 8, sr); svf_set(s2, (A0[1] + (A1[1] - A0[1]) * vf) * sh, 10, sr); svf_set(s3, (A0[2] + (A1[2] - A0[2]) * vf) * sh, 12, sr); }
      else if (ft2 == 4) { wCombD = clampd(sr / maxd(20, f * pe * wPm), 2, 2390); wCombG = 0.55 + 0.43 * clampd(q, 0, 1); svf_set(s1, cut, 0.7, sr); }
      else { svf_set(s1, cut, 0.6 + q * 2.5, sr); svf_set(s2, cut, 0.6 + q * 2.5, sr); } }
    else if (m == 3 || m == 2 || m == 4 || m == 5 || m == 21 || m == 22 || m == 23 || m == 1 || m == 17) { lad_set(lad, cut, mind(0.97, P[P_res] + P[P_mRes] + v[V_acc] * 0.08), sr); lad[LD_drive] = P[P_drive]; }
    else if (m == 18) svf_set(s1, cut, 4 + (P[P_res] + P[P_mRes]) * 10, sr);
    else if (m != 16) svf_set(s1, cut, 0.6 + (P[P_res] + P[P_mRes]) * 2.5, sr);
    if (toneOn) svf_set(s4, clampd(110 * js_pow(2, P[P_tone] * 7.6 + P[P_mCut] + lf * 2 + P[P_envAmt] * 2 * fenv), 40, sr * 0.45), 0.6 + (P[P_res] + P[P_mRes]) * 2.2, sr);
    const float *T = WT[wTt][wTk];
    for (; i < end; i++) {
      if (stage == 0) { env += (1.05 - env) * aA; if (env >= 1) { env = 1; stage = 1; } }
      else if (stage == 1) { env = sus + (env - sus) * aD; }
      else { env *= relFast != 0 ? aRf : aRn; if (env < 3e-3 && stage == 3) relFast = 1; if (env < 1e-4) { alive = 0; break; } }
      if (fadeIn >= 0) { const double old = fadeIn; fadeIn -= 1; if (old == 0) { relFast = 1; stage = 3; } }
      if (stage < 3) { len -= 1; if (len <= 0) stage = 3; }
      if (fstage == 0) { fenv += (1 - fenv) * fA; if (fenv > 0.98) fstage = 1; } else fenv = fSus + (fenv - fSus) * fD;
      f += (ft - f) * gl; lfo += lfoInc; if (lfo >= 1) lfo -= 1;
      double am = 1; if (lfoAmp != 0) { const double ph = P[P_lfoSync] != 0 ? mod1((beat + i * bpm / 60 / sr) / P[P_lfoSync]) : lfo, raw = P[P_lfoShape] == 1 ? (ph < 0.5 ? 1 : 0) : P[P_lfoShape] == 2 ? 1 - ph : 0.5 + 0.5 * sin1(ph); ag += (raw - ag) * 0.03; am = 1 - lfoAmp * (1 - ag); }
      const double t = tt * inv; tt++;
      const double dt = f * pe * wPm * inv; pe += dpe;
      double y = 0;
      switch (m) {
        case 0: { PH[0] += dt; if (PH[0] >= 1) PH[0] -= 1; y = sin1(PH[0]) + P[P_sub] * 0.25 * sin1(PH[0] * 2); y = tanh_(y * P[P_drive]) / tanh_(P[P_drive]); break; }
        case 1: { PH[0] += dt; if (PH[0] >= 1) PH[0] -= 1; y = tanh_(sin1(PH[0]) * P[P_drive]) / mind(1, tanh_(P[P_drive])); break; }
        case 2: { const double d = P[P_detune] * 0.012 * (1 + 0.3 * sin1(lfo * 0.5)); double s = 0;
          for (int k = 0; k < 3; k++) { const double dk = dt * (k == 0 ? 1 - d : k == 1 ? 1 + d : 1); PH[k] += dk; if (PH[k] >= 1) PH[k] -= 1; s += 2 * PH[k] - 1 - blep(PH[k], dk); }
          PH[3] += dt; if (PH[3] >= 1) PH[3] -= 1; y = lad_run(lad, s * 0.4) - sin1(PH[3]) * P[P_sub] * 0.6; y = tanh_(y * 1.2); break; }
        case 3: case 4: case 22: case 23: case 21: {
          PH[0] += dt; if (PH[0] >= 1) PH[0] -= 1; double s;
          if (P[P_wave] == 1 || m == 23) { const double pw = P[P_pw]; s = (PH[0] < pw ? 1 : -1) + blep(PH[0], dt) - blep(mod1(PH[0] - pw + 1), dt) + 1 - 2 * pw; } /* no DC: 2*pw-1 removed */ else s = 2 * PH[0] - 1 - blep(PH[0], dt);
          if (P[P_voices] > 1) { const double dk = dt * (1 + P[P_detune] * 0.01); PH[1] += dk; if (PH[1] >= 1) PH[1] -= 1; s = (s + 2 * PH[1] - 1 - blep(PH[1], dk)) * 0.6; }
          double sb = 0; if (P[P_sub] != 0) { PH[2] += dt; if (PH[2] >= 1) PH[2] -= 1; const double x = (P[P_wave] == 1 || m == 23 ? P[P_sub] : -P[P_sub]) * sin1(PH[2]); s += x * (1 - P[P_subPost]); sb = x * P[P_subPost]; } /* the sub in phase with the saw's fundamental; subPost: after the filter */
          y = lad_run(lad, s * 0.5) * (1 + v[V_acc] * 0.35) + sb * 0.5; break; }
        case 5: {
          PH[0] += dt; if (PH[0] >= 1) PH[0] -= 1; PH[1] += dt * 1.003; if (PH[1] >= 1) PH[1] -= 1;
          const double s = (2 * PH[0] - 1 - blep(PH[0], dt)) * 0.5 + ((PH[1] < 0.5 ? 1 : -1) + blep(PH[1], dt) - blep(mod1(PH[1] + 0.5), dt)) * 0.4;
          PH[2] += dt; if (PH[2] >= 1) PH[2] -= 1; y = tanh_(lad_run(lad, s) * P[P_drive]) * 0.8 + sin1(PH[2]) * P[P_sub] * 0.5; break; }
        case 6: {
          PH[0] += dt; if (PH[0] >= 1) PH[0] -= 1; v[V_mph] += dt * P[P_ratio]; if (v[V_mph] >= 1) v[V_mph] -= 1;
          const double idx = P[P_index] * (0.4 + 0.6 * (0.5 + 0.5 * sin1(lfo))); const double s = sin1(PH[0] + idx * sin1(v[V_mph]) * 0.3);
          svf_run(s1, tanh_(s * P[P_drive])); y = s1[SV_lp] * 0.7 + s1[SV_bp] * 0.5; PH[2] += dt; if (PH[2] >= 1) PH[2] -= 1; y -= sin1(PH[2]) * P[P_sub] * 0.5; break; }
        case 7: {
          double s = 0; for (int k = 0; k < 9; k++) { const double lv = C[C_ORGD + k] * (P[P_bright] + (k < 3 ? 0.5 : 0)); if (lv == 0) continue; PH[k] += dt * C[C_ORGR + k]; if (PH[k] >= 1) PH[k] -= 1; s += sin1(PH[k]) * lv; }
          y = s * 0.35 + (t < 0.004 ? noise() * 0.05 * (1 - t / 0.004) : 0); break; }
        case 8: {
          PH[0] += dt * (1 + v[V_e1]); if (PH[0] >= 1) PH[0] -= 1; PH[1] += dt * 2.72; if (PH[1] >= 1) PH[1] -= 1;
          y = tanh_((sin1(PH[0]) + sin1(PH[1]) * v[V_e2]) * P[P_drive]) + (v[V_e3] > 1e-6 ? noise() * v[V_e3] : 0); v[V_e1] *= v[V_d1]; v[V_e2] *= v[V_d2]; v[V_e3] *= v[V_d3]; svf_run(s1, y); y = s1[SV_lp]; break; }
        case 9: case 10: case 19: {
          const int N = m == 9 ? 7 : 3; const double D = P[P_detune]; double s = 0, sl = 0, srr = 0;
          if (m == 9 && ssThin) { /* eco 2: the centre and the two outer saws, level-matched (a separate loop: the full stack's loop stays as it was) */
            for (int k = 0; k < 7; k += 3) { const double off = C[C_SAW + k]; const double dk = dt * (1 + off * D * 1); PH[k] += dk; if (PH[k] >= 1) PH[k] -= 1; const double o = 2 * PH[k] - 1 - blep(PH[k], dk);
              const double c = (k == 3 ? 0.5 : 0.28) * 1.33; s += o * c; if (k & 1) sl += o * c; else srr += o * c; } }
          else for (int k = 0; k < N; k++) { const double off = m == 9 ? C[C_SAW + k] : (k - 1) * 0.012; const double dk = dt * (1 + off * D * 1); PH[k] += dk; if (PH[k] >= 1) PH[k] -= 1; const double o = 2 * PH[k] - 1 - blep(PH[k], dk);
            const double c = m == 9 ? (k == 3 ? 0.5 : 0.28) : 0.45; s += o * c; if (k & 1) sl += o * c; else srr += o * c; }
          svf_run(s1, s); y = s1[SV_lp]; const double w = P[P_width] * clampd((v[V_note] - 47) / 13, 0, 1); const double side = (sl - srr) * w * 0.35;
          const double yl = (y + side) * env * outG * am, yr = (y - side) * env * outG * am; L[i] = (float)((double)L[i] + yl * gL); R[i] = (float)((double)R[i] + yr * gR); continue; }
        case 11: {
          PH[0] += dt; if (PH[0] >= 1) PH[0] -= 1; PH[1] += dt * 1.004; if (PH[1] >= 1) PH[1] -= 1;
          const double s = (2 * PH[0] - 1 - blep(PH[0], dt)) * 0.55 + ((PH[1] < 0.5 ? 1 : -1) + blep(PH[1], dt) - blep(mod1(PH[1] + 0.5), dt)) * 0.35;
          svf_run(s1, s); y = s1[SV_lp]; break; }
        case 12: {
          double s = 0; for (int k = 0; k < 8; k++) { PH[k] += dt * C[C_PIANO + k]; if (PH[k] >= 1) PH[k] -= 1; s += sin1(PH[k]) * PA[k]; PA[k] *= PD[k]; }
          y = s * 0.6 + (v[V_e1] > 1e-6 ? noise() * v[V_e1] : 0); v[V_e1] *= v[V_d1]; break; }
        case 13: {
          v[V_mph] += dt; if (v[V_mph] >= 1) v[V_mph] -= 1; v[V_mph2] += dt * 14; if (v[V_mph2] >= 1) v[V_mph2] -= 1; PH[0] += dt; if (PH[0] >= 1) PH[0] -= 1;
          const double idx = (0.5 + v[V_e1]) * (0.6 + 0.4 * v[V_vel]); y = sin1(PH[0] + idx * 0.16 * sin1(v[V_mph])) + sin1(v[V_mph2]) * v[V_e2]; v[V_e1] *= v[V_d1]; v[V_e2] *= v[V_d2]; break; }
        case 14: {
          v[V_mph] += dt * P[P_ratio]; if (v[V_mph] >= 1) v[V_mph] -= 1; PH[0] += dt; if (PH[0] >= 1) PH[0] -= 1; y = sin1(PH[0] + P[P_index] * v[V_e1] * 0.16 * sin1(v[V_mph])); v[V_e1] *= v[V_d1]; break; }
        case 15: {
          const int w = (int)v[V_kw], i1 = (w - (int)v[V_kl] + KSN) % KSN, i2 = i1 == 0 ? KSN - 1 : i1 - 1; const double a = 0.5 * ((double)KS[i1] + (double)KS[i2]) * (0.993 + 0.006 * P[P_bright]);
          const double ap = v[V_kz] * a + v[V_apx] - v[V_kz] * v[V_apy]; v[V_apx] = a; v[V_apy] = ap; KS[w] = (float)ap; v[V_kw] = w + 1 == KSN ? 0 : w + 1; y = ap; break; }
        case 16: {
          PH[0] += dt; if (PH[0] >= 1) PH[0] -= 1; const double s = 2 * PH[0] - 1 - blep(PH[0], dt);
          svf_run(s1, s); svf_run(s2, s); svf_run(s3, s); y = (s1[SV_bp] * 1.0 + s2[SV_bp] * 0.6 + s3[SV_bp] * 0.35) * v[V_vg]; break; }
        case 17: {
          const double d = P[P_detune] * 0.02; double s = 0; for (int k = 0; k < 3; k++) { const double dk = dt * (1 + (k - 1) * d); PH[k] += dk; if (PH[k] >= 1) PH[k] -= 1; s += 2 * PH[k] - 1 - blep(PH[k], dk); }
          const double pw = 0.5 + 0.35 * sin1(lfo); PH[3] += dt * 0.5; if (PH[3] >= 1) PH[3] -= 1; s += ((PH[3] < pw ? 1 : -1)) * 0.5; y = lad_run(lad, s * 0.35); break; }
        case 18: {
          PH[0] += dt * 0.9965182684649139; if (PH[0] >= 1) PH[0] -= 1; PH[1] += dt * 1.003493896344168; if (PH[1] >= 1) PH[1] -= 1; const double s = (2 * PH[0] - 1) + (2 * PH[1] - 1);
          svf_run(s1, tanh_(s * P[P_drive])); y = tanh_(s1[SV_bp] * 2.5) * 0.6; break; }
        case 24: {
          double s = 0, sl = 0, sr2 = 0;
          for (int k = 0; k < U; k++) { const double dk = dt * (1 + uOff[k] * uDet); double p0 = PH[k] + dk; if (p0 >= 1) p0 -= 1; PH[k] = p0; const double x = p0 * WT_N; const int i0 = (int)x; const double a = x - i0; const int i1 = (i0 + 1) & (WT_N - 1);
            const int ia = (int)wA, ib = (int)wB; const double ya = (double)T[ia + i0] + ((double)T[ia + i1] - (double)T[ia + i0]) * a, yb = (double)T[ib + i0] + ((double)T[ib + i1] - (double)T[ib + i0]) * a, o = ya + (yb - ya) * wFr; s += o; if (uPan[k] > 0) sl += o * uPan[k]; else sr2 -= o * uPan[k]; }
          s *= uG; if (P[P_sub] != 0) { PH[8] += dt; if (PH[8] >= 1) PH[8] -= 1; s += sin1(PH[8]) * P[P_sub] * 0.7; } if (P[P_noiseAmt] != 0) s += noise() * P[P_noiseAmt] * 0.5;
          if (P[P_fold] != 0) s = s * (1 - P[P_fold]) + sin1(s * (1 + 5 * P[P_fold]) * 0.25) * P[P_fold] * 0.8;
          const double ftp = P[P_ftype]; double side = (sl - sr2) * uG * uW;
          if (ftp == 0) { y = lad_run(lad, s * 0.6) * 1.4; side *= clampd(v[V_cut] / 4000, 0.15, 1); }
          else if (ftp == 1) { svf_run(s1, s); y = s1[SV_bp] * 1.4; svf_run(s2, side); side = s2[SV_bp] * 1.4; }
          else if (ftp == 2) { svf_run(s1, s); y = s1[SV_hp]; svf_run(s2, side); side = s2[SV_hp]; }
          else if (ftp == 3) { svf_run(s1, s); svf_run(s2, s); svf_run(s3, s); y = (s1[SV_bp] + s2[SV_bp] * 0.7 + s3[SV_bp] * 0.4) * 0.38 + s * 0.4; side *= 0.3; }
          else { const int w = (int)v[V_kw]; const double rp = w - wCombD, ri = floord(rp), fr2 = rp - ri; const int j0 = ((int)ri + KSN) % KSN, j1 = (j0 + 1) % KSN; const double d = (double)KS[j0] + ((double)KS[j1] - (double)KS[j0]) * fr2;
            const double cy = s + d * wCombG; KS[w] = (float)cy; v[V_kw] = w + 1 == KSN ? 0 : w + 1; svf_run(s1, cy); y = s1[SV_lp] * (1 - wCombG) * 2.2; side *= 0.4; }
          const double gg = env * outG * am; L[i] = (float)((double)L[i] + (y + side) * gg * gL); R[i] = (float)((double)R[i] + (y - side) * gg * gR); continue; }
        case 20: {
          const double d0 = dt * 0.997, d1 = dt * 1.003; PH[0] += d0; if (PH[0] >= 1) PH[0] -= 1; PH[1] += d1; if (PH[1] >= 1) PH[1] -= 1; const double s = (2 * PH[0] - 1 - blep(PH[0], d0)) + (2 * PH[1] - 1 - blep(PH[1], d1));
          svf_run(s1, s * 0.5); y = s1[SV_lp]; break; }
      }
      if (toneOn) { svf_run(s4, y); y = s4[SV_lp]; }
      y *= env * outG * am; L[i] = (float)((double)L[i] + y * gL); R[i] = (float)((double)R[i] + y * gR);
    }
    if (!alive) break;
  }
  v[V_env] = env; v[V_stage] = stage; v[V_fenv] = fenv; v[V_fstage] = fstage; v[V_f] = f; v[V_lfo] = lfo; v[V_t] = tt; v[V_len] = len; v[V_relFast] = relFast; v[V_fadeIn] = fadeIn; v[V_ag] = ag;
  if (!alive) { v[V_on] = 0; v[V_relFast] = 0; v[V_fadeIn] = -1; } else v[V_on] = 1;
  G[G_NZ] = (double)NZ;
}
