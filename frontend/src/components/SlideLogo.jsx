import { publicAsset } from '../utils/staticUrl';

/** Logo from public/ — respects Vite base on GitHub Pages subpaths (/docs/, /Slide/docs/). */
export default function SlideLogo({ alt = 'Slide', className, width, height }) {
  return (
    <img
      src={publicAsset('logo.png')}
      alt={alt}
      className={className}
      width={width}
      height={height}
    />
  );
}
