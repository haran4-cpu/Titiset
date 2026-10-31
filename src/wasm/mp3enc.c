/* FORGE MP3 encoder — MPEG-1 Layer III, CBR 32…320 kbit/s, 32 / 44.1 / 48 kHz, mono, stereo or joint stereo (mid/side).
   FORGE's own code (no third-party encoder): the ISO/IEC 11172-3 polyphase analysis, the hybrid MDCT with long, start, short and
   stop blocks (window switching on transients, against pre-echo), alias reduction, a psychoacoustic threshold per scalefactor band
   (band energy, spreading, tonality from the spectrum's flatness, the threshold in quiet), the two nested loops of the standard
   (rate: the global gain that fits the bits; distortion: scalefactors that push the noise under the threshold), Huffman coding with
   the best table per region and the best region split, and the bit reservoir. The tables the standard defines (the Huffman codes,
   the window) are in mp3_tables.h.
   Built for WebAssembly without a C library (tools/mp3_build.cjs); the same file builds natively for the tests (-DNATIVE). */
#include "mp3_tables.h"
#ifdef NATIVE
#include <math.h>
#define EXPORT(n)
#define m_cos cos
#define m_sin sin
#define m_exp exp
#define m_log log
#else
__attribute__((import_module("env"), import_name("cos"))) double m_cos(double);
__attribute__((import_module("env"), import_name("sin"))) double m_sin(double);
__attribute__((import_module("env"), import_name("exp"))) double m_exp(double);
__attribute__((import_module("env"), import_name("log"))) double m_log(double);
#define EXPORT(n) __attribute__((export_name(n)))
#endif
#define PI 3.14159265358979323846
static inline double m_sqrt(double x) { return __builtin_sqrt(x); }
static inline double fabs_(double x) { return x < 0 ? -x : x; }
static inline double m_pow(double a, double b) { return a <= 0 ? 0 : m_exp(b * m_log(a)); }

/* ---------------- configuration ---------------- */
static int SR, NCH, KBPS, MODE, SRI, BRI; /* MODE: 0 stereo, 1 joint stereo, 3 mono */
static const int BITRATES[15] = { 0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320 };
static const int SFB_L[3][23] = { { 0, 4, 8, 12, 16, 20, 24, 30, 36, 44, 52, 62, 74, 90, 110, 134, 162, 196, 238, 288, 342, 418, 576 },
  { 0, 4, 8, 12, 16, 20, 24, 30, 36, 42, 50, 60, 72, 88, 106, 128, 156, 190, 230, 276, 330, 384, 576 },
  { 0, 4, 8, 12, 16, 20, 24, 30, 36, 44, 54, 66, 82, 102, 126, 156, 194, 240, 296, 364, 448, 550, 576 } };
static const int SFB_S[3][14] = { { 0, 4, 8, 12, 16, 22, 30, 40, 52, 66, 84, 106, 136, 192 }, { 0, 4, 8, 12, 16, 22, 28, 38, 50, 64, 80, 100, 126, 192 },
  { 0, 4, 8, 12, 16, 22, 30, 42, 58, 78, 104, 138, 180, 192 } };
static const int SLEN1[16] = { 0, 0, 0, 0, 3, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4 }, SLEN2[16] = { 0, 1, 2, 3, 0, 1, 2, 3, 1, 2, 3, 1, 2, 3, 2, 3 };
static const int PRETAB[22] = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 3, 2, 0 };
static const int *sfbL, *sfbS;

/* ---------------- state ---------------- */
static float INBUF[2][1152];            /* the next frame's PCM, planar, ±1 */
static double C512[512];                /* analysis window */
static double MCOS[32][64];             /* polyphase matrixing */
static double XF[2][512];               /* polyphase input FIFO */
static double SB[2][8][18][32];         /* subband samples of the last eight granules: [ch][granule % 8][time][band] */
static int ATKF[8];                     /* an attack in that granule (either channel) */
static double COSL[18][36], WIN[4][36], COSS[6][12], WINS[12], CS[8], CA[8];
static double XR[2][2][576];            /* [gr][ch] spectrum */
static int IX[576]; static double XR34[576], XRA[576];
static int BTYPE[2][2], PREVTYPE[2];    /* block type per granule/channel; the last granule's per channel */
static double PE_AVG = 0; static double ATHL[22], ATHS[13]; static double POW43[8208]; static long GRN = 0;
/* the output: frames wait in a queue until their payload (main data, which may be shared with the next frames through the
   reservoir) is complete */
#define MAXQ 16
static unsigned char OUT[1 << 16]; static int OUTN = 0;
static unsigned char MSTREAM[1 << 14]; static long MBASE = 0; /* main-data stream bytes from absolute offset MBASE */
static long S_NEXT = 0, E_END = 0;     /* the next frame's payload start in the stream; the end of the main data written so far */
static struct { unsigned char hs[36]; int hsn; long s, p; } Q[MAXQ]; static int QN = 0;
static int SLOT_LAG = 0; static long FRAMES = 0;

/* ---------------- bit writer ---------------- */
static unsigned char *bw_buf; static long bw_pos; /* bit position */
static void bw_put(unsigned v, int n) { while (n > 0) { const long byte = bw_pos >> 3; const int free = 8 - (int)(bw_pos & 7), k = n < free ? n : free;
    const unsigned bits = (v >> (n - k)) & ((1u << k) - 1); if ((bw_pos & 7) == 0) bw_buf[byte] = 0; bw_buf[byte] |= (unsigned char)(bits << (free - k)); bw_pos += k; n -= k; } }
static unsigned char GBUF[2][2][2048]; static long GBITS[2][2]; /* a granule/channel's main data (scalefactors + Huffman), bit-exact */

