// SIMPLE and PRO.
//   Simple (customers): size, quantity, paper, price, send. No sheets, margins or printer talk.
//   Pro (the shop, or anyone printing themselves): everything.
// Staff are always in Pro. Anyone else can switch it on from the top bar.
import { store } from './storage.js';
import { staffToken } from './api.js';

export const startsPro = () => !!staffToken.get() || store.get('proMode', false) === true;

// Tips that only make sense to the person running the printer. Hidden in Simple.
export const PRO_ONLY_NOTES = [
  'margin-guess', 'margin-smaller', 'booklet-print', 'book-print', 'plotter-how', 'plotter-two-sided', 'plotter-no-bleed',
  'marks-off', 'signatures', 'creep', 'grind', 'shared-cuts', 'shared-to-fit', 'no-duplex', 'duplex', 'empty-spots',
  'pages-no-made-bleed', 'bleed-clipped', 'bleed-made', 'bleed-guessed', 'bleed-short', 'no-bleed', 'corner-cutter',
  'ellipse-guillotine',
];
