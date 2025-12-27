/**
 * TypeScript declarations for SVG imports with ?react suffix
 *
 * Enables importing SVG files as React components using vite-plugin-svgr:
 * import Icon from '@icons/icon-name.svg?react';
 *
 * The component supports standard SVG props plus:
 * - title: Accessible title for the SVG
 * - titleId: ID for the title element
 */

/**
 * Extended SVG props that include SVGR-specific props
 */
interface SVGRProps {
  /** Accessible title for the SVG element */
  title?: string;
  /** ID for the title element (used with aria-labelledby) */
  titleId?: string;
}

/**
 * Complete props type for SVG React components
 */
type SVGComponentProps = React.SVGProps<SVGSVGElement> & SVGRProps;

/**
 * Type for SVG files imported with ?react suffix
 * Returns a React component that forwards refs to the underlying SVG element
 */
type SVGComponent = React.ForwardRefExoticComponent<
  SVGComponentProps & React.RefAttributes<SVGSVGElement>
>;

// Generic SVG module declaration for ?react suffix
declare module '*.svg?react' {
  const content: SVGComponent;
  export default content;
}

// Explicit declarations for icon path aliases
// These are needed because TypeScript path resolution doesn't handle query strings
declare module '@icons/activity.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/alert-circle.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/alert-triangle.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/archive.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/arrow-left.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/arrow-right.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/bar-chart3.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/bell.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/book-open.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/bot.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/box.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/brain.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/bug.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/calendar.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/check.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/check-check.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/check-circle.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/check-circle2.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/check-square.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/chevron-down.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/chevron-right.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/chevron-up.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/circle.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/clock.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/cloud-download.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/code.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/code2.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/cog.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/copy.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/cpu.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/credit-card.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/database.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/download.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/external-link.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/eye.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/eye-off.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/file.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/file-code.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/file-diff.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/file-down.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/file-image.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/file-json.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/file-text.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/filter.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/flask-conical.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/folder.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/folder-git2.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/folder-open.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/folder-plus.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/folder-search.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/folder-tree.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/folder-x.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/gauge.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/git-branch.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/git-commit.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/github.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/git-merge.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/git-pull-request.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/globe.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/grid2x2.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/hard-drive.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/help-circle.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/history.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/image.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/import.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/inbox.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/info.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/key.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/key-round.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/layers.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/layout-grid.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/lightbulb.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/list-checks.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/list-todo.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/RefreshCw.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/lock.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/log-in.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/mail.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/map.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/message-circle.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/message-square.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/minus.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/minus-square.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/monitor.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/moon.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/more-vertical.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/package.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/palette.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/panel-left.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/panel-left-close.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/party-popper.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/pencil.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/pen-line.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/play.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/plus.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/radio.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/refresh-cw.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/rocket.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/rotate-ccw.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/route.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/save.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/scale.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/search.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/send.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/server.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/settings.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/settings2.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/shield.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/sliders.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/sparkles.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/square.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/star.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/sun.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/tag.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/target.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/terminal.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/terminal-square.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/thumbs-up.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/trash2.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/trending-up.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/upload.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/user.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/users.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/wand2.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/wifi.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/wrench.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/x.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/xcircle.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/zap.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/zoom-in.svg?react' { const content: SVGComponent; export default content; }
declare module '@icons/zoom-out.svg?react' { const content: SVGComponent; export default content; }