/* ---------------- init ---------------- */
EXPORT("mp3_init") int mp3_init(int sr, int nch, int kbps, int mode) {
  SR = sr; NCH = nch == 1 ? 1 : 2; KBPS = kbps; MODE = NCH == 1 ? 3 : mode == 0 ? 0 : 1;
  SRI = sr == 44100 ? 0 : sr == 48000 ? 1 : sr == 32000 ? 2 : -1; if (SRI < 0) return -1; BRI = -1; for (int i = 1; i < 15; i++) if (BITRATES[i] == kbps) BRI = i; if (BRI < 0) return -2;
  sfbL = SFB_L[SRI]; sfbS = SFB_S[SRI];
  int D[512]; for (int i = 0; i < 257; i++) { int x = ENWIN[i]; D[i] = x; if (i & 63) x = -x; if (i) D[512 - i] = x; }
  for (int i = 0; i < 512; i++) C512[i] = D[i] / 65536.0 / 32.0;
  for (int k = 0; k < 32; k++) for (int i = 0; i < 64; i++) MCOS[k][i] = m_cos((2 * k + 1) * (i - 16) * PI / 64.0);
  for (int m = 0; m < 18; m++) for (int k = 0; k < 36; k++) COSL[m][k] = m_cos(PI / 72.0 * (2 * k + 1 + 18) * (2 * m + 1));
  for (int m = 0; m < 6; m++) for (int k = 0; k < 12; k++) COSS[m][k] = m_cos(PI / 24.0 * (2 * k + 1 + 6) * (2 * m + 1));
  for (int k = 0; k < 36; k++) { WIN[0][k] = m_sin(PI / 36 * (k + 0.5)); }
  for (int k = 0; k < 18; k++) WIN[1][k] = WIN[0][k]; for (int k = 18; k < 24; k++) WIN[1][k] = 1; for (int k = 24; k < 30; k++) WIN[1][k] = m_sin(PI / 12 * (k - 18 + 0.5)); for (int k = 30; k < 36; k++) WIN[1][k] = 0; /* start */
  for (int k = 0; k < 6; k++) WIN[3][k] = 0; for (int k = 6; k < 12; k++) WIN[3][k] = m_sin(PI / 12 * (k - 6 + 0.5)); for (int k = 12; k < 18; k++) WIN[3][k] = 1; for (int k = 18; k < 36; k++) WIN[3][k] = WIN[0][k]; /* stop */
  for (int k = 0; k < 12; k++) WINS[k] = m_sin(PI / 12 * (k + 0.5));
  static const double c[8] = { -0.6, -0.535, -0.33, -0.185, -0.095, -0.041, -0.0142, -0.0037 };
  for (int i = 0; i < 8; i++) { const double s = m_sqrt(1 + c[i] * c[i]); CS[i] = 1 / s; CA[i] = c[i] / s; }
  /* the threshold in quiet per band (Terhardt), referenced to a full-scale sine ≈ 96 dB SPL, as energy in our spectrum's units */
  for (int b = 0; b < 22; b++) { double mn = 1e30; for (int i = sfbL[b]; i < sfbL[b + 1]; i++) { const double f = (i + 0.5) * SR / 1152.0 / 1000.0, a = 3.64 * m_pow(f, -0.8) - 6.5 * m_exp(-0.6 * (f - 3.3) * (f - 3.3)) + 0.001 * f * f * f * f;
      const double e = m_pow(10, (a - 96) / 10.0); if (e < mn) mn = e; } ATHL[b] = mn * (sfbL[b + 1] - sfbL[b]); }
  for (int b = 0; b < 13; b++) { double mn = 1e30; for (int i = sfbS[b]; i < sfbS[b + 1]; i++) { const double f = (i * 3 + 1.5) * SR / 1152.0 / 1000.0, a = 3.64 * m_pow(f, -0.8) - 6.5 * m_exp(-0.6 * (f - 3.3) * (f - 3.3)) + 0.001 * f * f * f * f;
      const double e = m_pow(10, (a - 96) / 10.0); if (e < mn) mn = e; } ATHS[b] = mn * (sfbS[b + 1] - sfbS[b]); }
  for (int ch = 0; ch < 2; ch++) { for (int i = 0; i < 512; i++) XF[ch][i] = 0; for (int g = 0; g < 8; g++) for (int t = 0; t < 18; t++) for (int b = 0; b < 32; b++) SB[ch][g][t][b] = 0; PREVTYPE[ch] = 0; } for (int g = 0; g < 8; g++) ATKF[g] = 0;
  for (int i = 0; i < 8208; i++) POW43[i] = m_pow(i, 4.0 / 3.0);
  OUTN = 0; MBASE = 0; S_NEXT = 0; E_END = 0; QN = 0; SLOT_LAG = 0; FRAMES = 0; PE_AVG = 0; GRN = 0; return 0; }
EXPORT("mp3_in") float *mp3_in(int ch) { return INBUF[ch]; }
EXPORT("mp3_out") unsigned char *mp3_out(void) { return OUT; }

/* ---------------- analysis ---------------- */
static void polyphase(int ch, const float *pcm, int G) { /* 576 samples → SB[ch][G % 4][18][32] */
  double *X = XF[ch]; double Y[64];
  for (int t = 0; t < 18; t++) { for (int i = 511; i >= 32; i--) X[i] = X[i - 32]; for (int i = 0; i < 32; i++) X[31 - i] = pcm[t * 32 + i];
    for (int i = 0; i < 64; i++) { double s = 0; for (int j = 0; j < 8; j++) s += X[i + 64 * j] * C512[i + 64 * j]; Y[i] = s; }
    for (int k = 0; k < 32; k++) { double s = 0; const double *M = MCOS[k]; for (int i = 0; i < 64; i++) s += M[i] * Y[i]; SB[ch][G & 7][t][k] = s; } } }
