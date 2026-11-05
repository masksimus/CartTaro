// Original geometric botanical engravings. No source images or external assets.
import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../v6/assets/', import.meta.url);
await mkdir(new URL('cards/', root), { recursive:true });
const path = d => `<path d="${d}"/>`;
const circle = (x,y,r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const star = (x,y,r=24) => path(`M${x} ${y-r} Q${x+4} ${y-4} ${x+r} ${y} Q${x+4} ${y+4} ${x} ${y+r} Q${x-4} ${y+4} ${x-r} ${y} Q${x-4} ${y-4} ${x} ${y-r}Z`);
const leaf = (x,y,flip=1) => `<g transform="translate(${x} ${y}) scale(${flip} 1)">${path('M0 0 Q-36 -8 -30 -36 Q-3 -30 0 0 M0 0 L-23 -28')}</g>`;
const stem = (x,y,flip=1) => `<g transform="translate(${x} ${y}) scale(${flip} 1)">${path('M0 0 Q-28 -66 -8 -130')}${[-22,-48,-74,-100].map((v,i)=>leaf(i<2?-7:-9,v,i%2?1:-1)).join('')}</g>`;
const rays = (x,y,r,outer,n=24) => Array.from({length:n},(_,i)=>{const a=i*Math.PI*2/n;return path(`M${x+Math.cos(a)*r} ${y+Math.sin(a)*r} L${x+Math.cos(a)*outer} ${y+Math.sin(a)*outer}`)}).join('');
const hill = path('M35 342 Q92 300 145 338 Q205 296 265 342 M35 355 Q102 319 151 350 Q218 324 265 355');
const motifs = [
  `${circle(202,146,24)}${path('M51 303 L109 245 L145 281 L186 224 L246 302 M115 336 Q150 296 141 264 Q129 241 151 209')}${star(151,197,15)}`,
  `${path('M100 207 C64 163 116 145 150 188 C184 145 236 163 200 207 C177 233 164 201 150 188 C135 201 123 233 100 207 M150 228 L150 325 M116 265 L184 265')}${star(150,286,33)}`,
  `${path('M170 132 A65 65 0 1 0 170 260 A51 51 0 0 1 170 132 M83 320 L83 224 M217 320 L217 224 M72 224 L94 224 M206 224 L228 224')}${star(177,194,21)}`,
  `${stem(117,336)}${stem(187,336,-1)}${circle(150,217,21)}${[0,1,2,3,4,5,6,7].map(i=>`<ellipse cx="150" cy="181" rx="12" ry="24" transform="rotate(${i*45} 150 217)"/>`).join('')}`,
  `${path('M96 310 L96 202 L204 202 L204 310 M82 310 L218 310 M112 202 L105 155 L135 176 L150 143 L165 176 L195 155 L188 202 M114 229 L186 229 M114 247 L186 247')}${star(150,277,20)}`,
  `${path('M81 321 L81 198 Q150 101 219 198 L219 321 M99 321 L99 206 Q150 136 201 206 L201 321 M150 202 L150 288 M126 232 L174 232 M135 255 L165 255')}`,
  `${stem(94,335)}${stem(206,335,-1)}${path('M150 270 C35 199 118 132 150 184 C182 132 265 199 150 270Z')}${star(150,134,18)}`,
  `${circle(108,293,27)}${circle(192,293,27)}${path('M83 264 L217 264 L203 218 L97 218 Z M150 218 L150 142 M125 168 L150 140 L175 168 M108 280 L108 306 M95 293 L121 293 M192 280 L192 306 M179 293 L205 293')}`,
  `${circle(150,228,61)}${circle(150,228,42)}${rays(150,228,66,82,20)}${path('M128 219 L137 219 M163 219 L172 219 M142 240 Q150 250 158 240 M150 231 L146 236 L154 236Z')}`,
  `${path('M112 185 L188 185 L188 293 L112 293Z M123 185 Q150 129 177 185 M150 135 L150 117 M105 307 L195 307 M126 199 L126 279 M174 199 L174 279')}${star(150,240,25)}`,
  `${circle(150,232,72)}${circle(150,232,56)}${circle(150,232,16)}${rays(150,232,19,53,8)}${star(150,126,19)}${star(59,232,12)}${star(241,232,12)}`,
  `${path('M150 143 L150 316 M105 317 L195 317 M82 196 L218 196 M102 197 L72 261 L132 261Z M198 197 L168 261 L228 261Z')}${circle(150,167,16)}`,
  `${path('M81 159 L219 159 M150 159 L150 238 M150 215 L182 243 L150 259 M150 238 L123 283 L177 283Z M150 283 L150 302')}${circle(150,319,17)}${rays(150,319,23,31,12)}`,
  `${path('M150 333 L150 230 M150 294 Q99 300 91 258 Q128 254 150 294 M150 268 Q196 267 201 229 Q166 228 150 268 M150 230 Q111 206 124 169 Q150 175 150 230 M150 230 Q181 190 163 154 Q140 177 150 230')}`,
  `${path('M84 174 L134 174 L128 229 L90 229Z M166 250 L216 250 L210 305 L172 305Z M108 229 C108 265 190 211 190 250 M93 312 Q131 288 159 315 M90 320 Q131 300 160 323')}${star(196,175,26)}`,
  `${path('M109 190 C52 207 94 271 136 245 L165 218 C201 186 248 243 203 272 M109 190 L136 218 M165 246 L203 272 M91 304 L213 156')}${circle(109,217,26)}${circle(191,247,26)}`,
  `${path('M109 322 L117 212 L183 212 L191 322 M104 322 L196 322 M122 212 L115 190 L139 197 L153 182 L177 196 L185 212 M142 234 L158 234 L158 264 L142 264Z M192 128 L163 163 L179 163 L147 202')}${star(91,172,16)}`,
  `${star(150,204,59)}${circle(150,204,73)}${star(72,143,12)}${star(224,286,17)}${path('M98 314 Q150 271 202 314 M110 322 Q150 290 190 322')}`,
  `${path('M177 145 A70 70 0 1 0 177 283 A57 57 0 0 1 177 145')}${star(194,199,21)}${star(215,150,10)}${path('M80 316 Q115 296 150 316 Q185 336 220 316 M80 330 Q115 310 150 330 Q185 350 220 330')}`,
  `${circle(150,223,47)}${circle(150,223,40)}${rays(150,223,58,86,24)}${path('M130 219 Q136 213 142 219 M158 219 Q164 213 170 219 M137 240 Q150 252 163 240')}`,
  `${path('M81 323 L219 323 M96 309 L204 309 M111 295 L189 295 M126 281 L174 281 M150 275 L150 173 M125 199 L150 173 L175 199')}${star(150,149,25)}${rays(150,149,33,47,12)}`,
  `${stem(98,338)}${stem(202,338,-1)}${circle(150,232,53)}${path('M97 232 L203 232 M150 179 C115 202 115 262 150 285 M150 179 C185 202 185 262 150 285 M106 205 L194 205 M106 259 L194 259')}${star(150,135,20)}`
];
const romans=['0','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI'];
const frame = `<rect x="13" y="13" width="274" height="474" rx="10"/><rect x="22" y="22" width="256" height="456" rx="7"/>${path('M36 106 Q150 47 264 106 M36 390 Q150 450 264 390')}`;
for (let id=0;id<22;id++) {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 500"><rect width="300" height="500" rx="13" fill="#f5efdf"/><g fill="none" stroke="#293e36" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${frame}<g stroke-width="2.2">${motifs[id]}</g><g opacity=".45">${hill}</g>${star(54,112,8)}${star(246,112,8)}${path('M108 411 L192 411 M126 419 L174 419')}</g><text x="150" y="74" font-family="Georgia,serif" text-anchor="middle" font-size="21" fill="#94452f">${romans[id]}</text><text x="150" y="463" font-family="Georgia,serif" text-anchor="middle" letter-spacing="5" font-size="11" fill="#293e36">ARCANA</text></svg>`;
  await writeFile(new URL(`cards/${id}.svg`,root),svg+'\n');
}
await writeFile(new URL('back.svg',root),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 500"><rect width="300" height="500" rx="13" fill="#293e36"/><g fill="none" stroke="#dccda8" stroke-width="1.4">${frame}${circle(150,250,87)}${circle(150,250,75)}${circle(150,250,55)}${rays(150,250,60,70,32)}${star(150,250,48)}${circle(150,250,15)}${stem(78,387)}${stem(222,387,-1)}${star(150,122,18)}${star(150,378,18)}</g><text x="150" y="66" text-anchor="middle" font-family="Georgia,serif" font-size="12" letter-spacing="5" fill="#dccda8">ARCANA</text><text x="150" y="461" text-anchor="middle" font-family="Georgia,serif" font-size="12" letter-spacing="5" fill="#dccda8">XXII</text></svg>\n`);
await writeFile(new URL('grain.svg',root),'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g fill="#574f34" opacity=".07"><circle cx="13" cy="17" r=".7"/><circle cx="72" cy="33" r=".7"/><circle cx="43" cy="83" r=".8"/><circle cx="91" cy="68" r=".6"/></g></svg>\n');
const icons={
  today:'<circle cx="16" cy="16" r="5"/><path d="M16 2v5m0 18v5M2 16h5m18 0h5M6 6l4 4m12 12 4 4M6 26l4-4M22 10l4-4"/>',
  readings:'<path d="m5 8 9-3 6 21-9 3zM18 5l9 3-6 21-5-2M9 13l5-1m-3 6 4-1"/>',
  collection:'<path d="M4 6h9q3 0 3 3 0-3 3-3h9v21h-9q-3 0-3 3 0-3-3-3H4zM16 9v18M8 11h4m-4 5h4m8-5h4m-4 5h4"/>',
  quests:'<path d="M9 5h15v23H5V9m4-7v8H2M10 17l3 3 7-8M10 24h10"/>',
  profile:'<circle cx="16" cy="16" r="13"/><circle cx="16" cy="12" r="4"/><path d="M8 25q1-8 8-8t8 8"/>',
};
for(const [name,shape] of Object.entries(icons))await writeFile(new URL(`nav-${name}.svg`,root),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="none" stroke="#293e36" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${shape}</g></svg>\n`);
await writeFile(new URL('seal.svg',root),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><g fill="none" stroke="#94452f" stroke-width="1.2"><circle cx="80" cy="80" r="73"/><circle cx="80" cy="80" r="67" stroke-dasharray="1 4"/><path d="M40 113q-22-37 5-68m75 68q22-37-5-68M40 97l-9-10m8-2-9-11m10-2-6-12m9 1-3-13m80 49 9-10m-8-2 9-11m-10-2 6-12m-9 1 3-13M48 123q32-12 64 0"/></g><text x="80" y="102" text-anchor="middle" font-family="Georgia,serif" font-size="67" fill="#94452f">А</text><text x="80" y="43" text-anchor="middle" font-family="Georgia,serif" font-size="10" letter-spacing="3" fill="#94452f">XXII</text></svg>\n`);
console.log('Generated 22 original vector engravings, card back and paper texture.');
