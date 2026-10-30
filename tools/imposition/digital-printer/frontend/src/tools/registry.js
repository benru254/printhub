// Every tool in the imposition app. Add a tool here, give it a folder in
// frontend/src/tools/<id>/ and engine/tools/<id>/, and it appears on the file screen.
// status: 'ready' | 'soon'

export const TOOLS = [
  {
    id: 'cards',
    name: 'Cards, labels & stickers',
    desc: 'Repeat your design across a sheet. Rounded corners, circles and sticker-cutter lines too.',
    status: 'ready',
  },
  {
    id: 'booklet',
    name: 'Booklet',
    desc: 'Folded and stapled booklets: pages in the right order, blank pages and creep handled for you.',
    status: 'ready',
  },
  {
    id: 'cutstack',
    name: 'Numbered books & tickets',
    desc: 'Add numbers to receipts and tickets, or keep many pages in order after cutting (cut & stack).',
    status: 'ready',
  },
  {
    id: 'resize',
    name: 'Resize & add bleed',
    desc: 'Change the page size of a whole document and add missing bleed.',
    status: 'soon',
  },
  {
    id: 'poster',
    name: 'Posters & tiles',
    desc: 'Print a big poster in parts on smaller sheets.',
    status: 'soon',
  },
  {
    id: 'gang',
    name: 'Gang sheet',
    desc: 'Mix different designs on one sheet to save paper.',
    status: 'soon',
  },
];