/* attack detection on the granule's time signal (the subband samples summed in four quarter-granule slices, high bands weighted) */
static double ATK_PREV[2] = { 0, 0 };
static int attack(int ch, int G) { double e[6]; for (int q = 0; q < 6; q++) { double s = 0; for (int t = q * 3; t < q * 3 + 3; t++) for (int b = 2; b < 32; b++) { const double v = SB[ch][G & 7][t][b]; s += v * v * (b > 8 ? 2 : 1); } e[q] = s + 1e-12; }
  double prev = ATK_PREV[ch] + 1e-12; int hit = 0; for (int q = 0; q < 6; q++) { if (e[q] > 12 * prev && e[q] > 1e-6) hit = 1; prev = 0.5 * prev + 0.5 * e[q]; } ATK_PREV[ch] = prev; return hit; }
static void hybrid(int ch, int G, int gr, int btype) { double *xr = XR[gr][ch]; double z[36];
  for (int b = 0; b < 32; b++) {
    for (int t = 0; t < 18; t++) { double a = SB[ch][(G + 7) & 7][t][b], c = SB[ch][G & 7][t][b]; if ((b & 1) && (t & 1)) { a = -a; c = -c; } z[t] = a; z[t + 18] = c; } /* odd bands: every other sample inverted */
    if (btype != 2) { const double *w = WIN[btype]; for (int m = 0; m < 18; m++) { double s = 0; for (int k = 0; k < 36; k++) s += z[k] * w[k] * COSL[m][k]; xr[b * 18 + m] = s; } }
    else for (int win = 0; win < 3; win++) { /* three short MDCTs over z[6 + 6win … 6 + 6win + 12) */ for (int m = 0; m < 6; m++) { double s = 0; for (int k = 0; k < 12; k++) s += z[6 + 6 * win + k] * WINS[k] * COSS[m][k]; xr[b * 18 + win * 6 + m] = s; } } }
  { const double k = btype == 2 ? 1.0 / 3.0 : 1.0 / 9.0; for (int i = 0; i < 576; i++) xr[i] *= k; } /* (the decoder's synthesis has a gain of 9 on long blocks, 3 on short ones (measured through ffmpeg): its output then equals the input) */
  if (btype != 2) for (int b = 0; b < 31; b++) for (int k = 0; k < 8; k++) { const double bu = xr[b * 18 + 17 - k], bd = xr[(b + 1) * 18 + k]; xr[b * 18 + 17 - k] = bu * CS[k] + bd * CA[k]; xr[(b + 1) * 18 + k] = bd * CS[k] - bu * CA[k]; }
  else { /* short blocks: reorder [band][win][6] → [sfb][win][width] (the order the Huffman coder and the scalefactors use) */
    double tmp[576]; int n = 0; for (int sb = 0; sb < 13; sb++) for (int win = 0; win < 3; win++) for (int i = sfbS[sb]; i < sfbS[sb + 1]; i++) { const int band = i / 6, m = i % 6; tmp[n++] = xr[band * 18 + win * 6 + m]; }
    for (int i = 0; i < 576; i++) xr[i] = tmp[i]; } }

/* ---------------- psychoacoustics: an allowed noise per scalefactor band ----------------
   band energy → spread to the neighbours (−25 dB up, −15 dB down per band) → lowered by the signal-to-mask ratio, which depends on
   how tonal the band is (spectral flatness: noise masks at ~6 dB, a pure tone needs ~24 dB), never under the threshold in quiet.
   Short blocks: the same per window. Returns the granule's perceptual entropy (bits a transparent coding would roughly need). */
static double THR[22], THRS[3][13], EN[22], ENS[3][13];
static double flatness(const double *x, int a, int b) { double lg = 0, ar = 0; int n = 0; for (int i = a; i < b; i++) { const double e = x[i] * x[i] + 1e-18; lg += m_log(e); ar += e; n++; } if (!n) return 1; const double gm = m_exp(lg / n), am = ar / n; return gm / (am + 1e-30); }
static double psy(const double *xr, int btype) { double pe = 0;
  if (btype != 2) { double sp[22];
    for (int b = 0; b < 22; b++) { double e = 0; for (int i = sfbL[b]; i < sfbL[b + 1]; i++) e += xr[i] * xr[i]; EN[b] = e; }
    for (int b = 0; b < 22; b++) { double s = EN[b]; if (b > 0) s += EN[b - 1] * 0.0316; if (b < 21) s += EN[b + 1] * 0.003; sp[b] = s; }
    for (int b = 0; b < 22; b++) { const double fl = flatness(xr, sfbL[b], sfbL[b + 1]), ton = fl > 0.6 ? 0 : fl < 0.05 ? 1 : (0.6 - fl) / 0.55, smr = 8 + 18 * ton + (b < 8 ? 3 : 0);
      double t = sp[b] * m_pow(10, -smr / 10); if (t < ATHL[b]) t = ATHL[b]; THR[b] = t; if (EN[b] > t) pe += (sfbL[b + 1] - sfbL[b]) * m_log(EN[b] / t) * 0.72; } }
  else for (int w = 0; w < 3; w++) { int base = 0; for (int sb = 0; sb < 13; sb++) { const int wd = sfbS[sb + 1] - sfbS[sb], o = base + w * wd; double e = 0; for (int i = 0; i < wd; i++) e += xr[o + i] * xr[o + i]; ENS[w][sb] = e; base += 3 * wd; }
    for (int sb = 0; sb < 13; sb++) { double s = ENS[w][sb]; if (sb > 0) s += ENS[w][sb - 1] * 0.0316; if (sb < 12) s += ENS[w][sb + 1] * 0.003; double t = s * m_pow(10, -14 / 10.0); if (t < ATHS[sb]) t = ATHS[sb]; THRS[w][sb] = t;
      if (ENS[w][sb] > t) pe += (sfbS[sb + 1] - sfbS[sb]) * m_log(ENS[w][sb] / t) * 0.72; } }
  return pe; }

/* ---------------- Huffman bit counting ---------------- */
static int hbits_pair(int t, int x, int y) { const int *h = HTAB[t]; const int lb = h[2], xl = h[0]; int bits = 0, xx = x, yy = y;
  if (lb || xl == 16) { if (xx > 14) { bits += lb; xx = 15; } if (yy > 14) { bits += lb; yy = 15; } }
  bits += HLEN[h[3] + xx * h[1] + yy]; if (x) bits++; if (y) bits++; return bits; }
