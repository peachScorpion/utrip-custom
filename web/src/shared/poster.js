/* 内容海报生成：canvas 绘制，图片跨域失败时自动退回渐变底，不影响出图 */
export function drawPoster(a, brand = '优定制 U-DESIGN') {
  return new Promise(resolve => {
    const W = 750, H = 1334, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');

    const paint = (img) => {
      // 底
      x.fillStyle = '#f7f5f1'; x.fillRect(0, 0, W, H);
      // 封面
      const PH = 700;
      if (img) {
        const s = Math.max(W / img.width, PH / img.height);
        const w = img.width * s, h = img.height * s;
        x.drawImage(img, (W - w) / 2, (PH - h) / 2, w, h);
      } else {
        const g = x.createLinearGradient(0, 0, W, PH);
        g.addColorStop(0, '#2b2620'); g.addColorStop(.55, '#1a181e'); g.addColorStop(1, '#0e0d12');
        x.fillStyle = g; x.fillRect(0, 0, W, PH);
      }
      // 封面压暗（上下）
      const gd = x.createLinearGradient(0, 0, 0, PH);
      gd.addColorStop(0, 'rgba(10,9,14,.5)'); gd.addColorStop(.42, 'rgba(10,9,14,.05)');
      gd.addColorStop(1, 'rgba(10,9,14,.72)');
      x.fillStyle = gd; x.fillRect(0, 0, W, PH);

      // 分类角标
      x.fillStyle = 'rgba(207,174,116,.92)'; x.fillRect(54, 54, 8, 32);
      x.fillStyle = '#fff'; x.font = '500 26px -apple-system,"PingFang SC",sans-serif';
      x.fillText(a.k || '攻略', 76, 79);

      // 封面上的标题
      x.fillStyle = '#fff';
      x.font = '400 46px Optima,Palatino,Georgia,"Songti SC",serif';
      wrap(x, a.t || '', 54, PH - 128, W - 108, 60, 2);

      // 正文区
      let y = PH + 64;
      x.strokeStyle = '#b08d4f'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(54, y - 30); x.lineTo(92, y - 30); x.stroke();
      x.fillStyle = '#55525f'; x.font = '400 25px -apple-system,"PingFang SC",sans-serif';
      y = wrap(x, a.lead || '', 54, y + 6, W - 108, 42, 4);

      // 作者
      y += 26;
      x.fillStyle = '#8c6d3a'; x.beginPath(); x.arc(68, y, 16, 0, 7); x.fill();
      x.fillStyle = '#15141a'; x.font = '500 24px -apple-system,"PingFang SC",sans-serif';
      x.fillText(a.by || '定制顾问', 96, y + 9);
      if (a.read) {
        x.fillStyle = '#a9aeab'; x.font = '400 22px -apple-system,"PingFang SC",sans-serif';
        x.fillText(a.read + ' 阅读', W - 54 - x.measureText(a.read + ' 阅读').width, y + 9);
      }

      // 底部品牌条
      const BY = H - 168;
      x.fillStyle = '#15141a'; x.fillRect(0, BY, W, 168);
      x.fillStyle = '#cfae74'; x.font = '400 30px Optima,Palatino,Georgia,serif';
      x.fillText(brand, 54, BY + 68);
      x.fillStyle = 'rgba(255,255,255,.48)'; x.font = '400 21px -apple-system,"PingFang SC",sans-serif';
      x.fillText('众信旅游 · 定制旅游', 54, BY + 106);
      x.fillStyle = 'rgba(255,255,255,.3)'; x.font = '400 19px -apple-system,"PingFang SC",sans-serif';
      x.fillText('长按识别，看完整攻略', 54, BY + 138);
      // 右侧码（装饰性矩阵）
      const QS = 104, QX = W - 54 - QS, QY = BY + 32;
      x.fillStyle = '#fff'; x.fillRect(QX - 8, QY - 8, QS + 16, QS + 16);
      x.fillStyle = '#15141a';
      const seed = (a.id || 'A').split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
      for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
        if (((i * 7 + j * 13 + seed) % 5) < 2 || (i < 3 && j < 3) || (i < 3 && j > 5) || (i > 5 && j < 3))
          x.fillRect(QX + j * (QS / 9), QY + i * (QS / 9), QS / 9 - 1.5, QS / 9 - 1.5);
      }
      x.fillStyle = '#fff';
      x.fillRect(QX + QS / 9 + 1, QY + QS / 9 + 1, QS / 9 - 2, QS / 9 - 2);
      x.fillRect(QX + QS / 9 * 7 + 1, QY + QS / 9 + 1, QS / 9 - 2, QS / 9 - 2);
      x.fillRect(QX + QS / 9 + 1, QY + QS / 9 * 7 + 1, QS / 9 - 2, QS / 9 - 2);

      try { resolve(c.toDataURL('image/png')); }
      catch { resolve(null); }   // 图片污染画布时退回 null，调用方给提示
    };

    if (!a.img) return paint(null);
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => paint(im);
    im.onerror = () => paint(null);
    im.src = a.img;
    setTimeout(() => { if (!im.complete) paint(null); }, 3500);
  });
}

function wrap(x, text, left, top, maxW, lh, maxLines) {
  let line = '', y = top, n = 0;
  for (const ch of String(text)) {
    if (x.measureText(line + ch).width > maxW) {
      if (++n >= maxLines) { x.fillText(line.slice(0, -1) + '…', left, y); return y + lh; }
      x.fillText(line, left, y); y += lh; line = ch;
    } else line += ch;
  }
  if (line) { x.fillText(line, left, y); y += lh; }
  return y;
}
