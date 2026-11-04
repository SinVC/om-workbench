import React from 'react';

export interface IconProps {
  /** Font Awesome solid glyph name, e.g. `fa-magnifying-glass`. */
  name: string;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

/** Thin wrapper so glyph sizing/colour stay in the design-token CSS. */
export const Icon: React.FC<IconProps> = ({ name, className = '', style, title }) => (
  <i
    className={`fa-solid ${name} icon ${className}`}
    style={style}
    aria-hidden={title ? undefined : true}
    title={title}
  />
);