static int count_region(const int *ix, int a, int b, int t) { if (t == 0) return 0; int bits = 0; for (int i = a; i < b; i += 2) bits += hbits_pair(t, ix[i], ix[i + 1]); return bits; }
static const int SMALL_T[] = { 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15 };
static int best_table(const int *ix, int a, int b, int *bitsOut) { int mx = 0; for (int i = a; i < b; i++) if (ix[i] > mx) mx = ix[i];
  if (mx == 0) { *bitsOut = 0; return 0; }
  int best = -1, bb = 1 << 30;
  if (mx <= 15) { for (unsigned k = 0; k < sizeof(SMALL_T) / sizeof(int); k++) { const int t = SMALL_T[k]; if (HTAB[t][0] - 1 < mx) continue; const int c = count_region(ix, a, b, t); if (c < bb) { bb = c; best = t; } } }
  else { const int need = mx - 15; int t1 = -1, t2 = -1; for (int t = 16; t < 24; t++) if ((1 << HTAB[t][2]) - 1 >= need) { t1 = t; break; } for (int t = 24; t < 32; t++) if ((1 << HTAB[t][2]) - 1 >= need) { t2 = t; break; }
    if (t1 >= 0) { const int c = count_region(ix, a, b, t1); if (c < bb) { bb = c; best = t1; } } if (t2 >= 0) { const int c = count_region(ix, a, b, t2); if (c < bb) { bb = c; best = t2; } } }
  *bitsOut = bb; return best; }
/* a region of whole bands [b0, b1): the cheapest table and its bits */
static int region_cost(int PS[15][24], const int *PMX, const int *PES, int b0, int b1, int *tOut) { if (b1 <= b0) { *tOut = 0; return 0; } int mx = 0; for (int b = b0; b < b1; b++) if (PMX[b] > mx) mx = PMX[b];
  if (mx == 0) { *tOut = 0; return 0; } int best = 1 << 30, bt = 0;
  if (mx <= 15) { for (int k = 0; k < 13; k++) { const int t = SMALL_T[k]; if (HTAB[t][0] - 1 < mx) continue; const int c = PS[k][b1] - PS[k][b0]; if (c < best) { best = c; bt = t; } } }
  else { const int need = mx - 15, esc = PES[b1] - PES[b0]; for (int fam = 0; fam < 2; fam++) { int t = -1; for (int u = fam ? 24 : 16; u < (fam ? 32 : 24); u++) if ((1 << HTAB[u][2]) - 1 >= need) { t = u; break; } if (t < 0) continue;
      const int c = PS[13 + fam][b1] - PS[13 + fam][b0] + esc * HTAB[t][2]; if (c < best) { best = c; bt = t; } } }
  *tOut = bt; return best; }
/* the side information a granule/channel needs for its Huffman data */
typedef struct { int big, count1, c1t, tsel[3], r0, r1, part3, gg, sfc, sfscale, preflag, part2, btype, sbg[3]; int sf[22], sfs[3][13]; } GI;
static int quant_bits(GI *g, const int *ix) { /* regions, tables, count1: the Huffman bits of ix (or > 4095 when it cannot be coded) */
  int top = 576; while (top > 0 && ix[top - 1] == 0) top--; top = (top + 1) & ~1; /* pairs */
  int c1 = top; while (c1 >= 4 && ix[c1 - 1] <= 1 && ix[c1 - 2] <= 1 && ix[c1 - 3] <= 1 && ix[c1 - 4] <= 1) c1 -= 4;
  /* count1 quadruples [c1, top4), top4 = c1 + 4·n ≥ top */
  int n4 = 0, ba = 0, bb = 0; for (int i = c1; i < top; i += 4) { const int v = ix[i], w = ix[i + 1], x = i + 2 < 576 ? ix[i + 2] : 0, y = i + 3 < 576 ? ix[i + 3] : 0, q = v * 8 + w * 4 + x * 2 + y, sg = v + w + x + y;
    ba += HLEN[HTAB[32][3] + q] + sg; bb += 4 + sg; n4++; }
  if (c1 + n4 * 4 > 576) { n4--; } /* (cannot happen with top ≤ 576 and 4 | the region) */
  g->count1 = n4; g->c1t = bb < ba ? 1 : 0; int bits = bb < ba ? bb : ba; const int big = c1 / 2; if (big > 288) return 1 << 20; g->big = big;
  if (g->btype != 0) { /* window switching (start, short, stop): region0 = the first 36 lines, region1 = the rest, no region2 */ const int r1s = big * 2 < 36 ? big * 2 : 36; int b0, b1; g->tsel[0] = best_table(ix, 0, r1s, &b0); g->tsel[1] = best_table(ix, r1s, big * 2, &b1); g->tsel[2] = 0; g->r0 = 8; g->r1 = 36; bits += b0 + b1; }
  else { /* the best split of the big values into three regions (region0: 1–16 bands, region1: 1–8 bands), from per-band costs:
       for every table the bits of each band (prefix sums), so a region's cost for a table is one subtraction. The linbits tables
       share their codes within a family (16–23, 24–31): one cost per family plus linbits × the escapes of the region. */
    const int end = big * 2; if (end == 0) { g->r0 = 0; g->r1 = 0; g->tsel[0] = g->tsel[1] = g->tsel[2] = 0; g->part3 = bits; return bits; }
    int nb = 0; while (nb < 22 && sfbL[nb] < end) nb++; /* bands touching the big values (the last may be partial) */
    static int PS[15][24]; static int PMX[24], PES[24]; /* prefix sums per candidate (13 small tables, family 16, family 24), band maxima, escapes */
    for (int k = 0; k < 15; k++) PS[k][0] = 0; PES[0] = 0;
    for (int b = 0; b < nb; b++) { const int a = sfbL[b], z = sfbL[b + 1] < end ? sfbL[b + 1] : end; int mx = 0, esc = 0, c16 = 0, c24 = 0;
      for (int i = a; i < z; i++) { if (ix[i] > mx) mx = ix[i]; if (ix[i] > 14) esc++; }
      for (int i = a; i < z; i += 2) { const int x = ix[i], y = ix[i + 1], xx = x > 15 ? 15 : x, yy = y > 15 ? 15 : y, sg = (x != 0) + (y != 0); c16 += HLEN[HTAB[16][3] + xx * 16 + yy] + sg; c24 += HLEN[HTAB[24][3] + xx * 16 + yy] + sg; }
      for (int k = 0; k < 13; k++) { const int t = SMALL_T[k]; int c = 0; if (HTAB[t][0] - 1 < mx) c = 1 << 22; else for (int i = a; i < z; i += 2) c += HLEN[HTAB[t][3] + ix[i] * HTAB[t][1] + ix[i + 1]] + (ix[i] != 0) + (ix[i + 1] != 0); PS[k][b + 1] = PS[k][b] + c; }
      PS[13][b + 1] = PS[13][b] + c16; PS[14][b + 1] = PS[14][b] + c24; PMX[b] = mx; PES[b + 1] = PES[b] + esc; }
    #define RCOST(A, B, TOUT) region_cost(A, B, TOUT)
    int bestBits = 1 << 30, br0 = 0, br1 = 0, bt[3] = { 0, 0, 0 };
    for (int r0 = 0; r0 < 16; r0++) { const int e0 = r0 + 1 < nb ? r0 + 1 : nb; int t0; const int c0 = region_cost(PS, PMX, PES, 0, e0, &t0); if (c0 >= bestBits) break;
      for (int r1 = 0; r1 < 8; r1++) { const int e1 = r0 + r1 + 2 < nb ? r0 + r1 + 2 : nb; int t1, t2; const int c1b = region_cost(PS, PMX, PES, e0, e1, &t1), c2 = region_cost(PS, PMX, PES, e1, nb, &t2), tot = c0 + c1b + c2;
        if (tot < bestBits) { bestBits = tot; br0 = r0; br1 = r1; bt[0] = t0; bt[1] = t1; bt[2] = t2; } if (e1 >= nb) break; }
      if (e0 >= nb) break; }
    g->r0 = br0; g->r1 = br1; g->tsel[0] = bt[0]; g->tsel[1] = bt[1]; g->tsel[2] = bt[2]; bits += bestBits; }
  g->part3 = bits; return bits; }

