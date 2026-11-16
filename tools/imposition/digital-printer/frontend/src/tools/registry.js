// Every tool in the imposition app. Add a tool here, give it a folder in
// frontend/src/tools/<id>/ and engine/tools/<id>/, and it appears on the file screen.
// status: 'ready' | 'soon'      pro: true = only shown in Pro (a tool for the shop, not for customers)

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
    id: 'perfectbound',
    name: 'Book (glued spine)',
    desc: 'Thick books and reports: inside pages in signatures, plus a wrap-around cover with the right spine width.',
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
    id: 'largeformat',
    name: 'Banners, posters & large prints',
    desc: 'Scale a design to any size for the roll printer: hems, eyelets, parts to join. Or tile a poster on small sheets.',
    status: 'ready',
    pro: true,
  },
  {
    id: 'gang',
    name: 'Gang sheet',
    desc: 'Mix different designs on one sheet to save paper.',
    status: 'soon',
  },
];
