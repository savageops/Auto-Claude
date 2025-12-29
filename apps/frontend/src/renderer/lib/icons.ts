/**
 * Centralized Icon Exports
 *
 * This file serves as the single source of truth for all Hugeicons Duotone icons used
 * throughout the application. By consolidating imports here, we enable:
 *
 * 1. Better tracking of which icons are actually used
 * 2. Potential code-splitting opportunities
 * 3. Consistent theming with CSS variables (--icon-fill for duotone fill)
 * 4. Reduced bundle size through optimized tree-shaking
 * 5. Lucide-compatible API with size prop support
 *
 * Usage:
 *   import { AlertCircle, Check, X } from '@/lib/icons';
 *   <AlertCircle size={16} />
 *   <Check size="1.5rem" className="text-green-500" />
 *   <X className="h-4 w-4" /> // Tailwind sizing still works
 *
 * Icons are 24x24 SVGs from Hugeicons Duotone collection, preprocessed to use:
 *   - fill="var(--icon-fill, currentColor)" for duotone background
 *   - stroke="currentColor" for foreground strokes
 *
 * When adding new icons:
 *   1. Add the icon SVG to src/renderer/assets/icons/ (preprocessed)
 *   2. Import the icon with ?react suffix (add SVG suffix to import name)
 *   3. Wrap with wrapIcon() and add to exports in alphabetical order
 */

import { wrapIcon } from './IconWrapper';