/* ---------------- quantization ---------------- */
static void quantize(const double *xr34, int gg, const GI *g, int *ix) { /* ix = nint((|xr|·2^(−(gg−210)/4)·2^(sf·m))^(3/4) − 0.0946) */
  const double base = m_pow(2.0, -0.1875 * (gg - 210)); const double mul = g->sfscale ? 1.0 : 0.5;
  if (g->btype != 2) { for (int b = 0; b < 22; b++) { const double a = b < 21 ? m_pow(2.0, 0.75 * mul * (g->sf[b] + (g->preflag ? PRETAB[b] : 0))) : 1.0, q = base * a;
      for (int i = sfbL[b]; i < sfbL[b + 1]; i++) { const double v = xr34[i] * q; ix[i] = v > 8206 ? 9000 : (int)(v + 0.4054); } } }
  else { int o = 0; for (int sb = 0; sb < 13; sb++) { const int wd = sfbS[sb + 1] - sfbS[sb]; for (int w = 0; w < 3; w++) { const double a = m_pow(2.0, 0.75 * (mul * (sb < 12 ? g->sfs[w][sb] : 0) + 2.0 * g->sbg[w])), q = base * a;
        for (int i = 0; i < wd; i++, o++) { const double v = xr34[o] * q; ix[o] = v > 8206 ? 9000 : (int)(v + 0.4054); } } } } }
static int over_max(const int *ix) { for (int i = 0; i < 576; i++) if (ix[i] > 8206) return 1; return 0; }
/* the inner loop: the smallest global gain whose bits fit */
static int fits(const double *xr34, GI *g, int gg, int maxbits, int *ix) { g->gg = gg; quantize(xr34, gg, g, ix); return !over_max(ix) && quant_bits(g, ix) <= maxbits; }
static int inner(const double *xr34, GI *g, int maxbits, int *ix, int start) { /* from a starting guess, step to the smallest gain that fits (a few evaluations when the guess is near) */
  int gg = start < 0 ? 0 : start > 255 ? 255 : start, step = 4;
  if (fits(xr34, g, gg, maxbits, ix)) { while (gg > 0) { const int t = gg - step < 0 ? 0 : gg - step; if (fits(xr34, g, t, maxbits, ix)) { gg = t; step *= 2; } else break; }
    for (int s2 = step / 2; s2 >= 1; s2 /= 2) { const int t = gg - s2; if (t >= 0 && fits(xr34, g, t, maxbits, ix)) gg = t; } }
  else { int lo = gg; while (gg < 255) { gg = gg + step > 255 ? 255 : gg + step; if (fits(xr34, g, gg, maxbits, ix)) break; lo = gg; step *= 2; }
    int hi = gg; while (hi - lo > 1) { const int mid = (lo + hi) >> 1; if (fits(xr34, g, mid, maxbits, ix)) hi = mid; else lo = mid; } gg = hi; }
  g->gg = gg; quantize(xr34, gg, g, ix); quant_bits(g, ix); return g->part3; }
