/* OSS 图片按需压缩。
   素材库里存的是 pexels 原图，一张两三兆、长边六七千像素。手机上解码这种图很吃内存，
   连着翻几页浏览器就会崩（行程详情页已经崩过）。OSS 自带图片处理，出一张 900 宽的 webp
   只要几十 KB，视觉没差别。只处理我们自己的 OSS 域名，外链原样返回。 */
const OSS = /(^https?:)?\/\/[\w-]*uux-public\.oss-[\w-]+\.aliyuncs\.com\//i;
export function img(url, w = 900, q = 80) {
  if (!url || typeof url !== 'string') return url;
  if (!OSS.test(url) || url.includes('x-oss-process')) return url;
  return url + (url.includes('?') ? '&' : '?') + `x-oss-process=image/resize,w_${w}/quality,q_${q}/format,webp`;
}