// Import all icons from processed Hugeicons SVGs
import ActivitySVG from '@icons/activity.svg?react';
import AlertCircleSVG from '@icons/alert-circle.svg?react';
import AlertTriangleSVG from '@icons/alert-triangle.svg?react';
import ArchiveSVG from '@icons/archive.svg?react';
import ArrowLeftSVG from '@icons/arrow-left.svg?react';
import ArrowRightSVG from '@icons/arrow-right.svg?react';
import BarChart3SVG from '@icons/bar-chart3.svg?react';
import BellSVG from '@icons/bell.svg?react';
import BookOpenSVG from '@icons/book-open.svg?react';
import BotSVG from '@icons/bot.svg?react';
import BoxSVG from '@icons/box.svg?react';
import BrainSVG from '@icons/brain.svg?react';
import BugSVG from '@icons/bug.svg?react';
import BuildingSVG from '@icons/building.svg?react';
import CalendarSVG from '@icons/calendar.svg?react';
import CheckSVG from '@icons/check.svg?react';
import CheckCheckSVG from '@icons/check-check.svg?react';
import CheckCircleSVG from '@icons/check-circle.svg?react';
import CheckCircle2SVG from '@icons/check-circle2.svg?react';
import CheckSquareSVG from '@icons/check-square.svg?react';
import ChevronDownSVG from '@icons/chevron-down.svg?react';
import ChevronRightSVG from '@icons/chevron-right.svg?react';
import ChevronUpSVG from '@icons/chevron-up.svg?react';
import CircleSVG from '@icons/circle.svg?react';
import ClockSVG from '@icons/clock.svg?react';
import CloudDownloadSVG from '@icons/cloud-download.svg?react';
import CodeSVG from '@icons/code.svg?react';
import Code2SVG from '@icons/code2.svg?react';
import CogSVG from '@icons/cog.svg?react';
import CopySVG from '@icons/copy.svg?react';
import CpuSVG from '@icons/cpu.svg?react';
import CreditCardSVG from '@icons/credit-card.svg?react';
import DatabaseSVG from '@icons/database.svg?react';
import DownloadSVG from '@icons/download.svg?react';
import ExternalLinkSVG from '@icons/external-link.svg?react';
import EyeSVG from '@icons/eye.svg?react';
import EyeOffSVG from '@icons/eye-off.svg?react';
import FileSVG from '@icons/file.svg?react';
import FileCodeSVG from '@icons/file-code.svg?react';
import FileDiffSVG from '@icons/file-diff.svg?react';
import FileDownSVG from '@icons/file-down.svg?react';
import FileImageSVG from '@icons/file-image.svg?react';
import FileJsonSVG from '@icons/file-json.svg?react';
import FileTextSVG from '@icons/file-text.svg?react';
import FilterSVG from '@icons/filter.svg?react';
import FlaskConicalSVG from '@icons/flask-conical.svg?react';
import FolderSVG from '@icons/folder.svg?react';
import FolderGit2SVG from '@icons/folder-git2.svg?react';
import FolderOpenSVG from '@icons/folder-open.svg?react';
import FolderPlusSVG from '@icons/folder-plus.svg?react';
import FolderSearchSVG from '@icons/folder-search.svg?react';
import FolderTreeSVG from '@icons/folder-tree.svg?react';
import FolderXSVG from '@icons/folder-x.svg?react';
import GaugeSVG from '@icons/gauge.svg?react';
import GitBranchSVG from '@icons/git-branch.svg?react';
import GitCommitSVG from '@icons/git-commit.svg?react';
import GithubSVG from '@icons/github.svg?react';
import GitMergeSVG from '@icons/git-merge.svg?react';
import GitPullRequestSVG from '@icons/git-pull-request.svg?react';
import GlobeSVG from '@icons/globe.svg?react';
import Grid2X2SVG from '@icons/grid2x2.svg?react';
import HardDriveSVG from '@icons/hard-drive.svg?react';
import HelpCircleSVG from '@icons/help-circle.svg?react';
import HistorySVG from '@icons/history.svg?react';
import ImageSVG from '@icons/image.svg?react';
import ImportSVG from '@icons/import.svg?react';
import InboxSVG from '@icons/inbox.svg?react';
import InfoSVG from '@icons/info.svg?react';
import KeySVG from '@icons/key.svg?react';
import KeyRoundSVG from '@icons/key-round.svg?react';
import LayersSVG from '@icons/layers.svg?react';
import LayoutGridSVG from '@icons/layout-grid.svg?react';
import LightbulbSVG from '@icons/lightbulb.svg?react';
import LinkSVG from '@icons/link.svg?react';
import ListChecksSVG from '@icons/list-checks.svg?react';
import ListTodoSVG from '@icons/list-todo.svg?react';
import LockSVG from '@icons/lock.svg?react';
import LogInSVG from '@icons/log-in.svg?react';
import MailSVG from '@icons/mail.svg?react';
import MapSVG from '@icons/map.svg?react';
import MessageCircleSVG from '@icons/message-circle.svg?react';
import MessageSquareSVG from '@icons/message-square.svg?react';
import MinusSVG from '@icons/minus.svg?react';
import MinusSquareSVG from '@icons/minus-square.svg?react';
import MonitorSVG from '@icons/monitor.svg?react';
import MoonSVG from '@icons/moon.svg?react';
import MoreVerticalSVG from '@icons/more-vertical.svg?react';
import PackageSVG from '@icons/package.svg?react';
import PaletteSVG from '@icons/palette.svg?react';
import PanelLeftSVG from '@icons/panel-left.svg?react';
import PanelLeftCloseSVG from '@icons/panel-left-close.svg?react';
import PartyPopperSVG from '@icons/party-popper.svg?react';
import PencilSVG from '@icons/pencil.svg?react';
import PenLineSVG from '@icons/pen-line.svg?react';
import PlaySVG from '@icons/play.svg?react';
import PlusSVG from '@icons/plus.svg?react';
import RadioSVG from '@icons/radio.svg?react';
import RefreshCwSVG from '@icons/setting-03.svg?react';
import RocketSVG from '@icons/rocket.svg?react';
import RotateCcwSVG from '@icons/rotate-ccw.svg?react';
import RouteSVG from '@icons/route.svg?react';
import SaveSVG from '@icons/save.svg?react';
import ScaleSVG from '@icons/scale.svg?react';
import SearchSVG from '@icons/search.svg?react';
import SendSVG from '@icons/send.svg?react';
import ServerSVG from '@icons/server.svg?react';
import SettingsSVG from '@icons/settings.svg?react';
import Settings2SVG from '@icons/settings2.svg?react';
import ShieldSVG from '@icons/shield.svg?react';
import SlidersSVG from '@icons/sliders.svg?react';
import SparklesSVG from '@icons/sparkles.svg?react';
import SquareSVG from '@icons/square.svg?react';
import StarSVG from '@icons/star.svg?react';
import SunSVG from '@icons/sun.svg?react';
import TagSVG from '@icons/tag.svg?react';
import TargetSVG from '@icons/target.svg?react';
import TerminalSVG from '@icons/terminal.svg?react';
import TerminalSquareSVG from '@icons/terminal-square.svg?react';
import ThumbsUpSVG from '@icons/thumbs-up.svg?react';
import Trash2SVG from '@icons/trash2.svg?react';
import TrendingUpSVG from '@icons/trending-up.svg?react';
import UploadSVG from '@icons/upload.svg?react';
import UserSVG from '@icons/user.svg?react';
import UsersSVG from '@icons/users.svg?react';
import Wand2SVG from '@icons/wand2.svg?react';
import WifiSVG from '@icons/wifi.svg?react';
import WrenchSVG from '@icons/wrench.svg?react';
import XSVG from '@icons/x.svg?react';
import XCircleSVG from '@icons/xcircle.svg?react';
import ZapSVG from '@icons/zap.svg?react';
import ZoomInSVG from '@icons/zoom-in.svg?react';
import ZoomOutSVG from '@icons/zoom-out.svg?react';

