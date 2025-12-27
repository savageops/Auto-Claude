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
    description: 'Balanced neutral with soft sage accents',
    previewColors: { bg: '#F2F2ED', accent: '#B8B978', darkBg: '#0F1014', darkAccent: '#D4D79A' }
  },
  {
    id: 'dusk',
    name: 'Dusk',
    description: 'Warm neutral with olive undertones',
    previewColors: { bg: '#F5F5F0', accent: '#B8B978', darkBg: '#131419', darkAccent: '#D4D79A' }
  },
  {
    id: 'steel',
    name: 'Steel',
    description: 'Blue-gray monochrome with topographic depth',
    previewColors: { bg: '#F1F5F9', accent: '#64748B', darkBg: '#0F172A', darkAccent: '#94A3B8' }
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Muted blue monochrome with glass layers',
    previewColors: { bg: '#F0F4F8', accent: '#5B7C9D', darkBg: '#0A1929', darkAccent: '#7A9BC4' }
  },
  {
    id: 'stone',
    name: 'Stone',
    description: 'Warm taupe monochrome with subtle gradients',
    previewColors: { bg: '#F5F3F0', accent: '#8B7E74', darkBg: '#1C1917', darkAccent: '#A89C92' }
  },
  {
    id: 'moss',
    name: 'Moss',
    description: 'Green-gray monochrome topographic layers',
    previewColors: { bg: '#F2F4F1', accent: '#6B7C6E', darkBg: '#0F1512', darkAccent: '#8A9D8E' }
  },
  {
    id: 'frost',
    name: 'Frost',
    description: 'Cool blue-white monochrome with ice tones',
    previewColors: { bg: '#F7F9FB', accent: '#7C8A99', darkBg: '#0C1419', darkAccent: '#9CAAB9' }
  },
  {
    id: 'ash',
    name: 'Ash',
    description: 'Purple-gray monochrome with soft contrast',
    previewColors: { bg: '#F4F3F6', accent: '#7C7486', darkBg: '#131218', darkAccent: '#9C94AE' }
  },
  {
    id: 'subtle',
    name: 'Subtle',
    description: 'Minimal warm grays with glass surfaces',
    previewColors: { bg: '#FAFAF8', accent: '#7A7A7E', darkBg: '#0E0E0F', darkAccent: '#9A9AA0' }
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'Pure grayscale topographic minimalism',
    previewColors: { bg: '#F5F5F5', accent: '#737373', darkBg: '#121212', darkAccent: '#A3A3A3' }
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep blue monochrome for focused work',
    previewColors: { bg: '#F0F3F8', accent: '#5C6F8A', darkBg: '#0A1628', darkAccent: '#7C8FA8' }
  },
  {
    id: 'sand',
    name: 'Sand',
    description: 'Warm beige monochrome with layered depth',
    previewColors: { bg: '#F8F6F3', accent: '#9A8F7E', darkBg: '#1A1714', darkAccent: '#B8AD9C' }
  },
  {
    id: 'slate',
    name: 'Slate',
    description: 'Cool slate monochrome with glass effects',
    previewColors: { bg: '#F8FAFC', accent: '#64748B', darkBg: '#0F172A', darkAccent: '#94A3B8' }
  },
  {
    id: 'charcoal',
    name: 'Charcoal',
    description: 'Dark gray monochrome with topographic contrast',
    previewColors: { bg: '#F3F4F6', accent: '#6B7280', darkBg: '#111827', darkAccent: '#9CA3AF' }
  },
  {
    id: 'sage',
    name: 'Sage',
    description: 'Muted sage monochrome with natural layers',
    previewColors: { bg: '#F4F5F3', accent: '#7A8577', darkBg: '#111613', darkAccent: '#9AAA97' }
  },
  {
    id: 'ink',
    name: 'Ink',
    description: 'Blue-black monochrome with subtle depth',
    previewColors: { bg: '#F2F4F6', accent: '#5B6B7A', darkBg: '#0D1117', darkAccent: '#7B8B9A' }
  },
  {
    id: 'pearl',
    name: 'Pearl',
    description: 'Soft white-gray with iridescent glass layers',
    previewColors: { bg: '#FAFBFC', accent: '#8A8E93', darkBg: '#16181A', darkAccent: '#AAAEBD' }
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Medium gray monochrome with metallic hints',
    previewColors: { bg: '#F5F6F7', accent: '#71767A', darkBg: '#18191B', darkAccent: '#91969A' }
  }
];
