import { load, save } from './systems/Storage';

export interface Theme {
  id: 'neon' | 'pop';
  name: string;
  bg: string;
  bgDecor: number;            // color of background particles / blots
  platform: number; platformTop: number; platformTopH: number;
  ink: number; inkFading: number; inkGlow: boolean; inkWash: number;
  ball: number; ballMark: number; ballGlow: boolean;
  font: string; titleFont: string;
  text: string; textDim: string; accent: string;
  meterBg: number; meterFill: number; meterLow: number;
  overlay: number; overlayAlpha: number;
  btnBg: number; btnText: string; btnRadius: number;
  deathTitle: string;
}

export const THEMES: Record<Theme['id'], Theme> = {
  neon: {
    id: 'neon', name: 'Neon Night',
    bg: '#070A14', bgDecor: 0x2a3a66,
    platform: 0x0e1426, platformTop: 0x4df3ff, platformTopH: 3,
    ink: 0x4df3ff, inkFading: 0x2a7f9a, inkGlow: true, inkWash: 0x4df3ff,
    ball: 0xff4fd8, ballMark: 0x070a14, ballGlow: true,
    font: '"Inter", system-ui, sans-serif', titleFont: '"Space Grotesk", system-ui, sans-serif',
    text: '#EAF6FF', textDim: '#7d8bb0', accent: '#FF4FD8',
    meterBg: 0x141b33, meterFill: 0x4df3ff, meterLow: 0xff4fd8,
    overlay: 0x070a14, overlayAlpha: 0.78,
    btnBg: 0x4df3ff, btnText: '#070A14', btnRadius: 36,
    deathTitle: 'Ink dried.',
  },
  pop: {
    id: 'pop', name: 'Pop Arcade',
    bg: '#FFD23F', bgDecor: 0xf2b705,
    platform: 0x232323, platformTop: 0x111111, platformTopH: 5,
    ink: 0x2b59ff, inkFading: 0x8aa2ff, inkGlow: false, inkWash: 0x111111,
    ball: 0xe5342b, ballMark: 0xffffff, ballGlow: false,
    font: '"Inter", system-ui, sans-serif', titleFont: '"Bungee", Impact, sans-serif',
    text: '#111111', textDim: '#5c4a00', accent: '#E5342B',
    meterBg: 0xffffff, meterFill: 0x2b59ff, meterLow: 0xe5342b,
    overlay: 0xffd23f, overlayAlpha: 0.9,
    btnBg: 0xe5342b, btnText: '#FFFFFF', btnRadius: 10,
    deathTitle: 'OUT OF INK!',
  },
};

const KEY = 'liveink.theme';
export function currentTheme(): Theme {
  return load(KEY, 0) === 1 ? THEMES.pop : THEMES.neon;
}
export function toggleTheme(): Theme {
  const next = currentTheme().id === 'neon' ? THEMES.pop : THEMES.neon;
  save(KEY, next.id === 'pop' ? 1 : 0);
  return next;
}
