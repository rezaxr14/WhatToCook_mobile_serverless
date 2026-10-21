import React, { useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { journey, seg } from './state';

interface FadeHtmlProps {
  position: [number, number, number];
  /** [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd] in journey progress. */
  window: [number, number, number, number];
  distanceFactor?: number;
  className?: string;
  children: React.ReactNode;
}

/** Initial hidden style — stable identity across renders. */
const HIDDEN_STYLE: React.CSSProperties = { opacity: 0, visibility: 'hidden' };

/**
 * DOM content pinned inside the 3D world whose opacity follows the journey
 * progress window — mutated directly on the node, no React re-renders.
 */
export const FadeHtml: React.FC<FadeHtmlProps> = ({
  position,
  window: w,
  distanceFactor,
  className,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useFrame(() => {
    const node = ref.current;
    if (!node) return;
    const o = seg(journey.progress, w[0], w[1]) * (1 - seg(journey.progress, w[2], w[3]));
    node.style.opacity = o.toFixed(3);
    node.style.visibility = o < 0.01 ? 'hidden' : 'visible';
  });

  return (
    <Html position={position} center distanceFactor={distanceFactor} zIndexRange={[30, 0]} occlude={false}>
      <div ref={ref} style={HIDDEN_STYLE} className={className}>
        {children}
      </div>
    </Html>
  );
};
