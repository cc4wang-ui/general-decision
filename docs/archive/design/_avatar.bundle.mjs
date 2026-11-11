// src/avatar.tsx
import { useEffect, useState } from "react";
var assetUrl = (lv, mood) => `/officers/${lv}/${mood}.webp`;
function avatarSvg(lv, mood = "idle", onDark = false) {
  const skin = ["#EFC9A6", "#D9A87C", "#C98F62"][lv];
  const shade = ["#D9AE8B", "#BF8C62", "#A9734C"][lv];
  const capD = "#33402A";
  const ink = "#1F1F1C";
  const gold = "#D4AF37";
  const bg = onDark ? "none" : "url(#bgG)";
  let s = '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">';
  s += '<defs><linearGradient id="bgG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6F3E8"/><stop offset="1" stop-color="#E7E2D0"/></linearGradient>';
  s += '<radialGradient id="capG" cx=".5" cy=".2" r=".9"><stop offset="0" stop-color="#5B6A3F"/><stop offset="1" stop-color="' + capD + '"/></radialGradient></defs>';
  s += '<rect width="120" height="120" fill="' + bg + '"/>';
  s += '<path d="M14 122 C22 92 42 86 60 86 C78 86 98 92 106 122 Z" fill="url(#capG)"/>';
  s += '<path d="M48 86 L60 100 L72 86 L66 84 L60 92 L54 84 Z" fill="' + shade + '"/>';
  s += '<rect x="70" y="98" width="18" height="6" rx="1" fill="#F1EBD8"/><rect x="72" y="100" width="14" height="2" fill="' + ink + '" opacity=".55"/>';
  if (lv === 1) s += '<path d="M24 122 L70 84 L78 90 L34 122 Z" fill="#C0392B"/><path d="M26 122 L72 86" stroke="#F1D36A" stroke-width="1.5"/>';
  if (lv === 2) s += '<path d="M60 92 v12" stroke="#9A9A9A" stroke-width="1.6"/><rect x="54" y="104" width="12" height="7" rx="2" fill="' + gold + '"/><circle cx="66" cy="107" r="1.6" fill="#7A6314"/>';
  s += '<rect x="50" y="72" width="20" height="16" fill="' + shade + '"/>';
  s += '<ellipse cx="34" cy="60" rx="5" ry="7" fill="' + skin + '"/><ellipse cx="86" cy="60" rx="5" ry="7" fill="' + skin + '"/>';
  s += '<path d="M60 20 C40 20 34 38 35 56 C36 74 46 84 60 84 C74 84 84 74 85 56 C86 38 80 20 60 20 Z" fill="' + skin + '"/>';
  s += '<path d="M38 60 C42 78 52 84 60 84 C68 84 78 78 82 60 C80 76 70 82 60 82 C50 82 40 76 38 60 Z" fill="' + shade + '" opacity=".55"/>';
  const tilt = lv === 0 ? ' transform="rotate(-7 60 36)"' : "";
  s += "<g" + tilt + '><path d="M30 42 C36 22 84 22 90 42 L86 44 C74 34 46 34 34 44 Z" fill="url(#capG)"/>';
  s += '<path d="M28 42 L92 42 L90 50 C74 46 46 46 30 50 Z" fill="' + capD + '"/>';
  s += '<circle cx="60" cy="33" r="4.5" fill="' + gold + '"/><path d="M60 29.5 l1.2 2.5 2.8 .3 -2 1.9 .5 2.8 -2.5 -1.3 -2.5 1.3 .5 -2.8 -2 -1.9 2.8 -.3 Z" fill="#7A6314"/></g>';
  if (lv === 2) s += '<path d="M42 48 q18 -6 36 0" stroke="#8C8C8C" stroke-width="1" fill="none"/>';
  const brow = { idle: [0, 0], bark: [-3, 3], praise: [-2, -2], punish: [-4, 4] }[mood];
  if (lv === 0) s += '<path d="M42 ' + (52 + brow[0]) + " q7 -4 14 0 M64 " + (52 + brow[0]) + ' q7 -4 14 0" stroke="' + ink + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
  else s += '<path d="M40 ' + (50 + brow[0]) + " L56 " + (54 + brow[1]) + " M80 " + (50 + brow[0]) + " L64 " + (54 + brow[1]) + '" stroke="' + ink + '" stroke-width="' + (lv === 2 ? 4.5 : 3.8) + '" fill="none" stroke-linecap="round"/>';
  if (lv === 2) {
    s += '<path d="M38 60 h18 a3 3 0 0 1 3 3 v4 a3 3 0 0 1 -3 3 h-14 a4 4 0 0 1 -4 -4 Z M64 60 h18 v6 a4 4 0 0 1 -4 4 h-14 a3 3 0 0 1 -3 -3 v-4 a3 3 0 0 1 3 -3 Z" fill="' + ink + '"/><path d="M59 62 h2" stroke="' + ink + '" stroke-width="2"/><path d="M42 62 l6 6" stroke="#fff" stroke-width="1.5" opacity=".5"/>';
  } else if (lv === 0) {
    s += '<circle cx="49" cy="62" r="4.2" fill="#fff"/><circle cx="71" cy="62" r="4.2" fill="#fff"/><circle cx="49.5" cy="62.5" r="2.6" fill="' + ink + '"/><circle cx="71.5" cy="62.5" r="2.6" fill="' + ink + '"/><circle cx="50.5" cy="61.5" r=".9" fill="#fff"/><circle cx="72.5" cy="61.5" r=".9" fill="#fff"/>';
  } else {
    s += '<path d="M43 62 h12 v3.5 h-12 Z M65 62 h12 v3.5 h-12 Z" fill="' + ink + '"/>';
  }
  if (lv === 2) s += '<path d="M50 70 q-2 6 0 10 M70 70 q2 6 0 10" stroke="' + shade + '" stroke-width="1.6" fill="none"/>';
  const mouths = {
    idle: lv === 0 ? '<path d="M52 75 q8 -3 16 0" stroke="' + ink + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>' : '<path d="M50 75 h20" stroke="' + ink + '" stroke-width="3" stroke-linecap="round"/>',
    bark: '<path d="M50 72 q10 -4 20 0 q-2 10 -10 10 q-8 0 -10 -10 Z" fill="' + ink + '"/><path d="M53 73 q7 -2 14 0" stroke="#fff" stroke-width="1.6"/>',
    praise: '<path d="M50 74 q10 8 20 0" stroke="' + ink + '" stroke-width="3" fill="none" stroke-linecap="round"/>',
    punish: '<path d="M48 71 q12 -6 24 0 q-1 12 -12 12 q-11 0 -12 -12 Z" fill="' + ink + '"/><path d="M51 72 q9 -3 18 0" stroke="#fff" stroke-width="1.8"/><path d="M54 80 q6 3 12 0" stroke="#C0392B" stroke-width="2" fill="none"/>'
  };
  s += mouths[mood];
  if (lv === 0 && (mood === "idle" || mood === "bark")) s += '<path d="M88 48 q5 7 0 10 q-5 -3 0 -10 Z" fill="#5DADE2"/>';
  if (mood === "punish") s += '<path d="M22 40 l6 -8 M18 52 l8 -2 M98 40 l-6 -8 M102 52 l-8 -2" stroke="' + (onDark ? "#fff" : ink) + '" stroke-width="2.5" stroke-linecap="round"/>';
  if (mood === "praise") s += '<path d="M20 30 l4 4 M26 24 l1 6 M100 30 l-4 4 M94 24 l-1 6" stroke="' + gold + '" stroke-width="2.2" stroke-linecap="round"/>';
  return s + "</svg>";
}
function Avatar({ level, mood = "idle", onDark = false, className, onClick, title }) {
  const url = assetUrl(level, mood);
  const [hasAsset, setHasAsset] = useState(false);
  useEffect(() => {
    let alive = true;
    setHasAsset(false);
    if (typeof Image === "undefined") return;
    const img = new Image();
    img.onload = () => {
      if (alive) setHasAsset(true);
    };
    img.onerror = () => {
      if (alive) setHasAsset(false);
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  const common = { className, onClick, title, "data-avatar": `${level}-${mood}` };
  return hasAsset ? /* @__PURE__ */ React.createElement("div", { ...common }, /* @__PURE__ */ React.createElement("img", { src: url, alt: "", width: 512, height: 512 })) : /* @__PURE__ */ React.createElement("div", { ...common, dangerouslySetInnerHTML: { __html: avatarSvg(level, mood, onDark) } });
}
export {
  Avatar,
  assetUrl,
  avatarSvg
};
