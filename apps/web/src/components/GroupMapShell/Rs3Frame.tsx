import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';
import type { AppearanceTheme } from '../../api/groupClient';

type Rs3FrameProps = {
  appearance?: AppearanceTheme;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  /** Title bar content overlaid on the top border strip (rs3 only). */
  header?: ReactNode;
  /** Class on the outer element when not using the sprite frame. */
  plainClassName?: string;
  ref?: Ref<HTMLDivElement>;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style' | 'children'>;

/**
 * 9-slice RS3 window chrome:
 * TL left_border · top middle_border (repeat-x) · TR right
 * side (repeat-y) · body · side flipped
 * BL bottom_left · bottom (repeat-x) · BR flipped bottom_left
 */
export function Rs3Frame({
  appearance = 'modern',
  className,
  plainClassName,
  style,
  header,
  children,
  ref,
  ...rest
}: Rs3FrameProps) {
  if (appearance !== 'rs3') {
    return (
      <div
        ref={ref}
        className={[plainClassName, className].filter(Boolean).join(' ')}
        style={style}
        {...rest}
      >
        {header}
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={['gms-rs3-frame', className].filter(Boolean).join(' ')}
      style={style}
      {...rest}
    >
      <div className="gms-rs3-frame-top">
        <span className="gms-rs3-frame-tl" aria-hidden />
        <span className="gms-rs3-frame-tm" aria-hidden />
        <span className="gms-rs3-frame-tr" aria-hidden />
        {header ? <div className="gms-rs3-frame-header">{header}</div> : null}
      </div>
      <div className="gms-rs3-frame-mid">
        <span className="gms-rs3-frame-ml" aria-hidden />
        <div className="gms-rs3-frame-body">{children}</div>
        <span className="gms-rs3-frame-mr" aria-hidden />
      </div>
      <div className="gms-rs3-frame-bot" aria-hidden>
        <span className="gms-rs3-frame-bl" />
        <span className="gms-rs3-frame-bm" />
        <span className="gms-rs3-frame-br" />
      </div>
    </div>
  );
}
