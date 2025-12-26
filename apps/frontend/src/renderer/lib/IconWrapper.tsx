/**
 * Icon Wrapper Component
 *
 * Provides a consistent API for Hugeicons SVG components that matches Lucide React's
 * icon component behavior. Enables the use of a `size` prop for easy sizing while
 * still supporting className and other SVG props.
 *
 * Usage:
 *   import { AlertCircle, Check } from '@/lib/icons';
 *   <AlertCircle size={16} />
 *   <Check size="1.5rem" className="text-green-500" />
 *   <Check className="h-4 w-4" /> // Tailwind sizing still works
 */

import React, { forwardRef, type ComponentType, type SVGProps, type ForwardedRef } from 'react';

/**
 * Props supported by SVGR-generated components
 */
interface SVGRProps {
  /** Accessible title for the SVG element */
  title?: string;
  /** ID for the title element (used with aria-labelledby) */
  titleId?: string;
}

/**
 * Extended icon props that include the Lucide-compatible size prop
 */
export interface IconProps extends SVGProps<SVGSVGElement>, SVGRProps {
  /**
   * Size of the icon. Can be a number (pixels) or string (CSS value).
   * When provided, sets both width and height to this value.
   * @default 24
   */
  size?: number | string;
}

/**
 * Type for the base SVG component from SVGR
 */
type BaseSVGComponent = ComponentType<SVGProps<SVGSVGElement> & SVGRProps>;

/**
 * Type for the wrapped icon component with size prop support
 */
export type IconComponent = React.ForwardRefExoticComponent<
  IconProps & React.RefAttributes<SVGSVGElement>
>;

/**
 * Creates a wrapper component around an SVGR-generated SVG component that adds
 * Lucide-compatible size prop support.
 *
 * @param IconSVG - The base SVGR component to wrap
 * @param displayName - Optional display name for React DevTools
 * @returns A new component with size prop support
 *
 * @example
 * // Creating a wrapped icon
 * import AlertCircleSVG from '@icons/alert-circle.svg?react';
 * export const AlertCircle = wrapIcon(AlertCircleSVG, 'AlertCircle');
 *
 * // Using the wrapped icon
 * <AlertCircle size={16} className="text-red-500" />
 */
export function wrapIcon(IconSVG: BaseSVGComponent, displayName?: string): IconComponent {
  const WrappedIcon = forwardRef<SVGSVGElement, IconProps>(
    (
      { size = 24, width, height, className, ...props }: IconProps,
      ref: ForwardedRef<SVGSVGElement>
    ) => {
      // Priority: explicit width/height > size prop > default (24)
      // This matches Lucide React's behavior where icons default to 24x24
      const computedWidth = width ?? size;
      const computedHeight = height ?? size;

      return (
        <IconSVG
          ref={ref}
          width={computedWidth}
          height={computedHeight}
          className={className}
          {...props}
        />
      );
    }
  );

  WrappedIcon.displayName = displayName || 'Icon';

  return WrappedIcon;
}

/**
 * Utility type for creating icon component types
 * Use this when you need to type a collection of icons
 */
export type IconType = IconComponent;

export default wrapIcon;
