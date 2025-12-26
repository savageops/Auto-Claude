/**
 * Theme constants
 * Color themes for multi-theme support with light/dark mode variants
 */

import type { ColorThemeDefinition } from '../types/settings';

// ============================================
// Color Themes
// ============================================

/**
 * All available color themes with preview colors for the theme selector.
 * Each theme has both light and dark mode variants defined in CSS.
 */
export const COLOR_THEMES: ColorThemeDefinition[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Oscura-inspired with pale yellow accent',
    previewColors: { bg: '#F2F2ED', accent: '#E6E7A3', darkBg: '#0B0B0F', darkAccent: '#E6E7A3' }
  },
  {
    id: 'dusk',
    name: 'Dusk',
    description: 'Warmer variant with slightly lighter dark mode',
    previewColors: { bg: '#F5F5F0', accent: '#E6E7A3', darkBg: '#131419', darkAccent: '#E6E7A3' }
  },
  {
    id: 'lime',
    name: 'Lime',
    description: 'Fresh, energetic lime with purple accents',
    previewColors: { bg: '#E8F5A3', accent: '#7C3AED', darkBg: '#0F0F1A' }
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Calm, professional blue tones',
    previewColors: { bg: '#E0F2FE', accent: '#0284C7', darkBg: '#082F49' }
  },
  {
    id: 'retro',
    name: 'Retro',
    description: 'Warm, nostalgic amber vibes',
    previewColors: { bg: '#FEF3C7', accent: '#D97706', darkBg: '#1C1917' }
  },
  {
    id: 'neo',
    name: 'Neo',
    description: 'Modern cyberpunk pink/magenta',
    previewColors: { bg: '#FDF4FF', accent: '#D946EF', darkBg: '#0F0720' }
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Natural, earthy green tones',
    previewColors: { bg: '#DCFCE7', accent: '#16A34A', darkBg: '#052E16' }
  },
  {
    id: 'pastel',
    name: 'Pastel',
    description: 'Soft, muted pastels for a gentle aesthetic',
    previewColors: { bg: '#FFF5F7', accent: '#E8B4C8', darkBg: '#1A1523', darkAccent: '#C795B8' }
  },
  {
    id: 'subtle',
    name: 'Subtle',
    description: 'Minimal grays with understated elegance',
    previewColors: { bg: '#FAFAF8', accent: '#6B6B70', darkBg: '#0A0A0B', darkAccent: '#9A9AA0' }
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'Pure grayscale for ultimate minimalism',
    previewColors: { bg: '#F8F8F8', accent: '#666666', darkBg: '#0D0D0D', darkAccent: '#AAAAAA' }
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Cool blue tones for focused work',
    previewColors: { bg: '#EFF6FF', accent: '#3B82F6', darkBg: '#0A1628', darkAccent: '#60A5FA' }
  },
  {
    id: 'warm',
    name: 'Warm',
    description: 'Rich browns and tans for comfort',
    previewColors: { bg: '#FBF8F3', accent: '#D4A574', darkBg: '#1C0F0A', darkAccent: '#D4A574' }
  },
  {
    id: 'cherry',
    name: 'Cherry',
    description: 'Vibrant pink and red tones',
    previewColors: { bg: '#FFF1F2', accent: '#E11D48', darkBg: '#1A0509', darkAccent: '#FB7185' }
  },
  {
    id: 'amber',
    name: 'Amber',
    description: 'Warm golden and honey tones',
    previewColors: { bg: '#FFFBEB', accent: '#F59E0B', darkBg: '#1C1508', darkAccent: '#FCD34D' }
  },
  {
    id: 'mint',
    name: 'Mint',
    description: 'Fresh cool green with teal accents',
    previewColors: { bg: '#ECFDF5', accent: '#10B981', darkBg: '#052E1C', darkAccent: '#6EE7B7' }
  },
  {
    id: 'lavender',
    name: 'Lavender',
    description: 'Soft purple and lilac tones',
    previewColors: { bg: '#F5F3FF', accent: '#8B5CF6', darkBg: '#1A0F2E', darkAccent: '#A78BFA' }
  },
  {
    id: 'slate',
    name: 'Slate',
    description: 'Professional cool gray tones',
    previewColors: { bg: '#F8FAFC', accent: '#475569', darkBg: '#0F172A', darkAccent: '#94A3B8' }
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange and coral tones',
    previewColors: { bg: '#FFF7ED', accent: '#EA580C', darkBg: '#1C0A05', darkAccent: '#FB923C' }
  }
];