// Wrap all icons with wrapIcon for Lucide-compatible size prop support
export const Activity = wrapIcon(ActivitySVG, 'Activity');
export const AlertCircle = wrapIcon(AlertCircleSVG, 'AlertCircle');
export const AlertTriangle = wrapIcon(AlertTriangleSVG, 'AlertTriangle');
export const Archive = wrapIcon(ArchiveSVG, 'Archive');
export const ArrowLeft = wrapIcon(ArrowLeftSVG, 'ArrowLeft');
export const ArrowRight = wrapIcon(ArrowRightSVG, 'ArrowRight');
export const BarChart3 = wrapIcon(BarChart3SVG, 'BarChart3');
export const Bell = wrapIcon(BellSVG, 'Bell');
export const BookOpen = wrapIcon(BookOpenSVG, 'BookOpen');
export const Bot = wrapIcon(BotSVG, 'Bot');
export const Box = wrapIcon(BoxSVG, 'Box');
export const Brain = wrapIcon(BrainSVG, 'Brain');
export const Bug = wrapIcon(BugSVG, 'Bug');
export const Building = wrapIcon(BuildingSVG, 'Building');
export const Calendar = wrapIcon(CalendarSVG, 'Calendar');
export const Check = wrapIcon(CheckSVG, 'Check');
export const CheckCheck = wrapIcon(CheckCheckSVG, 'CheckCheck');
export const CheckCircle = wrapIcon(CheckCircleSVG, 'CheckCircle');
export const CheckCircle2 = wrapIcon(CheckCircle2SVG, 'CheckCircle2');
export const CheckSquare = wrapIcon(CheckSquareSVG, 'CheckSquare');
export const ChevronDown = wrapIcon(ChevronDownSVG, 'ChevronDown');
export const ChevronRight = wrapIcon(ChevronRightSVG, 'ChevronRight');
export const ChevronUp = wrapIcon(ChevronUpSVG, 'ChevronUp');
export const Circle = wrapIcon(CircleSVG, 'Circle');
export const Clock = wrapIcon(ClockSVG, 'Clock');
export const CloudDownload = wrapIcon(CloudDownloadSVG, 'CloudDownload');
export const Code = wrapIcon(CodeSVG, 'Code');
export const Code2 = wrapIcon(Code2SVG, 'Code2');
export const Cog = wrapIcon(CogSVG, 'Cog');
export const Copy = wrapIcon(CopySVG, 'Copy');
export const Cpu = wrapIcon(CpuSVG, 'Cpu');
export const CreditCard = wrapIcon(CreditCardSVG, 'CreditCard');
export const Database = wrapIcon(DatabaseSVG, 'Database');
export const Download = wrapIcon(DownloadSVG, 'Download');
export const ExternalLink = wrapIcon(ExternalLinkSVG, 'ExternalLink');
export const Eye = wrapIcon(EyeSVG, 'Eye');
export const EyeOff = wrapIcon(EyeOffSVG, 'EyeOff');
export const File = wrapIcon(FileSVG, 'File');
export const FileCode = wrapIcon(FileCodeSVG, 'FileCode');
export const FileDiff = wrapIcon(FileDiffSVG, 'FileDiff');
export const FileDown = wrapIcon(FileDownSVG, 'FileDown');
export const FileImage = wrapIcon(FileImageSVG, 'FileImage');
export const FileJson = wrapIcon(FileJsonSVG, 'FileJson');
export const FileText = wrapIcon(FileTextSVG, 'FileText');
export const Filter = wrapIcon(FilterSVG, 'Filter');
export const FlaskConical = wrapIcon(FlaskConicalSVG, 'FlaskConical');
export const Folder = wrapIcon(FolderSVG, 'Folder');
export const FolderGit2 = wrapIcon(FolderGit2SVG, 'FolderGit2');
export const FolderOpen = wrapIcon(FolderOpenSVG, 'FolderOpen');
export const FolderPlus = wrapIcon(FolderPlusSVG, 'FolderPlus');
export const FolderSearch = wrapIcon(FolderSearchSVG, 'FolderSearch');
export const FolderTree = wrapIcon(FolderTreeSVG, 'FolderTree');
export const FolderX = wrapIcon(FolderXSVG, 'FolderX');
export const Gauge = wrapIcon(GaugeSVG, 'Gauge');
export const GitBranch = wrapIcon(GitBranchSVG, 'GitBranch');
export const GitCommit = wrapIcon(GitCommitSVG, 'GitCommit');
export const Github = wrapIcon(GithubSVG, 'Github');
export const GitMerge = wrapIcon(GitMergeSVG, 'GitMerge');
export const GitPullRequest = wrapIcon(GitPullRequestSVG, 'GitPullRequest');
export const Globe = wrapIcon(GlobeSVG, 'Globe');
export const Grid2X2 = wrapIcon(Grid2X2SVG, 'Grid2X2');
export const HardDrive = wrapIcon(HardDriveSVG, 'HardDrive');
export const HelpCircle = wrapIcon(HelpCircleSVG, 'HelpCircle');
export const History = wrapIcon(HistorySVG, 'History');
export const Image = wrapIcon(ImageSVG, 'Image');
export const Import = wrapIcon(ImportSVG, 'Import');
export const Inbox = wrapIcon(InboxSVG, 'Inbox');
export const Info = wrapIcon(InfoSVG, 'Info');
export const Key = wrapIcon(KeySVG, 'Key');
export const KeyRound = wrapIcon(KeyRoundSVG, 'KeyRound');
export const Layers = wrapIcon(LayersSVG, 'Layers');
export const LayoutGrid = wrapIcon(LayoutGridSVG, 'LayoutGrid');
export const Lightbulb = wrapIcon(LightbulbSVG, 'Lightbulb');
export const Link = wrapIcon(LinkSVG, 'Link');
export const ListChecks = wrapIcon(ListChecksSVG, 'ListChecks');
export const ListTodo = wrapIcon(ListTodoSVG, 'ListTodo');
export const Lock = wrapIcon(LockSVG, 'Lock');
export const LogIn = wrapIcon(LogInSVG, 'LogIn');
export const Mail = wrapIcon(MailSVG, 'Mail');
export const Map = wrapIcon(MapSVG, 'Map');
export const MessageCircle = wrapIcon(MessageCircleSVG, 'MessageCircle');
export const MessageSquare = wrapIcon(MessageSquareSVG, 'MessageSquare');
export const Minus = wrapIcon(MinusSVG, 'Minus');
export const MinusSquare = wrapIcon(MinusSquareSVG, 'MinusSquare');
export const Monitor = wrapIcon(MonitorSVG, 'Monitor');
export const Moon = wrapIcon(MoonSVG, 'Moon');
export const MoreVertical = wrapIcon(MoreVerticalSVG, 'MoreVertical');
export const Package = wrapIcon(PackageSVG, 'Package');
export const Palette = wrapIcon(PaletteSVG, 'Palette');
export const PanelLeft = wrapIcon(PanelLeftSVG, 'PanelLeft');
export const PanelLeftClose = wrapIcon(PanelLeftCloseSVG, 'PanelLeftClose');
export const PartyPopper = wrapIcon(PartyPopperSVG, 'PartyPopper');
export const Pencil = wrapIcon(PencilSVG, 'Pencil');
export const PenLine = wrapIcon(PenLineSVG, 'PenLine');
export const Play = wrapIcon(PlaySVG, 'Play');
export const Plus = wrapIcon(PlusSVG, 'Plus');
export const Radio = wrapIcon(RadioSVG, 'Radio');
export const RefreshCw = wrapIcon(RefreshCwSVG, 'RefreshCw');
export const Rocket = wrapIcon(RocketSVG, 'Rocket');
export const RotateCcw = wrapIcon(RotateCcwSVG, 'RotateCcw');
export const Route = wrapIcon(RouteSVG, 'Route');
export const Save = wrapIcon(SaveSVG, 'Save');
export const Scale = wrapIcon(ScaleSVG, 'Scale');
export const Search = wrapIcon(SearchSVG, 'Search');
export const Send = wrapIcon(SendSVG, 'Send');
export const Server = wrapIcon(ServerSVG, 'Server');
export const Settings = wrapIcon(SettingsSVG, 'Settings');
export const Settings2 = wrapIcon(Settings2SVG, 'Settings2');
export const Shield = wrapIcon(ShieldSVG, 'Shield');
export const Sliders = wrapIcon(SlidersSVG, 'Sliders');
export const Sparkles = wrapIcon(SparklesSVG, 'Sparkles');
export const Square = wrapIcon(SquareSVG, 'Square');
export const Star = wrapIcon(StarSVG, 'Star');
export const Sun = wrapIcon(SunSVG, 'Sun');
export const Tag = wrapIcon(TagSVG, 'Tag');
export const Target = wrapIcon(TargetSVG, 'Target');
export const Terminal = wrapIcon(TerminalSVG, 'Terminal');
export const TerminalSquare = wrapIcon(TerminalSquareSVG, 'TerminalSquare');
export const ThumbsUp = wrapIcon(ThumbsUpSVG, 'ThumbsUp');
export const Trash2 = wrapIcon(Trash2SVG, 'Trash2');
export const TrendingUp = wrapIcon(TrendingUpSVG, 'TrendingUp');
export const Upload = wrapIcon(UploadSVG, 'Upload');
export const User = wrapIcon(UserSVG, 'User');
export const Users = wrapIcon(UsersSVG, 'Users');
export const Wand2 = wrapIcon(Wand2SVG, 'Wand2');
export const Wifi = wrapIcon(WifiSVG, 'Wifi');
export const Wrench = wrapIcon(WrenchSVG, 'Wrench');
export const X = wrapIcon(XSVG, 'X');
export const XCircle = wrapIcon(XCircleSVG, 'XCircle');
export const Zap = wrapIcon(ZapSVG, 'Zap');
export const ZoomIn = wrapIcon(ZoomInSVG, 'ZoomIn');
export const ZoomOut = wrapIcon(ZoomOutSVG, 'ZoomOut');

// Re-export Image as ImageIcon for components that use this alias
export { Image as ImageIcon };

// Re-export IconProps type for consumers that need to type icon components
export type { IconProps, IconComponent, IconType } from './IconWrapper';
