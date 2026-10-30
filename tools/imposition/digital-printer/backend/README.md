# Backend

Orders, tracking, staff accounts and customer files are handled by the shared PrintHub server
in [`/server`](../../../../server/README.md), because every tool uses them.

Tool-specific server code (for example building PDFs on the server for WhatsApp/Telegram bots,
using `../engine`) will go here later.