/* noise per band against its allowed noise: returns the number of bands over, fills over[b] */
static double noise_check(const double *xr, const int *ix, const GI *g, int *over, double *sumOver) {
  const double step = m_pow(2.0, 0.25 * (g->gg - 210)), mul = g->sfscale ? 1.0 : 0.5; int n = 0; double so = 0;
  if (g->btype != 2) { for (int b = 0; b < 21; b++) { const double s = step * m_pow(2.0, -mul * (g->sf[b] + (g->preflag ? PRETAB[b] : 0))); double e = 0;
      for (int i = sfbL[b]; i < sfbL[b + 1]; i++) { const double d = fabs_(xr[i]) - (ix[i] < 8207 ? POW43[ix[i]] : 0) * s; e += d * d; }
      over[b] = e > THR[b] ? 1 : 0; if (over[b]) { n++; so += m_log(e / THR[b]); } } }
  else { int o = 0; for (int sb = 0; sb < 13; sb++) { const int wd = sfbS[sb + 1] - sfbS[sb]; for (int w = 0; w < 3; w++) { const double s = step * m_pow(2.0, -(mul * (sb < 12 ? g->sfs[w][sb] : 0) + 2.0 * g->sbg[w])); double e = 0;
        for (int i = 0; i < wd; i++, o++) { const double d = fabs_(xr[o]) - (ix[o] < 8207 ? POW43[ix[o]] : 0) * s; e += d * d; }
        if (sb < 12) { const int k = w * 13 + sb; over[k] = e > THRS[w][sb] ? 1 : 0; if (over[k]) { n++; so += m_log(e / THRS[w][sb]); } } } } }
  *sumOver = so; return n; }
static int part2_bits(GI *g) { /* choose scalefac_compress for the scalefactors; −1 if they do not fit */
  int m1 = 0, m2 = 0; if (g->btype != 2) { for (int b = 0; b < 11; b++) if (g->sf[b] > m1) m1 = g->sf[b]; for (int b = 11; b < 21; b++) if (g->sf[b] > m2) m2 = g->sf[b]; }
  else { for (int w = 0; w < 3; w++) { for (int b = 0; b < 6; b++) if (g->sfs[w][b] > m1) m1 = g->sfs[w][b]; for (int b = 6; b < 12; b++) if (g->sfs[w][b] > m2) m2 = g->sfs[w][b]; } }
  int best = -1, bb = 1 << 30; for (int c = 0; c < 16; c++) { if (m1 >= (1 << SLEN1[c]) || m2 >= (1 << SLEN2[c])) continue; const int bits = g->btype != 2 ? 11 * SLEN1[c] + 10 * SLEN2[c] : 18 * SLEN1[c] + 18 * SLEN2[c]; if (bits < bb) { bb = bits; best = c; } }
  if (best < 0) return -1; g->sfc = best; g->part2 = bb; return bb; }
/* the outer loop: amplify the bands whose noise is over their threshold, re-fit the bits, keep the best result */
static int BEST_IX[576], LASTGG[2] = { 150, 150 };
static void outer(const double *xr, GI *g, int maxbits) {
  for (int i = 0; i < 576; i++) { XRA[i] = fabs_(xr[i]); XR34[i] = m_sqrt(XRA[i] * m_sqrt(XRA[i])); }
  for (int b = 0; b < 22; b++) g->sf[b] = 0; for (int w = 0; w < 3; w++) { g->sbg[w] = 0; for (int b = 0; b < 13; b++) g->sfs[w][b] = 0; } g->preflag = 0; g->sfscale = 0;
  part2_bits(g); inner(XR34, g, maxbits - g->part2, IX, LASTGG[g->btype == 2]); int over[39]; double so; int nOver = noise_check(xr, IX, g, over, &so);
  GI best = *g; int bestN = nOver; double bestSo = so; for (int i = 0; i < 576; i++) BEST_IX[i] = IX[i];
#ifdef NOOUTER
  nOver = 0;
#endif
  for (int it = 0; it < 12 && nOver > 0; it++) { int any = 0;
    if (g->btype != 2) { for (int b = 0; b < 21; b++) if (over[b]) { g->sf[b]++; any = 1; } }
    else for (int w = 0; w < 3; w++) for (int b = 0; b < 12; b++) if (over[w * 13 + b]) { g->sfs[w][b]++; any = 1; }
    if (!any) break; if (part2_bits(g) < 0) { if (!g->sfscale) { g->sfscale = 1; /* coarser steps: halve the scalefactors (rounded up) */ for (int b = 0; b < 21; b++) g->sf[b] = (g->sf[b] + 1) >> 1; for (int w = 0; w < 3; w++) for (int b = 0; b < 12; b++) g->sfs[w][b] = (g->sfs[w][b] + 1) >> 1; if (part2_bits(g) < 0) break; } else break; }
    inner(XR34, g, maxbits - g->part2, IX, g->gg); nOver = noise_check(xr, IX, g, over, &so);
    if (nOver < bestN || (nOver == bestN && so < bestSo)) { best = *g; bestN = nOver; bestSo = so; for (int i = 0; i < 576; i++) BEST_IX[i] = IX[i]; } }
  *g = best; for (int i = 0; i < 576; i++) IX[i] = BEST_IX[i]; LASTGG[g->btype == 2] = g->gg; }

