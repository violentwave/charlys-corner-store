// Garment view definitions: original vector drawings, flat-lay, neutral (no theme styling).
// Coordinates are template pixels. Apparel views are 1000×1200; the hat is 1000×800.
// zones: first entry must be the base zone with value null (= silhouette minus other zones).

/** Mirror helper for symmetric parts: x → W - x on every "x y" pair of a path. */
export function mirror(d, W = 1000) {
  return d.replace(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g, (_, x, y) => `${+(W - +x).toFixed(1)} ${y}`);
}
/** Scale a whole view around x=cx (and shift y) so proportions can be tuned without redrawing. */
export function scaleView(view, { sx = 1, sy = 1, cx = 500, ty = 0 }) {
  const t = (d) =>
    d.replace(
      /(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g,
      (_, x, y) => `${+(cx + (+x - cx) * sx).toFixed(1)} ${+(+y * sy + ty).toFixed(1)}`,
    );
  const mapEl = (e) => ({
    ...e,
    ...(e.d ? { d: t(e.d) } : {}),
    ...(e.cx !== undefined ? { cx: cx + (e.cx - cx) * sx, cy: e.cy * sy + ty } : {}),
  });
  return {
    ...view,
    silhouette: t(view.silhouette),
    zones: Object.fromEntries(Object.entries(view.zones).map(([k, v]) => [k, v === null ? null : t(v)])),
    shade: (view.shade ?? []).map(mapEl),
    highlight: (view.highlight ?? []).map(mapEl),
  };
}

const both = (d, extra = {}) => [
  { d, ...extra },
  { d: mirror(d), ...extra },
];
const sym = (kind, d, extra = {}) => both(d, extra).map((e) => ({ kind, ...e }));

// ---------------------------------------------------------------- T-SHIRT
const TEE_BODY = `
  C 662 128 718 142 772 160
  C 832 212 886 292 918 352
  L 812 424
  C 790 404 762 384 742 376
  C 734 600 740 850 748 1086
  C 580 1104 420 1104 252 1086
  C 260 850 266 600 258 376
  C 238 384 210 404 188 424
  L 82 352
  C 114 292 168 212 228 160
  C 282 142 338 128 392 112`;

const teeShared = [
  ...sym("seam", "M 772 160 C 752 232 744 300 742 376"), // set-in sleeve seams
  ...sym("stitch", "M 904 338 L 801 404"), // sleeve hem coverstitch
  ...sym("stitch", "M 896 326 L 794 392", { o: 0.22 }),
  { kind: "stitch", d: "M 256 1064 C 420 1082 580 1082 744 1064" }, // body hem
  { kind: "stitch", d: "M 255 1052 C 420 1070 580 1070 745 1052", o: 0.2 },
  ...sym("fold", "M 744 394 C 700 424 662 456 628 506", { o: 0.16 }), // underarm drape
  ...sym("fold", "M 738 470 C 700 492 672 520 650 560", { o: 0.09, w: 12 }),
  ...sym("fold", "M 800 232 C 828 268 848 300 862 338", { o: 0.12, w: 12 }), // sleeve
  ...sym("crease", "M 786 300 C 812 330 830 360 836 392", { o: 0.12 }),
  { kind: "tone", d: "M 560 600 C 600 700 590 900 620 1060 L 680 1060 C 660 880 650 700 600 580 Z", o: 0.05 },
  { kind: "fold", d: "M 300 1046 C 360 1026 420 1060 470 1038", o: 0.1, w: 10 },
  { kind: "fold", d: "M 560 1050 C 610 1030 660 1060 700 1044", o: 0.08, w: 10 },
];
const teeHighlights = [
  ...both("M 900 340 L 797 406", { o: 0.35, w: 2.5, sharp: true }), // sleeve hem edges catch light
  ...both("M 772 166 C 754 236 748 300 746 372", { o: 0.3, w: 2.5, sharp: true }), // beside sleeve seams
  { d: "M 258 1074 C 420 1092 580 1092 742 1074", o: 0.3, w: 2.5, sharp: true },
  { d: "M 640 300 C 620 420 620 620 636 900", o: 0.14, w: 90 },
  { d: "M 360 320 C 380 430 380 650 364 900", o: 0.12, w: 90 },
  ...both("M 812 214 C 846 252 872 292 888 324", { o: 0.45, w: 14 }),
  { d: "M 500 420 C 505 600 498 800 502 1000", o: 0.18, w: 60 },
];

const tshirtFront = {
  width: 1000,
  height: 1200,
  silhouette: `M 392 112 C 430 96 570 96 608 112 ${TEE_BODY} Z`,
  zones: { body: null },
  shade: [
    { kind: "inner", d: "M 406 112 C 436 168 564 168 594 112 C 560 102 440 102 406 112 Z", o: 0.4 },
    { kind: "rib", d: "M 392 112 C 430 96 570 96 608 112 C 570 106 430 106 392 112 Z", o: 0.14 },
    { kind: "rib", d: "M 392 112 C 420 192 580 192 608 112 L 594 110 C 566 166 434 166 406 110 Z", o: 0.12 },
    { kind: "crease", d: "M 406 111 C 434 166 566 166 594 111", o: 0.28, w: 3 },
    { kind: "seam", d: "M 392 112 C 420 192 580 192 608 112" },
    { kind: "stitch", d: "M 388 120 C 416 204 584 204 612 120" },
    { kind: "fold", d: "M 432 212 C 470 238 530 238 568 212", o: 0.09, w: 20 },
    ...teeShared,
  ],
  highlight: [
    ...teeHighlights,
    { d: "M 424 150 C 452 184 548 184 576 150", o: 0.3, w: 5, sharp: true },
    { d: "M 396 118 C 424 198 576 198 604 118", o: 0.35, w: 2.5, sharp: true },
    { d: "M 400 108 C 436 96 564 96 600 108", o: 0.35, w: 2.5, sharp: true },
  ],
};

const tshirtBack = {
  width: 1000,
  height: 1200,
  silhouette: `M 392 112 C 432 128 568 128 608 112 ${TEE_BODY} Z`,
  zones: { body: null },
  shade: [
    { kind: "rib", d: "M 392 112 C 432 128 568 128 608 112 L 604 130 C 566 146 434 146 396 130 Z", o: 0.12 },
    { kind: "seam", d: "M 396 130 C 434 146 566 146 604 130" },
    { kind: "stitch", d: "M 394 140 C 434 156 566 156 606 140" },
    { kind: "fold", d: "M 330 300 C 420 334 580 334 670 300", o: 0.07, w: 34 },
    ...teeShared,
  ],
  highlight: [...teeHighlights, { d: "M 398 134 C 436 150 564 150 602 134", o: 0.35, w: 2.5, sharp: true }],
};

// ---------------------------------------------------------------- LONG SLEEVE TEE (Gildan 5400: rib cuffs)
// Same crew body as the tee; long sleeves ≈0.37× body width once LS_FIT narrows the view.
const LS_BODY = `
  C 662 128 718 142 772 160
  C 880 210 950 560 962 960
  L 966 1052 L 812 1068 L 806 970
  C 800 700 780 520 742 376
  C 734 600 740 850 748 1086
  C 580 1104 420 1104 252 1086
  C 260 850 266 600 258 376
  C 220 520 200 700 194 970
  L 188 1068 L 34 1052 L 38 960
  C 50 560 120 210 228 160
  C 282 142 338 128 392 112`;
const lsShared = [
  ...sym("seam", "M 772 160 C 760 240 750 310 742 376"),
  ...sym("rib", "M 962 960 L 966 1052 L 812 1068 L 806 970 Z", { o: 0.12 }),
  ...sym("seam", "M 962 960 L 806 970"),
  ...sym("fold", "M 842 300 C 890 420 918 560 930 720", { o: 0.12, w: 18 }),
  ...sym("crease", "M 810 880 C 860 866 912 868 958 880", { o: 0.13 }),
  ...sym("crease", "M 808 920 C 858 908 912 910 960 920", { o: 0.11 }),
  ...sym("fold", "M 744 394 C 700 424 662 456 628 506", { o: 0.16 }),
  { kind: "stitch", d: "M 256 1064 C 420 1082 580 1082 744 1064" },
  { kind: "stitch", d: "M 255 1052 C 420 1070 580 1070 745 1052", o: 0.2 },
  { kind: "tone", d: "M 560 600 C 600 700 590 900 620 1060 L 680 1060 C 660 880 650 700 600 580 Z", o: 0.05 },
  { kind: "fold", d: "M 300 1046 C 360 1026 420 1060 470 1038", o: 0.1, w: 10 },
];
const lsHighlights = [
  ...both("M 812 210 C 880 300 920 460 940 640", { o: 0.4, w: 22 }),
  { d: "M 640 300 C 620 420 620 620 636 900", o: 0.14, w: 90 },
  { d: "M 360 320 C 380 430 380 650 364 900", o: 0.12, w: 90 },
  { d: "M 258 1074 C 420 1092 580 1092 742 1074", o: 0.3, w: 2.5, sharp: true },
];
const longsleeveFront = {
  width: 1000,
  height: 1200,
  silhouette: `M 392 112 C 430 96 570 96 608 112 ${LS_BODY} Z`,
  zones: { body: null },
  shade: [
    { kind: "inner", d: "M 406 112 C 436 168 564 168 594 112 C 560 102 440 102 406 112 Z", o: 0.4 },
    { kind: "rib", d: "M 392 112 C 420 192 580 192 608 112 L 594 110 C 566 166 434 166 406 110 Z", o: 0.12 },
    { kind: "seam", d: "M 392 112 C 420 192 580 192 608 112" },
    { kind: "stitch", d: "M 388 120 C 416 204 584 204 612 120" },
    ...lsShared,
  ],
  highlight: [...lsHighlights, { d: "M 396 118 C 424 198 576 198 604 118", o: 0.35, w: 2.5, sharp: true }],
};
const longsleeveBack = {
  width: 1000,
  height: 1200,
  silhouette: `M 392 112 C 432 128 568 128 608 112 ${LS_BODY} Z`,
  zones: { body: null },
  shade: [
    { kind: "rib", d: "M 392 112 C 432 128 568 128 608 112 L 604 130 C 566 146 434 146 396 130 Z", o: 0.12 },
    { kind: "seam", d: "M 396 130 C 434 146 566 146 604 130" },
    { kind: "fold", d: "M 330 300 C 420 334 580 334 670 300", o: 0.07, w: 34 },
    ...lsShared,
  ],
  highlight: [...lsHighlights, { d: "M 398 134 C 436 150 564 150 602 134", o: 0.35, w: 2.5, sharp: true }],
};

// ---------------------------------------------------------------- SLEEVE VIEWS (left / right, laid flat)
// One sleeve, shoulder at the top, cuff at the bottom: where sleeve prints go. `right` is the
// wearer's right sleeve; `left` is its mirror. Zone = the color the sleeve takes on the garment.
function sleeveView({ zone, path, cuff, shade = [], highlight = [] }) {
  return {
    width: 1000,
    height: 1200,
    silhouette: path,
    zones: { [zone]: null },
    shade: [
      ...(cuff
        ? [
            { kind: "rib", d: cuff, o: 0.12 },
            { kind: "seam", d: cuff.split(" L ")[0] + " L " + cuff.split(" L ")[1] },
          ]
        : []),
      { kind: "fold", d: "M 330 300 C 350 560 380 800 410 1000", o: 0.08, w: 40 },
      { kind: "fold", d: "M 680 300 C 660 560 630 800 600 1000", o: 0.1, w: 40 },
      ...shade,
    ],
    highlight: [{ d: "M 520 180 C 520 500 512 800 504 1020", o: 0.22, w: 120 }, ...highlight],
  };
}
const mirrorView = (v) => ({
  ...v,
  silhouette: mirror(v.silhouette),
  zones: Object.fromEntries(Object.entries(v.zones).map(([k, d]) => [k, d && mirror(d)])),
  shade: v.shade.map((e) => (e.d ? { ...e, d: mirror(e.d) } : e)),
  highlight: v.highlight.map((e) => ({ ...e, d: mirror(e.d) })),
});
const LONG_SLEEVE_PATH =
  "M 290 160 C 380 104 620 104 710 160 C 692 470 652 800 618 1040 L 620 1140 L 380 1140 L 382 1040 C 348 800 308 470 290 160 Z";
const LONG_CUFF = "M 618 1040 L 382 1040 L 380 1140 L 620 1140 Z";
const longSleeveRight = sleeveView({
  zone: "body",
  path: LONG_SLEEVE_PATH,
  cuff: LONG_CUFF,
  shade: [
    { kind: "seam", d: "M 290 160 C 380 104 620 104 710 160", o: 0.35 },
    { kind: "crease", d: "M 400 980 C 460 968 540 968 604 980", o: 0.13 },
    { kind: "crease", d: "M 396 1012 C 460 1000 540 1000 608 1012", o: 0.11 },
  ],
});
const hoodieSleeveRight = sleeveView({
  zone: "body",
  path: "M 270 160 C 370 100 630 100 730 160 C 712 470 668 800 630 1030 L 634 1150 L 366 1150 L 370 1030 C 332 800 288 470 270 160 Z",
  cuff: "M 630 1030 L 370 1030 L 366 1150 L 634 1150 Z",
  shade: [
    { kind: "seam", d: "M 270 160 C 370 100 630 100 730 160", o: 0.35 },
    { kind: "crease", d: "M 390 960 C 460 946 540 946 616 960", o: 0.14 },
    { kind: "crease", d: "M 386 996 C 460 982 540 982 620 996", o: 0.12 },
  ],
});
// 3/4 raglan sleeve: the slanted raglan seam runs up toward the neck.
const raglanSleeveRight = sleeveView({
  zone: "sleeves",
  path: "M 290 300 L 640 110 C 690 120 720 160 724 210 C 708 470 676 690 646 860 L 648 940 L 382 940 L 384 860 C 346 690 312 500 290 300 Z",
  cuff: "M 646 860 L 384 860 L 382 940 L 648 940 Z",
  shade: [{ kind: "seam", d: "M 290 300 L 640 110", o: 0.35 }],
});

// ---------------------------------------------------------------- POLO (tee body + knit collar, placket, rib cuffs)
const poloCuffs = [
  ...sym("rib", "M 918 352 L 812 424 L 794 396 L 898 326 Z", { o: 0.12 }),
  ...sym("seam", "M 898 326 L 794 396"),
];
const poloFront = {
  width: 1000,
  height: 1200,
  silhouette: `M 392 112 C 430 92 570 92 608 112 ${TEE_BODY} Z`,
  zones: { body: null },
  shade: [
    // collar stand at the back of the neck (inside), then the two collar leaves
    { kind: "inner", d: "M 404 118 C 440 104 560 104 596 118 L 560 150 C 530 142 470 142 440 150 Z", o: 0.3 },
    { kind: "rib", d: "M 392 112 C 430 92 570 92 608 112 L 600 124 C 564 108 436 108 400 124 Z", o: 0.1 },
    // collar leaves: shadow cast on the body just outside them, then their outline + edge stitching
    ...sym("tone", "M 392 112 C 392 170 414 236 452 286 L 500 206 L 504 236 L 456 310 C 404 250 378 180 380 112 Z", {
      o: 0.22,
    }),
    ...sym("seam", "M 392 112 C 392 170 414 236 452 286 L 500 206", { o: 0.42 }),
    ...sym("stitch", "M 402 118 C 402 172 422 230 454 270", { o: 0.28 }),
    ...sym("tone", "M 404 122 C 430 150 470 176 500 206 L 492 220 C 460 190 424 162 400 134 Z", { o: 0.1 }),
    // placket
    { kind: "seam", d: "M 476 198 L 476 430 L 524 430 L 524 198" },
    { kind: "stitch", d: "M 484 206 L 484 422 L 516 422 L 516 206", o: 0.25 },
    { kind: "crease", d: "M 500 200 L 500 430", o: 0.18, w: 2 },
    { kind: "button", cx: 500, cy: 262, r: 10 },
    { kind: "button", cx: 500, cy: 326, r: 10 },
    { kind: "button", cx: 500, cy: 390, r: 10 },
    ...poloCuffs,
    ...teeShared.filter((e) => e.kind !== "stitch" || !/^M (904|896|96|104) /.test(e.d)),
    ...sym("seam", "M 748 1086 L 746 1036", { o: 0.35 }), // side vents
  ],
  highlight: [
    ...teeHighlights,
    ...both("M 398 118 C 398 172 420 232 454 280", { o: 0.35, w: 3, sharp: true }),
    ...both("M 420 140 C 440 190 460 230 480 240", { o: 0.25, w: 20 }),
  ],
};
const poloBack = {
  width: 1000,
  height: 1200,
  silhouette: `M 392 112 C 432 100 568 100 608 112 ${TEE_BODY} Z`,
  zones: { body: null },
  shade: [
    { kind: "rib", d: "M 392 112 C 432 100 568 100 608 112 L 606 150 C 566 140 434 140 394 150 Z", o: 0.12 },
    { kind: "edge", d: "M 394 150 C 434 140 566 140 606 150", o: 0.22, w: 26 },
    { kind: "seam", d: "M 394 150 C 434 140 566 140 606 150" },
    { kind: "fold", d: "M 330 300 C 420 334 580 334 670 300", o: 0.07, w: 34 },
    ...poloCuffs,
    ...teeShared.filter((e) => e.kind !== "stitch" || !/^M (904|896|96|104) /.test(e.d)),
    ...sym("seam", "M 748 1086 L 746 1036", { o: 0.35 }),
  ],
  highlight: [...teeHighlights, { d: "M 398 146 C 436 136 564 136 602 146", o: 0.35, w: 2.5, sharp: true }],
};

// ---------------------------------------------------------------- RAGLAN (3/4 sleeve baseball tee)
const RAGLAN_RIGHT = `C 660 178 760 196 840 226 C 930 330 990 480 1012 660 L 862 724 C 836 600 806 500 772 454
  C 766 640 770 850 776 1012 C 600 1030 400 1030 224 1012 C 230 850 234 640 228 454
  C 194 500 164 600 138 724 L -12 660 C 10 480 70 330 160 226 C 240 196 340 178 420 160`;
const raglanSleeve = (neckStart) =>
  `M ${neckStart} C 640 270 720 370 772 454 C 806 500 836 600 862 724 L 1012 660 C 990 480 930 330 840 226 C 760 196 660 178 580 160 Z`;
const raglanShared = [
  ...sym("rib", "M 1012 660 L 862 724 L 854 690 L 1004 626 Z", { o: 0.12 }),
  ...sym("seam", "M 1004 626 L 854 690"),
  ...sym("fold", "M 830 500 C 860 560 884 620 898 690", { o: 0.11, w: 16 }),
  ...sym("fold", "M 820 300 C 880 370 924 450 950 530", { o: 0.1, w: 18 }),
  ...sym("crease", "M 860 600 C 910 584 960 586 996 600", { o: 0.12 }),
  ...sym("fold", "M 772 470 C 730 500 700 530 680 570", { o: 0.14 }),
  { kind: "stitch", d: "M 228 992 C 400 1010 600 1010 772 992" },
  { kind: "fold", d: "M 300 1000 C 360 982 420 1010 470 992", o: 0.1, w: 10 },
];
const raglanFront = {
  width: 1000,
  height: 1200,
  silhouette: `M 420 160 C 455 142 545 142 580 160 ${RAGLAN_RIGHT} Z`,
  zones: {
    body: null,
    sleeves: [
      raglanSleeve("568 178"),
      mirror(raglanSleeve("568 178")),
      // neck rib (front band + inside back band) matches the sleeves, like a classic baseball tee
      "M 420 160 C 448 230 552 230 580 160 L 566 158 C 540 206 460 206 434 158 Z",
      "M 420 160 C 455 142 545 142 580 160 C 545 152 455 152 420 160 Z",
    ].join(" "),
  },
  shade: [
    { kind: "inner", d: "M 434 160 C 460 206 540 206 566 160 C 540 150 460 150 434 160 Z", o: 0.4 },
    { kind: "rib", d: "M 420 160 C 448 230 552 230 580 160 L 566 158 C 540 206 460 206 434 158 Z", o: 0.12 },
    { kind: "seam", d: "M 420 160 C 448 230 552 230 580 160" },
    ...sym("seam", "M 568 178 C 640 270 720 370 772 454"),
    ...sym("stitch", "M 578 190 C 648 278 726 376 776 458", { o: 0.25 }),
    ...raglanShared,
  ],
  highlight: [
    ...both("M 850 250 C 920 340 968 460 990 590", { o: 0.4, w: 20 }),
    { d: "M 640 330 C 620 450 620 650 636 900", o: 0.13, w: 90 },
    { d: "M 360 340 C 380 450 380 650 364 900", o: 0.11, w: 90 },
    { d: "M 428 166 C 452 222 548 222 572 166", o: 0.35, w: 2.5, sharp: true },
    ...both("M 562 184 C 634 276 714 376 766 460", { o: 0.3, w: 2.5, sharp: true }),
  ],
};
const raglanBack = {
  width: 1000,
  height: 1200,
  silhouette: `M 420 160 C 455 176 545 176 580 160 ${RAGLAN_RIGHT} Z`,
  zones: {
    body: null,
    sleeves: [
      raglanSleeve("566 170"),
      mirror(raglanSleeve("566 170")),
      "M 420 160 C 455 176 545 176 580 160 L 578 180 C 545 196 455 196 422 180 Z",
    ].join(" "),
  },
  shade: [
    { kind: "rib", d: "M 420 160 C 455 176 545 176 580 160 L 578 180 C 545 196 455 196 422 180 Z", o: 0.12 },
    { kind: "seam", d: "M 422 180 C 455 196 545 196 578 180" },
    ...sym("seam", "M 566 170 C 640 270 720 370 772 454"),
    ...sym("stitch", "M 576 182 C 648 278 726 376 776 458", { o: 0.25 }),
    { kind: "fold", d: "M 340 330 C 420 360 580 360 660 330", o: 0.07, w: 34 },
    ...raglanShared,
  ],
  highlight: [
    ...both("M 850 250 C 920 340 968 460 990 590", { o: 0.4, w: 20 }),
    { d: "M 640 330 C 620 450 620 650 636 900", o: 0.13, w: 90 },
    ...both("M 560 176 C 634 276 714 376 766 460", { o: 0.3, w: 2.5, sharp: true }),
  ],
};

// ---------------------------------------------------------------- TANK
const TANK_RIGHT = `L 660 140 C 670 300 700 420 762 470 C 766 700 768 900 772 1082 C 600 1100 400 1100 228 1082
  C 232 900 234 700 238 470 C 300 420 330 300 340 140 L 410 140`;
const tankShared = [
  ...sym("seam", "M 642 146 C 652 296 684 412 744 462"),
  ...sym("stitch", "M 648 142 C 658 298 690 416 752 466", { o: 0.25 }),
  { kind: "stitch", d: "M 232 1060 C 400 1078 600 1078 768 1060" },
  ...sym("fold", "M 762 488 C 720 520 690 560 670 610", { o: 0.13 }),
  { kind: "tone", d: "M 560 640 C 600 740 590 920 620 1060 L 680 1060 C 660 900 650 720 600 620 Z", o: 0.05 },
  { kind: "fold", d: "M 310 1050 C 370 1030 430 1062 480 1040", o: 0.1, w: 10 },
];
const tankFront = {
  width: 1000,
  height: 1200,
  silhouette: `M 410 140 C 420 330 580 330 590 140 ${TANK_RIGHT} Z`,
  zones: { body: null },
  shade: [
    { kind: "seam", d: "M 424 140 C 434 312 566 312 576 140" },
    { kind: "stitch", d: "M 418 142 C 428 322 572 322 582 142", o: 0.25 },
    { kind: "edge", d: "M 410 140 C 420 330 580 330 590 140", o: 0.14, w: 30 },
    ...tankShared,
  ],
  highlight: [
    { d: "M 640 520 C 620 620 620 800 636 960", o: 0.13, w: 90 },
    { d: "M 360 540 C 380 640 380 820 364 960", o: 0.11, w: 90 },
    { d: "M 430 146 C 440 300 560 300 570 146", o: 0.3, w: 2.5, sharp: true },
    ...both("M 636 150 C 646 298 678 410 736 458", { o: 0.3, w: 2.5, sharp: true }),
  ],
};
const tankBack = {
  width: 1000,
  height: 1200,
  silhouette: `M 410 140 C 425 220 575 220 590 140 ${TANK_RIGHT} Z`,
  zones: { body: null },
  shade: [
    { kind: "seam", d: "M 424 140 C 438 206 562 206 576 140" },
    { kind: "stitch", d: "M 418 142 C 432 214 568 214 582 142", o: 0.25 },
    ...tankShared,
  ],
  highlight: [
    { d: "M 640 520 C 620 620 620 800 636 960", o: 0.13, w: 90 },
    { d: "M 430 146 C 444 200 556 200 570 146", o: 0.3, w: 2.5, sharp: true },
  ],
};

// ---------------------------------------------------------------- HOODIE (pullover)
// Drawn wide on purpose: hoodieFront/back are narrowed by HOODIE_FIT (sx 0.84) in `garments` below,
// which brings the body to ~440 px and leaves the sleeves at a realistic ~0.4× body width.
const HOODIE_RIGHT_BODY = `C 700 276 735 288 770 300 C 905 340 985 620 998 905 L 1004 1002 L 846 1022 L 842 920
  C 834 760 812 620 772 520 C 768 700 766 900 765 1040 L 758 1112 C 600 1120 400 1120 242 1112 L 235 1040
  C 234 900 232 700 228 520 C 188 620 166 760 158 920 L 154 1022 L -4 1002 L 2 905
  C 15 620 95 340 230 300 C 265 288 300 276 336 262`;
const HOODIE_DRAWCORDS =
  "M 470 372 C 466 460 462 550 456 650 L 468 652 C 474 550 478 460 482 372 Z M 530 372 C 534 460 538 550 544 650 L 532 652 C 526 550 522 460 518 372 Z";
const HOOD_OPENING =
  "M 500 420 C 430 380 372 296 380 198 C 390 128 450 100 500 100 C 550 100 610 128 620 198 C 628 296 570 380 500 420 Z";
const hoodieShared = [
  { kind: "rib", d: "M 235 1040 L 765 1040 L 758 1112 C 600 1120 400 1120 242 1112 Z", o: 0.12 },
  { kind: "seam", d: "M 235 1040 L 765 1040" },
  ...sym("rib", "M 998 905 L 1004 1002 L 846 1022 L 842 920 Z", { o: 0.12 }),
  ...sym("seam", "M 998 905 L 842 920"),
  ...sym("seam", "M 770 300 C 760 380 766 450 772 520"), // drop-shoulder seam
  ...sym("fold", "M 880 470 C 905 580 916 700 920 820", { o: 0.12, w: 18 }), // sleeve drape
  ...sym("fold", "M 820 560 C 838 640 850 720 856 800", { o: 0.08, w: 14 }),
  ...sym("crease", "M 852 850 C 900 836 950 840 990 852", { o: 0.14 }), // bunching above the cuff
  ...sym("crease", "M 848 884 C 896 872 946 874 994 884", { o: 0.12 }),
  ...sym("fold", "M 772 540 C 730 570 700 600 680 640", { o: 0.14 }),
  { kind: "fold", d: "M 330 1020 C 400 1000 460 1030 520 1010", o: 0.08, w: 12 },
];
const hoodieFront = {
  width: 1000,
  height: 1200,
  silhouette: `M 500 58 C 600 58 668 150 664 262 ${HOODIE_RIGHT_BODY} C 332 150 400 58 500 58 Z`,
  // Real blanks (Gildan 18500) have a self-color hood lining and color-matched drawcords, so the
  // hoodie is one color zone; the drawcords are drawn in the shading only.
  zones: { body: null },
  shade: [
    { kind: "seam", d: HOODIE_DRAWCORDS, o: 0.35, w: 2 },
    { kind: "tone", d: HOODIE_DRAWCORDS, o: 0.18 },
    // inside of the hood: darker toward the top (the hood's crown), plus the cross-over at the V
    {
      kind: "tone",
      d: "M 400 220 C 404 140 450 104 500 102 C 550 104 596 140 600 220 C 560 190 440 190 400 220 Z",
      o: 0.2,
    },
    { kind: "crease", d: "M 500 104 C 498 200 500 300 500 400", o: 0.12, w: 3 },
    { kind: "seam", d: HOOD_OPENING },
    {
      kind: "stitch",
      d: "M 500 432 C 420 386 360 300 368 196 C 378 120 446 88 500 88 C 554 88 622 120 632 196 C 640 300 580 386 500 432 Z",
      o: 0.25,
    },
    { kind: "edge", d: HOOD_OPENING, o: 0.16, w: 30 },
    { kind: "seam", d: "M 336 262 C 400 310 450 360 500 420 C 550 360 600 310 664 262", o: 0.22 },
    { kind: "grommet", cx: 476, cy: 372, r: 5 },
    { kind: "grommet", cx: 524, cy: 372, r: 5 },
    { kind: "tone", d: "M 452 640 L 472 640 L 472 674 L 452 674 Z", o: 0.35 }, // aglets
    { kind: "tone", d: "M 528 640 L 548 640 L 548 674 L 528 674 Z", o: 0.35 },
    // kangaroo pocket
    { kind: "seam", d: "M 360 742 L 640 742 C 664 820 690 900 712 1040 M 360 742 C 336 820 310 900 288 1040" },
    { kind: "stitch", d: "M 364 752 L 636 752", o: 0.25 },
    { kind: "edge", d: "M 640 742 C 664 820 690 900 712 1040", o: 0.2, w: 26 },
    { kind: "edge", d: "M 360 742 C 336 820 310 900 288 1040", o: 0.2, w: 26 },
    { kind: "fold", d: "M 420 800 C 470 820 530 820 580 800", o: 0.07, w: 20 },
    ...hoodieShared,
  ],
  highlight: [
    { d: "M 620 120 C 650 170 660 220 656 260", o: 0.35, w: 20 },
    ...both("M 820 340 C 900 440 948 620 962 800", { o: 0.35, w: 22 }),
    { d: "M 640 500 C 620 600 620 760 640 900", o: 0.12, w: 90 },
    { d: "M 360 500 C 380 600 380 760 360 900", o: 0.1, w: 90 },
    { d: "M 360 736 L 640 736", o: 0.3, w: 2.5, sharp: true },
    { d: "M 384 200 C 390 132 450 98 500 96 C 550 98 610 132 616 200", o: 0.3, w: 3, sharp: true },
  ],
};
const hoodieBack = {
  width: 1000,
  height: 1200,
  silhouette: `M 500 58 C 600 58 668 150 664 262 ${HOODIE_RIGHT_BODY} C 332 150 400 58 500 58 Z`,
  zones: { body: null },
  shade: [
    { kind: "seam", d: "M 500 58 C 502 140 504 220 500 318" }, // hood center seam
    { kind: "stitch", d: "M 508 62 C 510 140 512 220 508 314", o: 0.22 },
    { kind: "seam", d: "M 336 262 C 400 300 450 318 500 318 C 550 318 600 300 664 262" },
    { kind: "edge", d: "M 336 262 C 400 300 450 318 500 318 C 550 318 600 300 664 262", o: 0.2, w: 34 },
    { kind: "fold", d: "M 430 140 C 450 200 460 250 470 300", o: 0.08, w: 20 },
    { kind: "fold", d: "M 330 420 C 420 450 580 450 670 420", o: 0.06, w: 34 },
    ...hoodieShared,
  ],
  highlight: [
    { d: "M 600 110 C 640 160 652 220 648 270", o: 0.35, w: 22 },
    { d: "M 400 110 C 360 160 348 220 352 270", o: 0.3, w: 22 },
    ...both("M 820 340 C 900 440 948 620 962 800", { o: 0.35, w: 22 }),
    { d: "M 640 500 C 620 600 620 760 640 900", o: 0.12, w: 90 },
  ],
};

// ---------------------------------------------------------------- TRUCKER HAT (front view, 1000×800)
// Wide, fairly short crown; tall structured front panels; mesh sides; slim curved visor seen from slightly above.
const HAT_CROWN =
  "M 200 560 C 196 420 214 300 262 240 C 330 170 410 150 500 150 C 590 150 670 170 738 240 C 786 300 804 420 800 560 C 700 624 300 624 200 560 Z";
const HAT_BRIM = "M 186 566 C 320 610 680 610 814 566 C 812 680 676 762 500 764 C 324 762 188 680 186 566 Z";
const HAT_FRONT_PANELS =
  "M 252 588 C 252 400 300 230 400 178 C 436 162 468 156 500 156 C 532 156 564 162 600 178 C 700 230 748 400 748 588";
const hatMeshSide =
  "M 200 560 C 196 420 214 300 262 240 C 330 170 410 150 500 150 L 500 156 C 468 156 436 162 400 178 C 300 230 252 400 252 588 C 232 582 214 572 200 560 Z";
const hatFront = {
  width: 1000,
  height: 800,
  texture: false, // the front panels already carry a twill pattern
  silhouette: `${HAT_CROWN} ${HAT_BRIM}`,
  zones: {
    front: null,
    mesh: `${hatMeshSide} ${mirror(hatMeshSide)}`,
    brim: HAT_BRIM,
  },
  edgeWidth: 46,
  edgeOpacity: 0.15,
  shade: [
    { kind: "mesh", d: `${hatMeshSide} ${mirror(hatMeshSide)}`, o: 0.34 },
    { kind: "seam", d: HAT_FRONT_PANELS },
    ...sym("stitch", "M 264 588 C 264 406 312 242 408 190 C 440 174 470 168 500 168", { o: 0.25 }),
    { kind: "seam", d: "M 500 158 L 500 596", o: 0.22 },
    ...sym("stitch", "M 508 168 L 508 594", { o: 0.18 }),
    { kind: "edge", d: "M 252 588 C 252 400 300 230 400 178", o: 0.12, w: 26 },
    // brim: crown/brim seam, shadow the crown casts on the brim, stitch rows following the front edge
    { kind: "seam", d: "M 186 566 C 320 610 680 610 814 566", o: 0.4 },
    {
      kind: "tone",
      d: "M 214 590 C 340 630 660 630 786 590 C 760 650 640 680 500 682 C 360 680 240 650 214 590 Z",
      o: 0.14,
    },
    { kind: "stitch", d: "M 206 622 C 240 704 380 742 500 744 C 620 742 760 704 794 622" },
    { kind: "stitch", d: "M 228 626 C 260 696 390 724 500 726 C 610 724 740 696 772 626", o: 0.25 },
    { kind: "stitch", d: "M 252 630 C 282 688 400 706 500 708 C 600 706 718 688 748 630", o: 0.2 },
    { kind: "fold", d: "M 360 300 C 344 380 344 460 356 540", o: 0.06, w: 40 },
    { kind: "inner", d: "M 482 148 C 482 134 518 134 518 148 C 518 162 482 162 482 148 Z", o: 0.3 }, // top button
  ],
  highlight: [
    { d: "M 590 220 C 640 270 668 340 676 440", o: 0.4, w: 40 },
    { d: "M 330 712 C 430 736 570 736 670 712", o: 0.28, w: 22 },
    { d: "M 196 574 C 320 618 680 618 804 574", o: 0.12, w: 3, sharp: true },
    { d: "M 488 144 C 494 138 506 138 512 144", o: 0.5, w: 3, sharp: true },
  ],
};

// Real flat tees are ~0.7 as wide as they are long: widen the drawing and center it vertically.
const TEE_FIT = { sx: 1.12, sy: 0.88, ty: 72 };
const LS_FIT = { sx: 0.95, sy: 0.88, ty: 72 };
const HOODIE_FIT = { sx: 0.84 };
const RAGLAN_FIT = { sx: 0.84, sy: 1.02, ty: 10 };

export const garments = {
  tshirt: { front: scaleView(tshirtFront, TEE_FIT), back: scaleView(tshirtBack, TEE_FIT) },
  raglan: {
    front: scaleView(raglanFront, RAGLAN_FIT),
    back: scaleView(raglanBack, RAGLAN_FIT),
    left: mirrorView(raglanSleeveRight),
    right: raglanSleeveRight,
  },
  hoodie: {
    front: scaleView(hoodieFront, HOODIE_FIT),
    back: scaleView(hoodieBack, HOODIE_FIT),
    left: mirrorView(hoodieSleeveRight),
    right: hoodieSleeveRight,
  },
  longsleeve: {
    front: scaleView(longsleeveFront, LS_FIT),
    back: scaleView(longsleeveBack, LS_FIT),
    left: mirrorView(longSleeveRight),
    right: longSleeveRight,
  },
  hat: { front: hatFront },
  polo: { front: scaleView(poloFront, TEE_FIT), back: scaleView(poloBack, TEE_FIT) },
  tank: { front: tankFront, back: tankBack },
};