/* ---------------- the frame ---------------- */
static int SIGN[2][2][576];
static void put_sf_and_huff(int gr, int ch, const GI *g, const int *ix, const int *sg) { bw_buf = GBUF[gr][ch]; bw_pos = 0;
  if (g->btype != 2) { for (int b = 0; b < 11; b++) bw_put(g->sf[b], SLEN1[g->sfc]); for (int b = 11; b < 21; b++) bw_put(g->sf[b], SLEN2[g->sfc]); }
  else { for (int b = 0; b < 12; b++) for (int w = 0; w < 3; w++) bw_put(g->sfs[w][b], b < 6 ? SLEN1[g->sfc] : SLEN2[g->sfc]); }
  const int end = g->big * 2; int a1, a2;
  if (g->btype != 0) { a1 = 36 < end ? 36 : end; a2 = end; } else { a1 = sfbL[g->r0 + 1] < end ? sfbL[g->r0 + 1] : end; const int bi = g->r0 + g->r1 + 2; a2 = bi <= 22 && sfbL[bi] < end ? sfbL[bi] : end; }
  for (int i = 0; i < end; i += 2) { const int t = i < a1 ? g->tsel[0] : i < a2 ? g->tsel[1] : g->tsel[2]; if (t == 0) continue; const int *h = HTAB[t]; const int lb = h[2];
    int x = ix[i], y = ix[i + 1], xx = x, yy = y; if (lb || h[0] == 16) { if (xx > 14) xx = 15; if (yy > 14) yy = 15; }
    const int k = h[3] + xx * h[1] + yy; bw_put(HCODE[k], HLEN[k]);
    if (xx == 15 && (lb || h[0] == 16)) bw_put(x - 15, lb); if (x) bw_put(sg[i], 1); if (yy == 15 && (lb || h[0] == 16)) bw_put(y - 15, lb); if (y) bw_put(sg[i + 1], 1); }
  for (int q = 0, i = end; q < g->count1; q++, i += 4) { const int v = ix[i], w = ix[i + 1], x = ix[i + 2], y = ix[i + 3], c = v * 8 + w * 4 + x * 2 + y;
    if (g->c1t) bw_put(15 - c, 4); else bw_put(HCODE[HTAB[32][3] + c], HLEN[HTAB[32][3] + c]);
    if (v) bw_put(sg[i], 1); if (w) bw_put(sg[i + 1], 1); if (x) bw_put(sg[i + 2], 1); if (y) bw_put(sg[i + 3], 1); }
  GBITS[gr][ch] = bw_pos; }
static void flush_queue(int all) { /* frames whose payload is complete go to OUT */
  int k = 0; for (; k < QN; k++) { const long pend = Q[k].s + Q[k].p; if (!all && !(pend <= E_END && pend <= S_NEXT - 511)) break;
    for (int i = 0; i < Q[k].hsn; i++) OUT[OUTN++] = Q[k].hs[i];
    for (long i = Q[k].s; i < pend; i++) OUT[OUTN++] = i < E_END ? MSTREAM[(i - MBASE) & 16383] : 0; }
  for (int i = k; i < QN; i++) Q[i - k] = Q[i]; QN -= k; }
static GI GIS[2][2];
static void encode_frame(long G0) { /* the two granules G0, G0 + 1 (their look-ahead G0 + 2 is analysed) */
  const int nch = NCH;
  /* block types: short where a granule or the one before it has an attack; start before and stop after a run of shorts (both channels alike) */
  for (int gr = 0; gr < 2; gr++) { const long G = G0 + gr; const int sh = ATKF[G & 7] || ATKF[(G + 7) & 7], shNext = ATKF[(G + 1) & 7] || ATKF[G & 7];
    int t = sh ? 2 : 0; const int prev = gr == 0 ? PREVTYPE[0] : BTYPE[0][0];
    if (t == 0 && shNext) t = (prev == 2) ? 2 : 1; else if (t == 0 && prev == 2) t = 3; else if (t == 0 && prev == 1) t = 2; /* (a start is always followed by a short) */
    if (t == 2 && prev == 0) t = 1; /* (nor can a long jump straight into a short: a start first) */ if (t == 2 && prev == 3) t = 1;
#ifdef FORCESHORT
    t = 2;
#endif
    for (int ch = 0; ch < nch; ch++) BTYPE[gr][ch] = t; }
  PREVTYPE[0] = BTYPE[1][0];
  for (int gr = 0; gr < 2; gr++) for (int ch = 0; ch < nch; ch++) hybrid(ch, G0 + gr, gr, BTYPE[gr][ch]);
  /* mid/side: when the channels are alike enough that the side carries little */
  int ms = 0; if (MODE == 1) { double el = 0, er = 0, es = 0, em = 0; for (int gr = 0; gr < 2; gr++) for (int i = 0; i < 576; i++) { const double l = XR[gr][0][i], r = XR[gr][1][i]; el += l * l; er += r * r; em += (l + r) * (l + r); es += (l - r) * (l - r); }
    ms = es < 0.35 * em; if (ms) for (int gr = 0; gr < 2; gr++) for (int i = 0; i < 576; i++) { const double l = XR[gr][0][i], r = XR[gr][1][i]; XR[gr][0][i] = (l + r) * 0.70710678118654752; XR[gr][1][i] = (l - r) * 0.70710678118654752; } }
  /* the frame's size and its main-data budget */
  const long rest = (144000L * KBPS) % SR; int pad = 0; if (rest) { SLOT_LAG += (int)rest; if (SLOT_LAG >= SR) { SLOT_LAG -= SR; pad = 1; } }
  const int fbytes = (int)(144000L * KBPS / SR) + pad, side = nch == 1 ? 17 : 32, P = fbytes - 4 - side; const long S = S_NEXT;
  long M = E_END > S - 511 ? E_END : S - 511; if (M > S) M = S; /* (the main data may begin up to 511 bytes back) */
  const long avail = (S + P - M) * 8, mean = (long)P * 8;
  double pe[2][2], peT = 0; for (int gr = 0; gr < 2; gr++) for (int ch = 0; ch < nch; ch++) { pe[gr][ch] = psy(XR[gr][ch], BTYPE[gr][ch]) + 50; peT += pe[gr][ch]; }
  PE_AVG = PE_AVG ? PE_AVG * 0.95 + peT * 0.05 : peT; const double dem = peT / (PE_AVG + 1e-9);
  long target = mean + (long)((avail - mean) * (dem > 1.6 ? 1.0 : dem > 1 ? (dem - 1) / 0.6 : 0)); if (target < mean) target = mean; if (target > avail) target = avail;
  { const long waste = (S + P) - 511 - M; if (waste > 0 && target < waste * 8 + 64 && avail > waste * 8) target = waste * 8 + 64 < avail ? waste * 8 + 64 : avail; } /* (bits the reservoir cannot hold are spent now) */
  long left = target; double peLeft = peT;
  for (int gr = 0; gr < 2; gr++) for (int ch = 0; ch < nch; ch++) { GI *g = &GIS[gr][ch]; g->btype = BTYPE[gr][ch];
    psy(XR[gr][ch], g->btype); long mx = (long)(left * pe[gr][ch] / peLeft); if (mx > 4095) mx = 4095; if (mx < 0) mx = 0;
    outer(XR[gr][ch], g, (int)mx); const int used = g->part2 + g->part3; left -= used; peLeft -= pe[gr][ch]; if (peLeft < 1) peLeft = 1;
    for (int i = 0; i < 576; i++) SIGN[gr][ch][i] = XR[gr][ch][i] < 0; put_sf_and_huff(gr, ch, g, IX, SIGN[gr][ch]); }
  /* header + side information */
  unsigned char hs[36]; bw_buf = hs; bw_pos = 0;
  bw_put(0xFFF, 12); bw_put(1, 1); bw_put(1, 2); bw_put(1, 1); bw_put(BRI, 4); bw_put(SRI, 2); bw_put(pad, 1); bw_put(0, 1); bw_put(MODE, 2); bw_put(ms ? 2 : 0, 2); bw_put(0, 1); bw_put(1, 1); bw_put(0, 2);
  bw_put((unsigned)(S - M), 9); bw_put(0, nch == 1 ? 5 : 3); for (int ch = 0; ch < nch; ch++) bw_put(0, 4);
  for (int gr = 0; gr < 2; gr++) for (int ch = 0; ch < nch; ch++) { const GI *g = &GIS[gr][ch];
    bw_put(GBITS[gr][ch], 12); bw_put(g->big, 9); bw_put(g->gg, 8); bw_put(g->sfc, 4);
    if (g->btype != 0) { bw_put(1, 1); bw_put(g->btype, 2); bw_put(0, 1); bw_put(g->tsel[0], 5); bw_put(g->tsel[1], 5); for (int w = 0; w < 3; w++) bw_put(g->btype == 2 ? g->sbg[w] : 0, 3); }
    else { bw_put(0, 1); for (int r = 0; r < 3; r++) bw_put(g->tsel[r], 5); bw_put(g->r0, 4); bw_put(g->r1, 3); }
    bw_put(g->preflag, 1); bw_put(g->sfscale, 1); bw_put(g->c1t, 1); }
  /* main data into the stream, from M: the granules' bits back to back, then byte-aligned */
  for (long i = E_END; i < M; i++) MSTREAM[(i - MBASE) & 16383] = 0;
  { static unsigned char md[8192]; bw_buf = md; bw_pos = 0; for (int gr = 0; gr < 2; gr++) for (int ch = 0; ch < nch; ch++) { const unsigned char *gb = GBUF[gr][ch]; const long n = GBITS[gr][ch];
      for (long k = 0; k + 8 <= n; k += 8) bw_put(gb[k >> 3], 8); if (n & 7) bw_put(gb[n >> 3] >> (8 - (n & 7)), (int)(n & 7)); }
    const long nb = (bw_pos + 7) >> 3; for (long i = 0; i < nb; i++) MSTREAM[(M + i - MBASE) & 16383] = md[i]; E_END = M + nb; }
  if (QN < MAXQ) { for (int i = 0; i < 4 + side; i++) Q[QN].hs[i] = hs[i]; Q[QN].hsn = 4 + side; Q[QN].s = S; Q[QN].p = P; QN++; }
  S_NEXT = S + P; FRAMES++; flush_queue(0); }
/* one call per 1152 samples per channel (INBUF): analyses this frame, encodes the previous one (one frame of look-ahead for the
   block switching). Returns the bytes now in OUT (taken by the caller, which then calls mp3_take). */
EXPORT("mp3_encode") int mp3_encode(void) {
  for (int gr = 0; gr < 2; gr++) { const long G = GRN + gr; int a = 0; for (int ch = 0; ch < NCH; ch++) { polyphase(ch, INBUF[ch] + gr * 576, (int)(G & 7)); a |= attack(ch, (int)(G & 7)); } ATKF[G & 7] = a; }
  if (GRN >= 2) encode_frame(GRN - 2);
  GRN += 2; return OUTN; }
EXPORT("mp3_take") void mp3_take(void) { OUTN = 0; }
EXPORT("mp3_flush") int mp3_flush(void) { for (int ch = 0; ch < 2; ch++) for (int i = 0; i < 1152; i++) INBUF[ch][i] = 0; mp3_encode(); flush_queue(1); return OUTN; }
EXPORT("mp3_frames") int mp3_frames(void) { return (int)FRAMES; }
#ifdef NATIVE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
/* test harness: mp3enc in.wav out.mp3 [kbps] [mode]  (16-bit PCM WAV) */
int main(int argc, char **argv) { if (argc < 3) return 1; FILE *f = fopen(argv[1], "rb"); if (!f) return 2; unsigned char h[44]; if (fread(h, 1, 44, f) != 44) return 3;
  const int nch = h[22], sr = h[24] | h[25] << 8 | h[26] << 16 | h[27] << 24; const int kbps = argc > 3 ? atoi(argv[3]) : 320, mode = argc > 4 ? atoi(argv[4]) : 1;
  if (mp3_init(sr, nch, kbps, mode)) return 4; FILE *o = fopen(argv[2], "wb"); short buf[1152 * 2];
  for (;;) { const size_t n = fread(buf, 2 * nch, 1152, f); if (!n) break; for (int i = 0; i < 1152; i++) for (int c = 0; c < nch; c++) INBUF[c][i] = i < (int)n ? buf[i * nch + c] / 32768.0f : 0;
    if (nch == 1) for (int i = 0; i < 1152; i++) INBUF[1][i] = INBUF[0][i]; const int k = mp3_encode(); fwrite(OUT, 1, k, o); mp3_take(); }
  const int k = mp3_flush(); fwrite(OUT, 1, k, o); fclose(o); fclose(f); fprintf(stderr, "%ld frames\n", FRAMES); return 0; }
#endif
